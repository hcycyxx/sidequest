"""Frameless settings using the approved SideQuest web UI. No work on import."""
import json
import math
import os
from pathlib import Path
import socket
import sys
import threading
from urllib import request, error, parse

ROOT=Path(__file__).resolve().parents[1]
for directory in (ROOT/'engine',ROOT/'ui'):
    if str(directory) not in sys.path:sys.path.insert(0,str(directory))
import paths
import state_store as store

def read(path,default=None):
    try:
        value=json.loads(Path(path).read_text(encoding='utf-8-sig'))
        if not isinstance(value,dict):raise ValueError('配置格式不正确。')
        return value
    except FileNotFoundError:return dict(default or {})
    except (OSError,ValueError):raise ValueError('现有配置无法读取，已保留原文件。请先修复配置再保存。')

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise ValueError('接口要求重定向，请直接填写最终接口地址后重试。')

def valid_url(value):
    if not isinstance(value,str):raise ValueError('请填写接口地址。')
    value=value.strip().rstrip('/');parts=parse.urlsplit(value)
    if parts.scheme not in ('http','https') or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError('请填写完整的 http / https 接口地址，不要把密钥写在地址中。')
    return value

def number(value,low,high,label):
    if isinstance(value,bool):raise ValueError(label+'需要填写整数。')
    try:
        result=int(value)
        if float(value)!=result:raise ValueError()
    except (ValueError,TypeError,OverflowError):raise ValueError(label+'需要填写整数。')
    if not low<=result<=high:raise ValueError(label+'应在 '+str(low)+'–'+str(high)+' 范围内。')
    return result

class SettingsAPI:
    def __init__(self):
        self._window=None;self.lock=threading.RLock();self.saving=False
        self.initial_font=read(paths.config('ui.json')).get('font_size',10)
        from workbuddy_v11_4 import WorkBuddy
        self._workbuddy=WorkBuddy();self._login_urls={}

    def load(self):
        from llm_engine_runtime_v11_4 import SYSTEM_PROMPT,effective_prompt
        llm=read(paths.config('llm.json'));ui=read(paths.config('ui.json'));prefs=read(paths.config('ui_v10.json'))
        return {'ok':True,'config':{key:(effective_prompt(llm) if key=='system_prompt' else llm.get(key,default)) for key,default in {
            'base_url':'http://127.0.0.1:8899/v1','api_key':'','model':'deepseek-v4.1-flash','interval_seconds':60,
            'content_capture':True,'doc_read':True,'content_level':'light','ocr_engine':'auto','system_prompt':effective_prompt(llm),'connection_mode':'manual'}.items()},
            'ui':{'font_size':ui.get('font_size',10),'summary_hour':ui.get('summary_hour',18),
                  'panel_opacity':prefs.get('panelOpacity',ui.get('panel_opacity',100))},'skin':prefs.get('skin','glass')}

    def models(self,payload):
        try:
            if not isinstance(payload,dict):raise ValueError('连接设置格式不正确。')
            base=valid_url(payload.get('base_url'));key=str(payload.get('api_key') or '').strip()
            headers={'Accept':'application/json'}
            if key:headers['Authorization']='Bearer '+key
            with request.build_opener(NoRedirect()).open(request.Request(base+'/models',headers=headers),timeout=8) as response:
                raw=response.read(2*1024*1024+1)
            if len(raw)>2*1024*1024:raise ValueError('模型列表过大，请手动填写模型名称。')
            data=json.loads(raw.decode('utf-8-sig'));rows=data.get('data') if isinstance(data,dict) else None
            if not isinstance(rows,list):raise ValueError('接口已响应，但没有兼容的模型列表；可手动填写模型名称。')
            models=sorted({row['id'].strip() for row in rows if isinstance(row,dict) and isinstance(row.get('id'),str) and row['id'].strip()},key=str.casefold)[:1000]
            return {'ok':True,'models':models}
        except error.HTTPError as exc:
            reason={401:'密钥未通过认证',403:'当前密钥没有访问权限',404:'接口未提供 /models，可手动填写模型名；这不代表聊天接口不可用',429:'接口限流，请稍后再试'}.get(exc.code,'接口返回错误')
            return {'ok':False,'error':'HTTP '+str(exc.code)+'：'+reason}
        except (socket.timeout,TimeoutError):return {'ok':False,'error':'连接超时，请核对地址或确认接口服务已启动。'}
        except error.URLError:return {'ok':False,'error':'无法连接接口，请核对地址、网络和接口服务。'}
        except (ValueError,UnicodeError) as exc:return {'ok':False,'error':str(exc) if not isinstance(exc,json.JSONDecodeError) else '接口未返回兼容的 JSON 模型列表。'}
        except Exception:return {'ok':False,'error':'连接检查未完成，请稍后再试。'}

    def import_config(self):
        try:
            import webview
            names=self._window.create_file_dialog(webview.FileDialog.OPEN,allow_multiple=False,file_types=('接口配置 (*.json)',))
            if not names:return {'ok':True,'cancelled':True}
            path=Path(names[0])
            if path.stat().st_size>1024*1024:raise ValueError('配置文件过大。')
            data=json.loads(path.read_text(encoding='utf-8-sig'))
            if not isinstance(data,dict):raise ValueError('配置格式不正确。')
            return {'ok':True,'config':{key:data[key] for key in ('base_url','api_key','model') if isinstance(data.get(key),str)}}
        except (OSError,ValueError):return {'ok':False,'error':'导入失败，请选择旧版 llm.json 接口配置文件。'}

    def save(self,payload):
        with self.lock:
            try:
                if not isinstance(payload,dict):raise ValueError('设置格式不正确。')
                base=valid_url(payload.get('base_url'));model=str(payload.get('model') or '').strip()
                if not model:raise ValueError('请填写模型名称。')
                prompt=payload.get('system_prompt')
                if not isinstance(prompt,str) or not prompt.strip():raise ValueError('任务识别提示词不能为空。')
                if len(prompt)>64000:raise ValueError('提示词过长，请控制在 64000 字以内。')
                update={'base_url':base,'model':model,'api_key':str(payload.get('api_key') or '').strip(),
                    'interval_seconds':number(payload.get('interval_seconds'),30,3600,'分析间隔'),'system_prompt':prompt}
                mode=payload.get('connection_mode','manual')
                if mode not in ('manual','workbuddy'):raise ValueError('连接方式不正确')
                update['connection_mode']=mode
                if mode=='workbuddy':
                    accounts=self._workbuddy.accounts()
                    if not accounts.get('activeId'):raise ValueError('请先扫码登录并选用 WorkBuddy 账号')
                    update.update(self._workbuddy.connection())
                    update['workbuddy_account']=accounts['activeId']
                for key in ('content_capture','doc_read'):
                    if type(payload.get(key)) is not bool:raise ValueError('监测选项格式不正确。')
                    update[key]=payload[key]
                for key,options in [('content_level',('off','light','full')),('ocr_engine',('auto','rapid','windows','off'))]:
                    if payload.get(key) not in options:raise ValueError('监测选项不正确。')
                    update[key]=payload[key]
                font=number(payload.get('font_size'),8,16,'面板字号')
                display={'summary_hour':number(payload.get('summary_hour'),0,23,'日报时间'),
                         'panel_opacity':number(payload.get('panel_opacity'),20,100,'面板不透明度')}
                if font!=self.initial_font:display['font_size']=font
                llm_path=Path(paths.config('llm.json'));ui_path=Path(paths.config('ui.json'))
                llm_path.parent.mkdir(parents=True,exist_ok=True)
                # Keep concurrent changes and unknown settings; lock order is stable.
                with store.state_lock(llm_path),store.state_lock(ui_path):
                    previous=read(llm_path);llm={**previous,**update};ui={**read(ui_path),**display}
                    store._atomic_write(ui_path,ui);store._atomic_write(llm_path,llm)
                self.initial_font=font
                return {'ok':True,'needsStart':not previous.get('api_key') and bool(update['api_key']),
                        'message':'已保存。外观将自动同步；提示词从下一轮识别开始使用。'}
            except (ValueError,OSError,TimeoutError) as exc:return {'ok':False,'error':'设置未全部保存：'+str(exc)[:180]}

    def start(self):
        try:
            config=read(paths.config('llm.json'))
            if not config.get('api_key'):raise ValueError('请先填写密钥并保存。')
            import process_control_v11
            process_control_v11.start_workers()
            return {'ok':True,'message':'后台已启动，请切到实际工作窗口等待识别。'}
        except Exception as exc:return {'ok':False,'error':'后台未启动：'+str(exc)[:140]}

    def wb_action(self,action,payload=None):
        payload=payload if isinstance(payload,dict) else {}
        try:
            if action=='accounts':return self._workbuddy.accounts()
            if action=='login':
                result=self._workbuddy.login(payload.get('region'))
                self._login_urls[result['loginId']]=result['verificationUri'];return result
            if action in ('poll','cancel'):
                login_id=payload.get('loginId')
                if login_id not in self._login_urls:raise ValueError('登录已结束，请重新扫码')
                result=self._workbuddy.rpc('/api/login/'+action,{'loginId':login_id})
                if action=='cancel' or result.get('done'):self._login_urls.pop(login_id,None)
                return {'ok':True,**result}
            if action=='import':return {'ok':True,'account':self._workbuddy.rpc('/api/accounts/import-desktop',{'region':payload.get('region','cn')})}
            if action=='select':
                account_id=payload.get('accountId');accounts=self._workbuddy.accounts()
                if account_id not in {item.get('id') for item in accounts.get('accounts',[])}:raise ValueError('请选择一个已登录账号')
                self._workbuddy.rpc('/api/accounts/select',{'accountId':account_id})
                return {'ok':True,'connection':self._workbuddy.connection(),'accountId':account_id}
            if action=='open':
                url=self._login_urls.get(payload.get('loginId'))
                if not url:raise ValueError('登录已结束，请重新扫码')
                import subprocess
                choices=[Path(os.environ.get('ProgramFiles',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('LOCALAPPDATA',''))/'Google/Chrome/Application/chrome.exe']
                chrome=next((path for path in choices if path.is_file()),None)
                if not chrome:raise ValueError('未找到 Chrome，请使用手机扫描二维码')
                subprocess.Popen([str(chrome),url],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));return {'ok':True}
            raise ValueError('不支持的 WorkBuddy 操作')
        except Exception as exc:return {'ok':False,'error':str(exc)[:160] if isinstance(exc,(ValueError,OSError,TimeoutError)) else 'WorkBuddy 操作未完成，请稍后重试'}

    def window_action(self,action):
        if action=='close':self._window.destroy()
        elif action=='minimize':self._window.minimize()
        else:return {'ok':False,'error':'未知窗口操作'}
        return {'ok':True}

def main():
    import webview
    api=SettingsAPI();assets=Path(paths.bundled('ui/web_settings'))
    page=assets.joinpath('index.html').read_text(encoding='utf-8')
    page=page.replace('/*__SETTINGS_JS__*/',assets.joinpath('settings.js').read_text(encoding='utf-8'))
    page=page.replace('/*__WORKBUDDY_JS__*/',assets.joinpath('workbuddy.js').read_text(encoding='utf-8'))
    page=page.replace('/*__LOCAL_ICONS__*/',Path(paths.bundled('ui/web_core/vendor/lucide.min.js')).read_text(encoding='utf-8'))
    screen=webview.screens[0]
    width=max(420,min(680,round(screen.width)-40));height=max(400,min(820,round(screen.height)-60))
    api._window=webview.create_window('SideQuest 设置',html=page,js_api=api,width=width,height=height,
        min_size=(420,400),frameless=True,easy_drag=False,resizable=True,text_select=True,background_color='#14171f')
    webview.start(gui='edgechromium',private_mode=True,debug=False)
    return 0

if __name__=='__main__':raise SystemExit(main())
