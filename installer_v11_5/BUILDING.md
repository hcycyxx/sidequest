# V11.5.0 构建说明

Windows 10/11 x64，Python 3.12、PyInstaller 6、Inno Setup 6。源码包只包含源码和文档，不包含个人数据、账号、Node 二进制或微软离线安装器。

1. 在 `%LOCALAPPDATA%\SideQuestV10Runtime` 建立 Python 虚拟环境，按项目的 `requirements-ui-v10-lock.txt` 安装界面依赖。
2. 基础 Python 环境安装 PyInstaller、qrcode、rapidocr、onnxruntime、comtypes、winsdk、xlrd、pywin32。版本需与构建环境匹配；本版仅记录已有环境的编译结果，未做全新环境部署验收。
3. 建立 `.installer_build_v11_5`，将官方 Windows x64 Node.js 26.1.0 的 `node.exe` 和其 LICENSE（命名为 `NODE_LICENSE.txt`）放入该目录。Node 官方下载入口为 https://nodejs.org/dist/v26.1.0/ 。
4. 将微软官方 WebView2 x64 离线安装器和 .NET Framework 4.8 离线安装器放入 `.portable_build_v11/prerequisites`，文件名分别为 `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`、`NDP48-x86-x64-AllOS-ENU.exe`。下载入口与旧版一致： https://go.microsoft.com/fwlink/?linkid=2124701 、 https://go.microsoft.com/fwlink/?linkid=2088631 。
5. 检查 `build_installed.spec` 的 `UI_SITE` 与 `binaries` 中 VC 运行库路径，按当前 Python 安装位置调整；不要使用其他电脑的绝对路径。

在项目根目录执行：

```powershell
python -m PyInstaller --noconfirm --workpath .installer_build_v11_5/work --distpath .installer_build_v11_5/dist installer_v11_5/build_installed.spec
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" installer_v11_5/SideQuestSetup.iss
```

安装器输出到桌面。已有同名产物时先改用新文件名，保留旧文件。官方发布安装器的哈希见 `BUILD_RESULT_20261110.json`；源码和文档后续更新不代表重新编译了程序。

不要把 `.installer_build_*`、`.portable_build_*`、运行时数据或账号库提交到 Git。若要运行扫码、模型或界面测试，按用户要求先确认。
