param(
    [string]$Python = 'python',
    [string]$ISCC = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    [string]$BuildId = (Get-Date -Format 'yyyyMMdd_HHmmss'),
    [string]$Prerequisites = '',
    [string]$OutputDirectory = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($BuildId -notmatch '^[A-Za-z0-9_-]+$') { throw 'BuildId 只能包含字母、数字、下划线和连字符。' }
$buildRoot = Join-Path $projectRoot ".installer_build_v11_3\build_$BuildId"
if (Test-Path -LiteralPath $buildRoot) { throw '构建目录已存在，请使用新的 BuildId。' }
if (-not $Prerequisites) { $Prerequisites = Join-Path $projectRoot '.installer_build_v11_3\prerequisites' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot "deliveries_v11_3_20261109\build_$BuildId" }
$installerFile = Join-Path $OutputDirectory 'SideQuest_V11_3_FullSetup_20261109.exe'
if (Test-Path -LiteralPath $installerFile) { throw '目标安装包已存在，请选择新的输出目录。' }
if (-not (Test-Path -LiteralPath $ISCC)) { throw '未找到 Inno Setup 编译器，请通过 -ISCC 指定。' }
foreach ($component in @('MicrosoftEdgeWebView2RuntimeInstallerX64.exe', 'NDP48-x86-x64-AllOS-ENU.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Prerequisites $component))) { throw "缺少微软离线组件：$component。此脚本不会自动下载或执行组件安装器。" }
}
New-Item -ItemType Directory -Path $buildRoot | Out-Null
Push-Location $projectRoot
try {
    & $Python -m PyInstaller --distpath (Join-Path $buildRoot 'dist') --workpath (Join-Path $buildRoot 'work') (Join-Path $PSScriptRoot 'build_installed_v2.spec')
    if ($LASTEXITCODE -ne 0) { throw '程序编译失败，未生成安装包。' }
    $payload = Join-Path $buildRoot 'dist\SideQuest'
    & $ISCC "/DBuildPayload=$payload" "/DBuildPrerequisites=$Prerequisites" "/DBuildOutput=$OutputDirectory" (Join-Path $PSScriptRoot 'SideQuestSetup_v4.iss')
    if ($LASTEXITCODE -ne 0) { throw '安装包编译失败。' }
    Get-Item -LiteralPath $installerFile | Select-Object FullName, Length
    Get-FileHash -LiteralPath $installerFile -Algorithm SHA256
} finally {
    Pop-Location
}
