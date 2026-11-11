"""Native Windows toast; called only after a task completion was committed."""
from concurrent.futures import ThreadPoolExecutor
_pool=ThreadPoolExecutor(max_workers=1,thread_name_prefix='SideQuest-toast')
_toaster=None
_notifications=[]

def notify(title):
    future=_pool.submit(_deliver,title)
    def finished(result):
        error=result.exception()
        if error:
            import logging
            logging.warning('Windows notification unavailable: %s',type(error).__name__)
    future.add_done_callback(finished)

def _deliver(title):
    global _toaster
    import ctypes,winreg
    from windows_toasts import Toast,InteractableWindowsToaster
    if _toaster is None:
        ctypes.windll.ole32.CoInitializeEx(None,0)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,r'Software\Classes\AppUserModelId\SideQuest.Desktop') as key:winreg.SetValueEx(key,'DisplayName',0,winreg.REG_SZ,'SideQuest')
        _toaster=InteractableWindowsToaster('SideQuest',notifierAUMID='SideQuest.Desktop')
    toast=Toast();toast.text_fields=['任务已完成',title,'当前任务将按卡片顺序接续。']
    _notifications.append(toast)
    del _notifications[:-20]
    _toaster.show_toast(toast)
