# Build with the existing Python installation; add the verified UI-runtime packages.
from pathlib import Path
import os
import sys
ROOT=Path(SPECPATH).resolve().parent
UI_SITE=Path(os.environ['LOCALAPPDATA'])/'SideQuestV10Runtime/Lib/site-packages'
sys.path[:0]=[str(ROOT/'.installer_build_v11_5/deps'),str(UI_SITE)]
from PyInstaller.utils.hooks import collect_data_files,collect_dynamic_libs,collect_submodules

hidden=['completion_notice_v11_5','windows_toasts','winrt','winrt.windows.ui.notifications','winrt.windows.data.xml.dom','paths','state_store','task_policy','summary_html','daily_summary','inference_control','ctl',
        'process_control_v11','service_lifecycle_v11','llm_engine','llm_engine_v11','win_watch','content_probe','doc_reader',
        'app_v11','bridge_core','desktop_core','timeline_core','settings_web_v11_4','workbuddy_v11_4','tray_v11_4','tray_popup_v11_4','qrcode','qrcode.image.pil','task_archive_v11_3','tray','pystray._win32',
        'installed_adapter','installed_app_v11','llm_engine_runtime_v11_4','pythonnet','clr','clr_loader','cffi','_cffi_backend',
        'webview','webview.platforms.winforms','webview.platforms.edgechromium','webview.platforms.win32',
        'PIL._tkinter_finder','tkinter','xlrd','win32com.client','comtypes.client','comtypes.gen.UIAutomationClient',
        'winsdk.windows.globalization','winsdk.windows.graphics.imaging','winsdk.windows.media.ocr','winsdk.windows.storage.streams']
datas=[(str(ROOT/'.installer_build_v11_5/deps/windows_toasts-1.3.1.dist-info'),'windows_toasts-1.3.1.dist-info'),(str(ROOT/'bridge_workbuddy_v11_4'),'bridge_workbuddy_v11_4'),(str(ROOT/'.installer_build_v11_5/node.exe'),'workbuddy_runtime'),(str(ROOT/'.installer_build_v11_5/NODE_LICENSE.txt'),'workbuddy_runtime'),(str(ROOT/'ui/web_settings'),'ui/web_settings'),(str(ROOT/'ui/web_core'),'ui/web_core'),(str(ROOT/'ui/current_release.json'),'ui'),
       (str(ROOT/'assets/sidequest.ico'),'assets'),(str(ROOT/'installer_v11_5/resources/llm.default.json'),'config'),
       (str(ROOT/'installer_v11_5/resources/quest_state.example.json'),'config'),(str(ROOT/'installer_v11_5/resources/meta.json'),'portable')]
binaries=[('C:\\Users\\Blank\\AppData\\Local\\Programs\\Python\\Python312\\vcruntime140.dll', 'workbuddy_runtime'), ('C:\\Users\\Blank\\AppData\\Local\\Programs\\Python\\Python312\\vcruntime140_1.dll', 'workbuddy_runtime')]
for package in ('webview','pythonnet','clr_loader','rapidocr','onnxruntime','winsdk'):
    datas+=collect_data_files(package)
    binaries+=collect_dynamic_libs(package)
hidden+=collect_submodules('rapidocr')+collect_submodules('windows_toasts')+collect_submodules('winrt')
hidden+=['onnxruntime.capi._pybind_state','onnxruntime.capi.onnxruntime_pybind11_state']
a=Analysis([str(ROOT/'installer_v11_5/entry.py')],pathex=[str(ROOT),str(ROOT/'engine'),str(ROOT/'ui'),str(ROOT/'installer_v11_5'),str(UI_SITE)],
    binaries=binaries,datas=datas,hiddenimports=hidden,hookspath=[],runtime_hooks=[],
    excludes=['matplotlib','scipy','pandas','notebook','IPython','PyQt5','PyQt6','PySide2','PySide6','cefpython3','torch','tensorflow','onnxruntime.quantization','onnxruntime.tools'],
    noarchive=False)
pyz=PYZ(a.pure)
exe=EXE(pyz,a.scripts,[],exclude_binaries=True,name='SideQuest',debug=False,bootloader_ignore_signals=False,
        strip=False,upx=False,console=False,disable_windowed_traceback=False,icon=str(ROOT/'assets/sidequest.ico'))
coll=COLLECT(exe,a.binaries,a.datas,strip=False,upx=False,name='SideQuest')
