"""Private, authenticated local WorkBuddy bridge. Never changes other applications."""
import base64
import ctypes
from ctypes import wintypes
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import threading
import time
from urllib import request,error,parse
import paths
import state_store as store

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('桥接不接受重定向')

def _protect(value,decrypt=False):
    class Blob(ctypes.Structure):_fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_byte))]
    buffer=ctypes.create_string_buffer(value);source=Blob(len(value),ctypes.cast(buffer,ctypes.POINTER(ctypes.c_byte)));result=Blob()
    crypt=ctypes.windll.crypt32
    if decrypt:
        function=crypt.CryptUnprotectData;function.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
    else:
        function=crypt.CryptProtectData;function.argtypes=[ctypes.POINTER(Blob),wintypes.LPCWSTR,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
    function.restype=wintypes.BOOL
    if not function(ctypes.byref(source),None,None,None,None,1,ctypes.byref(result)):raise OSError('无法使用本机凭据保护，请用原 Windows 用户登录')
    try:return ctypes.string_at(result.data,result.size)
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes=[ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(ctypes.cast(result.data,ctypes.c_void_p))

class WorkBuddy:
    def __init__(self):
        self.folder=Path(paths.DATA_DIR)/'workbuddy_v11_4';self._guard=threading.RLock()
        self.opener=request.build_opener(request.ProxyHandler({}),NoRedirect())

    def _token(self):
        path=self.folder/'control.dpapi'
        if path.exists():return _protect(path.read_bytes(),True).decode('ascii')
        value=secrets.token_hex(32)
        with path.open('xb') as stream:stream.write(_protect(value.encode('ascii')))
        return value

    def _state(self):
        try:
            value=json.loads((self.folder/'service.json').read_text(encoding='utf-8'))
            return value if isinstance(value,dict) else {}
        except FileNotFoundError:return {}
        except (OSError,ValueError):raise ValueError('桥接状态无法读取，已保留原文件')

    @staticmethod
    def _running(pid):
        if type(pid) is not int or pid<=0:return False
        kernel=ctypes.windll.kernel32
        kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        handle=kernel.OpenProcess(0x1000,False,pid)
        if not handle:return False
        try:
            code=wintypes.DWORD()
            return bool(kernel.GetExitCodeProcess(handle,ctypes.byref(code))) and code.value==259
        finally:kernel.CloseHandle(handle)

    def _read(self,url,headers=None,data=None,timeout=8):
        body=json.dumps(data).encode('utf-8') if data is not None else None
        with self.opener.open(request.Request(url,data=body,headers=headers or {}),timeout=timeout) as response:
            raw=response.read(4*1024*1024+1)
        if len(raw)>4*1024*1024:raise ValueError('桥接响应过大')
        return json.loads(raw.decode('utf-8'))

    def _verified(self,state,token):
        port=state.get('port')
        if type(port) is not int or not 18993<=port<=19012:return None
        challenge=secrets.token_hex(24)
        try:
            result=self._read('http://127.0.0.1:'+str(port)+'/health?challenge='+challenge,timeout=1)
            expected=hmac.new(token.encode('ascii'),challenge.encode(),hashlib.sha256).hexdigest()
            if result.get('service')=='sidequest-workbuddy' and isinstance(result.get('proof'),str) and hmac.compare_digest(result['proof'],expected):return result
        except (OSError,ValueError,TimeoutError):pass
        return None

    def ensure(self):
        with self._guard:
            self.folder.mkdir(parents=True,exist_ok=True)
            with store.state_lock(self.folder/'service.json',timeout=30):
                token=self._token();state=self._state()
                if self._verified(state,token):return state,token
                if self._running(state.get('pid')):raise ValueError('内置桥接正在启动或暂时未响应，请稍后重试；没有重复启动')
                node=Path(paths.bundled('workbuddy_runtime/node.exe'))
                if not node.exists():
                    import shutil
                    found=shutil.which('node.exe')
                    if not found:raise ValueError('没有找到随包 Node 运行组件，请重新安装完整包')
                    node=Path(found)
                entry=Path(paths.bundled('bridge_workbuddy_v11_4/sidequest.mjs'))
                for port in range(18993,19013):
                    probe=socket.socket()
                    try:probe.bind(('127.0.0.1',port))
                    except OSError:probe.close();continue
                    probe.close();environment=os.environ.copy()
                    environment.update(SIDEQUEST_BRIDGE_CONTROL=token,SIDEQUEST_BRIDGE_DATA=str(self.folder/'accounts'),SIDEQUEST_BRIDGE_PORT=str(port))
                    logs=self.folder/'bridge.log'
                    with logs.open('ab') as stream:
                        child=subprocess.Popen([str(node),str(entry)],cwd=entry.parent,env=environment,stdin=subprocess.DEVNULL,stdout=stream,stderr=stream,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                    state={'port':port,'pid':child.pid}
                    store._atomic_write(self.folder/'service.json',state)
                    deadline=time.monotonic()+25
                    while time.monotonic()<deadline:
                        if child.poll() is not None:break
                        if self._verified(state,token):store._atomic_write(self.folder/'service.json',state);return state,token
                        time.sleep(.15)
                    if child.poll() is None:raise ValueError('桥接仍在启动，请稍后再试；未停止任何已有桥接')
                raise ValueError('无法启动内置桥接，请查看本机桥接日志')

    def rpc(self,path,data=None):
        allowed={'/api/accounts','/api/accounts/select','/api/accounts/import-desktop','/api/login/start','/api/login/poll','/api/login/cancel','/api/ccswitch/config','/api/models'}
        if path not in allowed:raise ValueError('不支持的桥接操作')
        state,token=self.ensure()
        if not self._verified(state,token):raise ValueError('无法核对桥接身份，未发送凭据')
        try:return self._read('http://127.0.0.1:'+str(state['port'])+path,{'X-Admin-Token':token,'Content-Type':'application/json'},data,timeout=35)
        except error.HTTPError as exc:
            raise ValueError('WorkBuddy 操作未完成（HTTP '+str(exc.code)+'），请检查登录或网络') from None

    def connection(self):
        state,token=self.ensure();config=self.rpc('/api/ccswitch/config')
        expected='http://127.0.0.1:'+str(state['port'])+'/v1'
        if config.get('baseUrl')!=expected or not isinstance(config.get('apiKey'),str):raise ValueError('桥接连接信息不一致')
        return {'base_url':expected,'api_key':config['apiKey']}

    def accounts(self):
        result=self.rpc('/api/accounts');result['ok']=True;return result

    def login(self,region):
        if region not in ('cn','global'):raise ValueError('请选择国内版或国际版')
        result=self.rpc('/api/login/start',{'region':region});url=parse.urlsplit(result.get('verificationUri',''))
        domains={'cn':{'workbuddy.cn','www.workbuddy.cn','codebuddy.cn','www.codebuddy.cn'},'global':{'workbuddy.ai','www.workbuddy.ai','codebuddy.ai','www.codebuddy.ai'}}
        if url.scheme!='https' or url.hostname not in domains[region] or url.username or url.password or url.port not in (None,443):raise ValueError('登录地址与账号区域不一致，未打开')
        import qrcode
        image=qrcode.make(result['verificationUri']);output=io.BytesIO();image.save(output,format='PNG')
        return {'ok':True,**result,'qr':'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode('ascii')}
