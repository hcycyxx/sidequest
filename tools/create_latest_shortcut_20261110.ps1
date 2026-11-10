$ErrorActionPreference = 'Stop'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$installedRoot = Join-Path $env:LOCALAPPDATA 'Programs\SideQuestDesktop'
$installedExe = Join-Path $installedRoot 'SideQuest.exe'
if (-not (Test-Path -LiteralPath $installedExe)) { throw '未找到已安装的 SideQuest。' }
$shortcutPath = Join-Path $desktopPath 'SideQuest 最新版.lnk'
$sequence = 2
while (Test-Path -LiteralPath $shortcutPath) {
    $shortcutPath = Join-Path $desktopPath ("SideQuest 最新版_v{0}.lnk" -f $sequence)
    $sequence++
}
$shellObject = New-Object -ComObject WScript.Shell
$shortcut = $shellObject.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $installedRoot
$shortcut.IconLocation = "$installedExe,0"
$shortcut.Description = 'SideQuest 最新安装版'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Output $shortcutPath
