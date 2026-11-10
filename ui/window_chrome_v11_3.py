# Reused from Jack's Codex Alarm V1.8 native window shell.
# Adds configurable minimum dimensions; keeps native move, resize and taskbar behavior.
"""Borderless glass header with native taskbar, resizing and window controls."""
import ctypes as C
from ctypes import wintypes as W


class POINT(C.Structure):
    _fields_ = [('x', W.LONG), ('y', W.LONG)]


class MINMAXINFO(C.Structure):
    _fields_ = [(name, POINT) for name in
                ('reserved', 'max_size', 'max_position', 'min_track', 'max_track')]


class MONITORINFO(C.Structure):
    _fields_ = [('size', W.DWORD), ('monitor', W.RECT), ('work', W.RECT), ('flags', W.DWORD)]


class STYLESTRUCT(C.Structure):
    _fields_ = [('old', W.DWORD), ('new', W.DWORD)]


class WindowChrome:
    """Only changes this application's HWND. No system settings are modified."""
    def __init__(self, root, min_width=600, min_height=480):
        self.root = root
        self.min_width, self.min_height = min_width, min_height
        self.u, self.g = C.windll.user32, C.windll.gdi32
        self.u.GetAncestor.argtypes = [W.HWND, W.UINT]
        self.u.GetAncestor.restype = W.HWND
        self.hwnd = self.u.GetAncestor(root.winfo_id(), 2)
        self.get_long = self.u.GetWindowLongPtrW
        self.set_long = self.u.SetWindowLongPtrW
        self.get_long.argtypes = [W.HWND, C.c_int]
        self.get_long.restype = C.c_ssize_t
        self.set_long.argtypes = [W.HWND, C.c_int, C.c_ssize_t]
        self.set_long.restype = C.c_ssize_t
        self.u.CallWindowProcW.argtypes = [C.c_void_p, W.HWND, W.UINT, W.WPARAM, W.LPARAM]
        self.u.CallWindowProcW.restype = C.c_ssize_t
        self.u.SetWindowPos.argtypes = [W.HWND, W.HWND, C.c_int, C.c_int, C.c_int, C.c_int, W.UINT]
        self.u.GetWindowRect.argtypes = [W.HWND, C.POINTER(W.RECT)]
        self.u.IsZoomed.argtypes = [W.HWND]
        self.u.ShowWindow.argtypes = [W.HWND, C.c_int]
        self.u.MonitorFromWindow.argtypes = [W.HWND, W.DWORD]
        self.u.MonitorFromWindow.restype = W.HANDLE
        self.u.GetMonitorInfoW.argtypes = [W.HANDLE, C.POINTER(MONITORINFO)]
        self.u.SetWindowRgn.argtypes = [W.HWND, W.HRGN, W.BOOL]
        self.g.CreateRoundRectRgn.argtypes = [C.c_int]*6
        self.g.CreateRoundRectRgn.restype = W.HRGN
        self.g.DeleteObject.argtypes = [W.HANDLE]
        self.region_size = None
        self.pointer_operation = None
        self.message_handlers = {}
        self.proc_type = C.WINFUNCTYPE(C.c_ssize_t, W.HWND, W.UINT, W.WPARAM, W.LPARAM)
        self.callback = self.proc_type(self._proc)
        self.previous = self.set_long(self.hwnd, -4, C.cast(self.callback, C.c_void_p).value)
        if not self.previous:
            raise OSError('无法创建融合标题栏')
        # Caption is drawn by the app. Retain the native shell and resizing styles.
        style = self.get_long(self.hwnd, -16)
        self.set_long(self.hwnd, -16, (style & ~0x00C00000) | 0x000F0000)
        ex = self.get_long(self.hwnd, -20)
        self.set_long(self.hwnd, -20, (ex | 0x00040000) & ~0x00000080)
        self.u.SetWindowPos(self.hwnd, None, 0, 0, 0, 0, 0x0027)
        self.update_region()
        root.bind('<Destroy>', self._destroy, add='+')

    def _old(self, hwnd, msg, wparam, lparam):
        return self.u.CallWindowProcW(self.previous, hwnd, msg, wparam, lparam)

    def _proc(self, hwnd, msg, wparam, lparam):
        try:
            handler = self.message_handlers.get(msg)
            if handler is not None:
                result = handler(hwnd, msg, wparam, lparam)
                if result is not None:return result
            if msg == 0x0083:  # WM_NCCALCSIZE, including activation recalculation.
                return 0
            if msg == 0x007C and C.c_ssize_t(wparam).value == -16:  # WM_STYLECHANGING
                style = C.cast(lparam, C.POINTER(STYLESTRUCT)).contents
                # Tk can restore WS_CAPTION while activating or mapping the window.
                style.new = (style.new & ~0x00C00000) | 0x000F0000
                return self._old(hwnd, msg, wparam, lparam)
            if msg == 0x0086:  # WM_NCACTIVATE: no legacy inactive caption.
                return 1
            if msg == 0x0085:  # WM_NCPAINT: app paints the entire surface.
                return 0
            if msg == 0x0084:  # WM_NCHITTEST
                rect = W.RECT()
                self.u.GetWindowRect(hwnd, C.byref(rect))
                x = C.c_short(lparam & 0xffff).value - rect.left
                y = C.c_short((lparam >> 16) & 0xffff).value - rect.top
                width, height = rect.right-rect.left, rect.bottom-rect.top
                if not self.u.IsZoomed(hwnd):
                    left, right = x < 7, x >= width-7
                    top, bottom = y < 7, y >= height-7
                    if top and left: return 13
                    if top and right: return 14
                    if bottom and left: return 16
                    if bottom and right: return 17
                    if left: return 10
                    if right: return 11
                    if top: return 12
                    if bottom: return 15
                # The client header implements pointer dragging itself. Returning
                # HTCAPTION here prevents the child canvas from receiving clicks.
                return 1
            if msg == 0x0024:  # WM_GETMINMAXINFO: respect taskbar work area.
                result = self._old(hwnd, msg, wparam, lparam)
                info = C.cast(lparam, C.POINTER(MINMAXINFO)).contents
                info.min_track.x, info.min_track.y = self.min_width, self.min_height
                monitor = MONITORINFO()
                monitor.size = C.sizeof(monitor)
                if self.u.GetMonitorInfoW(self.u.MonitorFromWindow(hwnd, 2), C.byref(monitor)):
                    info.max_position.x = monitor.work.left-monitor.monitor.left
                    info.max_position.y = monitor.work.top-monitor.monitor.top
                    info.max_size.x = monitor.work.right-monitor.work.left
                    info.max_size.y = monitor.work.bottom-monitor.work.top
                return result
            if msg in (0x0005, 0x0047):  # WM_SIZE / WM_WINDOWPOSCHANGED
                result = self._old(hwnd, msg, wparam, lparam)
                # Tk can finish changing the outer HWND inside its handler.
                # Measure only afterwards, otherwise the previous size clips it.
                self.update_region()
                return result
        except Exception:
            # Never allow Python exceptions to cross the Windows callback boundary.
            pass
        return self._old(hwnd, msg, wparam, lparam)

    def update_region(self):
        if self.u.IsZoomed(self.hwnd):
            if self.region_size != 'max':
                self.u.SetWindowRgn(self.hwnd, None, True)
                self.region_size = 'max'
            return
        rect = W.RECT()
        self.u.GetWindowRect(self.hwnd, C.byref(rect))
        size = (rect.right-rect.left, rect.bottom-rect.top)
        if size == self.region_size or min(size) < 1:
            return
        region = self.g.CreateRoundRectRgn(0, 0, size[0]+1, size[1]+1, 32, 32)
        if region:
            self.region_size = size
            if not self.u.SetWindowRgn(self.hwnd, region, True):
                self.g.DeleteObject(region)

    def minimize(self):
        self.u.ShowWindow(self.hwnd, 6)

    def rectangle(self):
        rect = W.RECT()
        self.u.GetWindowRect(self.hwnd, C.byref(rect))
        return rect.left, rect.top, rect.right, rect.bottom

    def begin_pointer(self, x, y, edges='move'):
        if self.u.IsZoomed(self.hwnd):
            if edges != 'move': return
            previous = self.rectangle()
            ratio = (x-previous[0])/max(1,previous[2]-previous[0])
            self.u.ShowWindow(self.hwnd,9)
            left,top,right,bottom = self.rectangle()
            self.u.SetWindowPos(self.hwnd,None,int(x-(right-left)*ratio),int(y-24),
                                right-left,bottom-top,0x0004)
        self.pointer_operation = (x,y,self.rectangle(),edges)

    def move_pointer(self, x, y):
        if not self.pointer_operation:return
        ox,oy,(left,top,right,bottom),edges = self.pointer_operation
        dx,dy = int(x-ox),int(y-oy)
        if edges == 'move':
            left+=dx;right+=dx;top+=dy;bottom+=dy
        else:
            if 'l' in edges:left=min(left+dx,right-self.min_width)
            if 'r' in edges:right=max(right+dx,left+self.min_width)
            if 't' in edges:top=min(top+dy,bottom-self.min_height)
            if 'b' in edges:bottom=max(bottom+dy,top+self.min_height)
        self.u.SetWindowPos(self.hwnd,None,left,top,right-left,bottom-top,0x0014)

    def end_pointer(self):
        self.pointer_operation = None

    def maximize(self):
        self.u.ShowWindow(self.hwnd, 9 if self.u.IsZoomed(self.hwnd) else 3)

    def _destroy(self, event):
        if event.widget is self.root and self.previous:
            self.set_long(self.hwnd, -4, self.previous)
            self.previous = None
