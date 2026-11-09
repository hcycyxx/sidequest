"""SideQuest V11.3 settings presentation; V11.2 persistence/network logic is reused."""
import tkinter as tk
from tkinter import ttk
from settings_dialog_v11_2 import (
    SettingsWindow as PreviousSettingsWindow, palette_from as previous_palette,
    default_font, LEVELS, ENGINES, _read, _write,
)
from window_chrome_v11_3 import WindowChrome


def mix(a, b, amount):
    first = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    second = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * amount):02x}' for x, y in zip(first, second))


def palette_from(skin):
    palette = previous_palette(skin)
    palette['stroke'] = mix(palette['bg'], palette['text'], .14)
    palette['hover'] = mix(palette['hi'], palette['text'], .07)
    palette['danger'] = '#a83232' if int(palette['bg'][1:3], 16) > 150 else '#ff9e9e'
    return palette


def round_box(canvas, x1, y1, x2, y2, radius, **options):
    radius = min(radius, (x2 - x1) / 2, (y2 - y1) / 2)
    return canvas.create_polygon(
        x1 + radius, y1, x2 - radius, y1, x2, y1, x2, y1 + radius,
        x2, y2 - radius, x2, y2, x2 - radius, y2, x1 + radius, y2,
        x1, y2, x1, y2 - radius, x1, y1 + radius, x1, y1,
        smooth=True, splinesteps=24, **options)


class SoftButton(tk.Canvas):
    """A rounded surface around a real keyboard-accessible Tk button."""
    def __init__(self, parent, text, command, palette, accent=False):
        self.palette, self.accent, self.hovered = palette, accent, False
        self.disabled = False
        super().__init__(parent, bg=palette['bg'], highlightthickness=0,
                         height=42, bd=0, takefocus=False)
        self.button = tk.Button(
            self, text=text, command=command, font=(palette['family'], 10),
            bd=0, relief='flat', highlightthickness=0, padx=8, pady=4,
            cursor='hand2', takefocus=True)
        self.item = self.create_window(0, 0, window=self.button)
        self.configure(width=self.button.winfo_reqwidth() + 24)
        self.bind('<Configure>', lambda _event: self._draw())
        for widget in (self, self.button):
            widget.bind('<Enter>', lambda _event: self._hover(True), add='+')
            widget.bind('<Leave>', lambda _event: self._hover(False), add='+')
        self.button.bind('<FocusIn>', lambda _event: self._draw(), add='+')
        self.button.bind('<FocusOut>', lambda _event: self._draw(), add='+')
        self._draw()

    def configure(self, cnf=None, **options):
        if 'state' in options and hasattr(self, 'button'):
            value = options.pop('state')
            self.disabled = value == 'disabled'
            self.button.configure(state=value)
        result = super().configure(cnf, **options)
        if hasattr(self, 'button'):
            self._draw()
        return result

    config = configure

    def _hover(self, value):
        self.hovered = value
        self._draw()

    def _draw(self):
        p = self.palette
        width, height = max(self.winfo_width(), int(float(self.cget('width')))), 42
        color = p['gold'] if self.accent else p['hi']
        if self.hovered and not self.disabled:
            color = mix(color, p['text'] if not self.accent else p['bg'], .09)
        foreground = p['bg'] if self.accent else p['text']
        if self.disabled:
            color, foreground = p['hi'], p['muted']
        focused = self.button.focus_get() is self.button
        self.delete('surface')
        round_box(self, 1, 1, width - 1, height - 1, 9,
                  fill=color, outline=p['gold'] if focused else color,
                  width=2, tags='surface')
        self.tag_lower('surface')
        self.coords(self.item, width / 2, height / 2)
        self.button.configure(bg=color, fg=foreground, activebackground=color,
                              activeforeground=foreground, disabledforeground=p['muted'])


class Tabs(tk.Frame):
    def __init__(self, parent, palette):
        super().__init__(parent, bg=palette['bg'])
        self.palette, self.current, self.pages, self.buttons = palette, 0, [], []
        self.strip = tk.Frame(self, bg=palette['bg'])
        self.strip.pack(fill='x', padx=24)
        tk.Frame(self, height=1, bg=palette['stroke']).pack(fill='x', padx=24)
        self.body = tk.Frame(self, bg=palette['bg'])
        self.body.pack(fill='both', expand=True)

    def add(self, page, text):
        number = len(self.pages)
        self.pages.append(page)
        cell = tk.Frame(self.strip, bg=self.palette['bg'])
        cell.pack(side='left', padx=(0, 24))
        button = tk.Button(cell, text=text, font=(self.palette['family'], 10),
                           bg=self.palette['bg'], bd=0, relief='flat',
                           activebackground=self.palette['bg'],
                           activeforeground=self.palette['gold'],
                           highlightthickness=0, pady=12, cursor='hand2',
                           command=lambda: self.select(number))
        button.pack(fill='x')
        line = tk.Frame(cell, height=2)
        line.pack(fill='x')
        self.buttons.append((button, line))
        button.bind('<FocusIn>', lambda _event: line.configure(bg=self.palette['gold']))
        button.bind('<FocusOut>', lambda _event: self._paint())
        self.select(self.current)

    def select(self, number):
        for page in self.pages:
            page.pack_forget()
        self.current = int(number)
        self.pages[self.current].pack(fill='both', expand=True, in_=self.body)
        self._paint()

    def index(self, value):
        return self.current if value == 'current' else int(value)

    def _paint(self):
        for number, (button, line) in enumerate(self.buttons):
            selected = number == self.current
            button.configure(fg=self.palette['gold'] if selected else self.palette['muted'])
            line.configure(bg=self.palette['gold'] if selected else self.palette['bg'])


class SettingsWindow(PreviousSettingsWindow):
    """Only presentation is replaced; inherited validation/save/import/network methods remain."""
    def __init__(self, master, palette, on_saved=None):
        self._chrome = None
        super().__init__(master, palette, on_saved)
        # Tell Tk itself to keep the Windows caption absent. Removing WS_CAPTION
        # alone is insufficient: Tk can recreate its wrapper during mapping.
        self.top.overrideredirect(True)
        self.top.title('SideQuest 设置 · V11.3')
        self.top.geometry('760x740')
        self.top.minsize(600, 480)
        self.top.bind('<Alt-F4>', lambda _event: self.close())
        self.top.bind('<Control-s>', lambda _event: self.save())
        self.top.after_idle(self._install_chrome)

    def _install_chrome(self):
        if self._closed:
            return
        try:
            self.top.update_idletasks()
            self._chrome = WindowChrome(self.top, min_width=600, min_height=480)
        except Exception:
            # The custom header still supplies dragging and closing; do not bring
            # the disconnected native caption back when shell enhancement fails.
            self._chrome = None
            try:
                import ctypes
                from ctypes import wintypes
                user = ctypes.windll.user32
                user.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
                user.GetAncestor.restype = wintypes.HWND
                hwnd = user.GetAncestor(self.top.winfo_id(), 2)
                value = ctypes.c_int(int(self.pal['bg'][1:3], 16) < 150)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    wintypes.HWND(hwnd), 20, ctypes.byref(value), ctypes.sizeof(value))
            except Exception:
                pass

    def _styles(self):
        p = self.pal
        style = ttk.Style(self.top)
        style.theme_use('clam')
        style.configure('SQ3.TCombobox', background=p['hi'], fieldbackground=p['hi'],
                        foreground=p['text'], arrowcolor=p['muted'], bordercolor=p['hi'],
                        lightcolor=p['hi'], darkcolor=p['hi'], padding=(8, 5),
                        selectbackground=p['gold'], selectforeground=p['bg'])
        style.map('SQ3.TCombobox',
                  background=[('active', p['hi']), ('readonly', p['hi'])],
                  fieldbackground=[('readonly', p['hi'])],
                  bordercolor=[('focus', p['gold']), ('!focus', p['hi'])],
                  lightcolor=[('focus', p['gold']), ('!focus', p['hi'])],
                  darkcolor=[('focus', p['gold']), ('!focus', p['hi'])],
                  foreground=[('readonly', p['text'])])
        style.layout('SQ3.Vertical.TScrollbar', [('Vertical.Scrollbar.trough', {
            'sticky': 'ns', 'children': [('Vertical.Scrollbar.thumb', {
                'expand': '1', 'sticky': 'nswe'})]})])
        style.configure('SQ3.Vertical.TScrollbar', background=p['stroke'],
                        troughcolor=p['bg'], bordercolor=p['bg'], lightcolor=p['bg'],
                        darkcolor=p['bg'], borderwidth=0, width=8, arrowsize=0)
        style.map('SQ3.Vertical.TScrollbar', background=[('active', p['muted'])])
        for option, value in (('background', p['hi']), ('foreground', p['text']),
                              ('selectBackground', p['gold']), ('selectForeground', p['bg'])):
            self.top.option_add('*TCombobox*Listbox.' + option, value)

    def _button(self, parent, text, command, accent=False):
        return SoftButton(parent, text, command, self.pal, accent)

    def _window_button(self, parent, action):
        p = self.pal
        canvas = tk.Canvas(parent, width=40, height=40, highlightthickness=0,
                           bg=p['bg'], cursor='hand2', takefocus=True)
        def draw(_event=None):
            canvas.delete('all')
            if action == 'close':
                canvas.create_line(15, 15, 25, 25, fill=p['muted'], width=1.5)
                canvas.create_line(15, 25, 25, 15, fill=p['muted'], width=1.5)
            elif action == 'minimize':
                canvas.create_line(14, 21, 26, 21, fill=p['muted'], width=1.5)
            else:
                canvas.create_rectangle(15, 15, 25, 25, outline=p['muted'], width=1.3)
        def invoke(_event=None):
            if action == 'close':
                self.close()
            elif self._chrome:
                self._chrome.minimize() if action == 'minimize' else self._chrome.maximize()
            elif action == 'minimize':
                self.top.iconify()
            else:
                self.top.state('normal' if self.top.state() == 'zoomed' else 'zoomed')
        canvas.bind('<Enter>', lambda _event: canvas.configure(bg=p['hi']))
        canvas.bind('<Leave>', lambda _event: canvas.configure(bg=p['bg']))
        canvas.bind('<FocusIn>', lambda _event: canvas.configure(highlightthickness=1, highlightbackground=p['gold']))
        canvas.bind('<FocusOut>', lambda _event: canvas.configure(highlightthickness=0))
        canvas.bind('<Button-1>', invoke)
        canvas.bind('<Return>', invoke)
        canvas.bind('<space>', invoke)
        draw()
        canvas.pack(side='right', padx=(0, 2))
        return canvas

    def _page(self, title):
        p = self.pal
        container = tk.Frame(self.book, bg=p['bg'])
        self.book.add(container, text=title)
        canvas = tk.Canvas(container, bg=p['bg'], bd=0, highlightthickness=0, yscrollincrement=16)
        scroll = ttk.Scrollbar(container, orient='vertical', command=canvas.yview,
                               style='SQ3.Vertical.TScrollbar')
        canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y', padx=(0, 10), pady=12)
        canvas.pack(side='left', fill='both', expand=True)
        body = tk.Frame(canvas, bg=p['bg'])
        item = canvas.create_window(0, 0, window=body, anchor='nw')
        canvas.bind('<Configure>', lambda event: canvas.itemconfigure(item, width=event.width))
        body.bind('<Configure>', lambda _event: canvas.configure(scrollregion=canvas.bbox('all')))
        self._canvases.append(canvas)
        return body

    def _field(self, parent, label, key, value, hint='', secret=False, combo=False):
        p = self.pal
        row = tk.Frame(parent, bg=p['bg'])
        row.pack(fill='x', padx=26, pady=(16, 0))
        self._label(row, label).pack(anchor='w', pady=(0, 7))
        group = tk.Frame(row, bg=p['bg'])
        group.pack(fill='x')
        group.columnconfigure(0, weight=1)
        variable = tk.StringVar(value=str(value if value is not None else ''))
        self.vars[key] = variable
        if combo:
            widget = ttk.Combobox(group, textvariable=variable, style='SQ3.TCombobox',
                                  font=(p['family'], 10), state='normal')
        else:
            widget = tk.Entry(group, textvariable=variable, bg=p['hi'], fg=p['text'],
                              insertbackground=p['text'], font=(p['family'], 10),
                              relief='flat', bd=0, highlightthickness=1,
                              highlightbackground=p['hi'], highlightcolor=p['gold'],
                              selectbackground=p['gold'], selectforeground=p['bg'],
                              show='•' if secret else '')
        widget.grid(row=0, column=0, sticky='ew', ipady=9, ipadx=8)
        self._inputs[key] = widget
        if secret:
            shown = tk.BooleanVar(value=False)
            show = tk.Checkbutton(group, text='显示', variable=shown,
                                  command=lambda: widget.configure(show='' if shown.get() else '•'),
                                  bg=p['bg'], fg=p['muted'], selectcolor=p['hi'],
                                  activebackground=p['bg'], activeforeground=p['text'],
                                  font=(p['family'], 9), highlightthickness=0,
                                  takefocus=True, cursor='hand2')
            show.grid(row=0, column=1, padx=(12, 0))
        if hint:
            note = self._label(row, hint, muted=True)
            note.configure(font=(p['family'], 9), wraplength=550)
            note.pack(fill='x', pady=(6, 0))
            note.bind('<Configure>', lambda event: note.configure(wraplength=max(180, event.width)))
        return widget

    def _check(self, parent, key, text, value):
        p = self.pal
        variable = tk.BooleanVar(value=bool(value))
        self.vars[key] = variable
        button = tk.Checkbutton(parent, text=text, variable=variable, bg=p['bg'],
                                fg=p['text'], selectcolor=p['hi'], activebackground=p['bg'],
                                activeforeground=p['text'], font=(p['family'], 10),
                                anchor='w', justify='left', highlightthickness=0, cursor='hand2')
        button.pack(fill='x', padx=26, pady=(16, 0))
        button.bind('<Configure>', lambda event: button.configure(wraplength=max(200, event.width - 34)))

    def _note(self, parent, text):
        note = self._label(parent, text, muted=True)
        note.configure(font=(self.pal['family'], 9), wraplength=550)
        note.pack(fill='x', padx=26, pady=(12, 18))
        note.bind('<Configure>', lambda event: note.configure(wraplength=max(180, event.width)))
        return note

    def _build(self):
        p = self.pal
        header = tk.Frame(self.top, bg=p['bg'], height=56)
        header.pack(fill='x', padx=12, pady=(8, 0))
        title = self._label(header, 'SideQuest 设置', bold=True)
        title.configure(font=(p['family'], 12, 'bold'), padx=14, pady=12)
        title.pack(side='left')
        self._window_button(header, 'close')
        self._window_button(header, 'maximize')
        self._window_button(header, 'minimize')
        for widget in (header, title):
            widget.bind('<ButtonPress-1>', self._drag_begin)
            widget.bind('<B1-Motion>', self._drag_move)
            widget.bind('<ButtonRelease-1>', self._drag_end)
            widget.bind('<Double-Button-1>', lambda _event: self._chrome.maximize() if self._chrome else None)
        caption = self._label(self.top, '配置模型连接、内容监测和日报；保存不会主动调用模型。', muted=True)
        caption.configure(font=(p['family'], 9))
        caption.pack(fill='x', padx=26, pady=(0, 10))
        caption.bind('<Configure>', lambda event: caption.configure(wraplength=max(240, event.width)))
        footer = tk.Frame(self.top, bg=p['bg'])
        footer.pack(side='bottom', fill='x', padx=26, pady=(0, 18))
        tk.Frame(footer, height=1, bg=p['stroke']).pack(fill='x', pady=(0, 14))
        actions = tk.Frame(footer, bg=p['bg'])
        actions.pack(fill='x')
        self.status = self._label(actions, '', muted=True)
        self.status.configure(font=(p['family'], 9), wraplength=350)
        self.status.pack(side='left', fill='x', expand=True)
        self._button(actions, '保存设置', self.save, True).pack(side='right', padx=(10, 0))
        self._button(actions, '关闭', self.close).pack(side='right')
        actions.bind('<Configure>', lambda event: self.status.configure(wraplength=max(160, event.width - 230)))
        self.book = Tabs(self.top, p)
        self.book.pack(fill='both', expand=True)
        model = self._page('模型连接')
        monitor = self._page('监测与内容')
        display = self._page('界面与日报')
        self._field(model, '接口地址', 'base_url', self.llm.get('base_url', ''),
                    '填写 OpenAI 兼容的 /v1 地址，例如 http://127.0.0.1:8899/v1')
        self._field(model, 'API Key', 'api_key', self.llm.get('api_key', ''),
                    '填写目标电脑接口要求的密钥。仅保存在本地，不写入连接检查日志。', secret=True)
        self._field(model, '模型名称', 'model', self.llm.get('model', ''),
                    '请选择能稳定输出 JSON 的模型。获取列表成功不代表每个模型都适合任务识别。', combo=True)
        buttons = tk.Frame(model, bg=p['bg'])
        buttons.pack(fill='x', padx=26, pady=(14, 0))
        self.fetch_button = self._button(buttons, '获取模型', lambda: self._request_models('fetch'))
        self.fetch_button.pack(side='left')
        self.connect_button = self._button(buttons, '检测连通性', lambda: self._request_models('check'))
        self.connect_button.pack(side='left', padx=(8, 0))
        self._button(buttons, '导入旧配置', self.import_config).pack(side='left', padx=(8, 0))
        self.connection = self._note(model, '仅请求 /models，不发聊天消息、不消耗模型生成 Token。')
        self._field(model, '分析间隔（秒）', 'interval_seconds', self.llm.get('interval_seconds', 60),
                    '30–3600 秒，默认 60 秒；这是 AI 分析频率，不影响 2 秒窗口停留计时。')
        self._note(model, '接口检测由你点击后执行，保存设置不会自动检测。')
        self._check(monitor, 'content_capture', '读取窗口里显示的文字', self.llm.get('content_capture', True))
        self._check(monitor, 'doc_read', '允许读取 Excel / Word 的已保存原文作为辅助依据', self.llm.get('doc_read', True))
        label = self._label(monitor, '提供给模型的内容量', bold=True)
        label.pack(anchor='w', padx=26, pady=(24, 4))
        level = tk.StringVar(value=self.llm.get('content_level', 'light'))
        self.vars['content_level'] = level
        for key, text in LEVELS:
            tk.Radiobutton(monitor, text=text, value=key, variable=level, bg=p['bg'],
                           fg=p['text'], selectcolor=p['hi'], activebackground=p['bg'],
                           activeforeground=p['text'], font=(p['family'], 10),
                           highlightthickness=0, cursor='hand2').pack(anchor='w', padx=30, pady=6)
        engine = self._field(monitor, 'OCR 引擎', 'ocr_engine', self.llm.get('ocr_engine', 'auto'),
                             'auto 自动选择；rapid 使用 RapidOCR；windows 使用系统 OCR；off 关闭 OCR。', combo=True)
        engine.configure(values=[key for key, _ in ENGINES], state='readonly')
        self._note(monitor, '修改监测方式后，请在主面板暂停再继续，让后台重新加载配置。')
        old_font = self.ui.get('font_size', 10)
        self._initial_font = str(old_font if type(old_font) is int else 10)
        self._field(display, '面板字号', 'font_size', self._initial_font,
                    '范围 8–16。也可在主面板“外观与设置”中直接调整。')
        self._field(display, '日报生成时间', 'summary_hour', self.ui.get('summary_hour', 18),
                    '填写 0–23 的整点，默认 18 表示每天 18:00。')
        self._note(display, '保存设置不会生成日报，也不会执行接口检测。')

    def _drag_begin(self, event):
        if self._chrome:
            self._chrome.begin_pointer(event.x_root, event.y_root)
        else:
            self._drag_origin = (event.x_root - self.top.winfo_x(), event.y_root - self.top.winfo_y())

    def _drag_move(self, event):
        if self._chrome:
            self._chrome.move_pointer(event.x_root, event.y_root)
        elif hasattr(self, '_drag_origin'):
            x, y = self._drag_origin
            self.top.geometry(f'+{event.x_root - x}+{event.y_root - y}')

    def _drag_end(self, _event):
        if self._chrome:
            self._chrome.end_pointer()
