"""Keep the tray icon; route right click to the application's own popup."""
import threading
import tray as legacy

class Tray(legacy.Tray):
    def start(self):
        if legacy.pystray is None:return False
        owner=self
        class AppIcon(legacy.pystray.Icon):
            def _on_notify(self,wparam,lparam):
                if lparam==0x0205:owner._emit('traymenu')
                else:super()._on_notify(wparam,lparam)
        try:
            image=legacy._draw_icon();path=legacy._icon_path()
            if path:
                try:image=legacy.Image.open(path)
                except OSError:pass
            self.icon=AppIcon('sidequest',image,'SideQuest',menu=self._menu())
            self.thread=threading.Thread(target=self._run,daemon=True);self.thread.start()
            return True
        except Exception:self.icon=None;return False
