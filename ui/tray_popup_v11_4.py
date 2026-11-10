"""Modeless rounded tray popup drawn on the existing WinForms UI dispatcher."""
import ctypes
from ctypes import wintypes

def show(desktop):
    from System import Action
    def create():
        from System.Drawing import Color,Font,FontStyle,Size,Point,ContentAlignment
        from System.Windows.Forms import Form,FormBorderStyle,FormStartPosition,Button,FlatStyle,Panel,Screen,Cursor,Keys,Padding
        prior=getattr(desktop,'_tray_popup',None)
        if prior is not None and not prior.IsDisposed:prior.Close()
        palettes={'glass':('#14171f','#232a38','#f1f5fc','#a8b7cc','#ffd166'),
                  'transparent':('#182330','#2b3c4e','#ffffff','#cfdaea','#ffe1a0'),
                  'journal':('#f4efe3','#eae1ce','#342e29','#6b6054','#96623b'),
                  'night':('#101b25','#1c2e3c','#edf8ff','#abc4d6','#8ae8ff')}
        bg,hi,fg,muted,accent=map(ColorTranslator,palettes.get(desktop._bridge._prefs.get('skin'),palettes['glass']))
        scale=desktop._window.native.DeviceDpi/96.;width=round(240*scale);row=round(34*scale);pad=round(9*scale)
        popup=Form();popup.FormBorderStyle=getattr(FormBorderStyle,'None');popup.ShowInTaskbar=False;popup.TopMost=True
        popup.BackColor=bg;popup.KeyPreview=True;popup.Text='SideQuest';popup.StartPosition=FormStartPosition.Manual;desktop._tray_popup=popup
        entries=[('显示 SideQuest','panel'),('打开今日总结','summary'),('立即生成总结','generate'),('外观与设置','settings')]
        if not getattr(desktop._tray,'_history',[]):entries.append(('历史总结（暂无）',None))
        for item in getattr(desktop._tray,'_history',[])[:5]:entries.append(('历史总结 · '+str(item['date']),'summary:'+str(item['date'])))
        entries.append(('退出 SideQuest','quit'))
        popup.ClientSize=Size(width,pad*2+row*len(entries));buttons=[]
        for index,(label,action) in enumerate(entries):
            button=Button();button.Text=label;button.FlatStyle=FlatStyle.Flat;button.FlatAppearance.BorderSize=0
            button.BackColor=bg;button.ForeColor=accent if index==0 else fg
            if action is None:button.Enabled=False;button.ForeColor=muted
            button.TextAlign=ContentAlignment.MiddleLeft;button.Padding=Padding(round(10*scale),0,0,0)
            button.Font=Font('Microsoft YaHei UI',10,FontStyle.Bold if index==0 else FontStyle.Regular)
            button.SetBounds(pad,pad+index*row,width-2*pad,row);button.TabIndex=index
            button.MouseEnter+=lambda sender,event: setattr(sender,'BackColor',hi)
            button.MouseLeave+=lambda sender,event: setattr(sender,'BackColor',bg)
            def choose(sender,event,command=action):popup.Close();desktop._tray._emit(command)
            button.Click+=choose;popup.Controls.Add(button);buttons.append(button)
        point=Cursor.Position;work=Screen.GetWorkingArea(point)
        popup.Location=Point(max(work.Left,min(point.X-width,work.Right-width)),max(work.Top,min(point.Y-popup.Height,work.Bottom-popup.Height)))
        popup.Deactivate+=lambda sender,event:popup.Close()
        popup.KeyDown+=lambda sender,event:popup.Close() if event.KeyCode==Keys.Escape else None
        popup.Show();popup.Activate();buttons[0].Focus()
        handle=int(popup.Handle.ToInt64());gdi=ctypes.windll.gdi32;user=ctypes.windll.user32
        gdi.CreateRoundRectRgn.restype=wintypes.HRGN;gdi.CreateRoundRectRgn.argtypes=[ctypes.c_int]*6
        user.SetWindowRgn.argtypes=[wintypes.HWND,wintypes.HRGN,wintypes.BOOL]
        region=gdi.CreateRoundRectRgn(0,0,popup.Width+1,popup.Height+1,round(20*scale),round(20*scale))
        if region and not user.SetWindowRgn(handle,region,True):gdi.DeleteObject(region)
    desktop._window.native.BeginInvoke(Action(create))

def ColorTranslator(value):
    from System.Drawing import ColorTranslator as Translator
    return Translator.FromHtml(value)
