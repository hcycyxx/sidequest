<div align="center">
  <h1>SideQuest</h1>
  <p><strong>把主线、支线与下一步行动，留在桌面上。</strong></p>
  <p><img alt="Windows" src="https://img.shields.io/badge/platform-Windows-0078D6"> <img alt="源码 V11.4" src="https://img.shields.io/badge/source-V11.4-B56C43"> <a href="https://github.com/hcycyxx/sidequest/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/hcycyxx/sidequest?color=3B77A1"></a></p>
</div>

Windows AI 桌面任务面板：自动整理主线、支线和可勾选步骤，记录时间轴并生成日报。**内置 WorkBuddy 扫码桥接，可接入账号可用的 HY3 / HY4 等模型，在官方限免或账号免费额度内免费使用。** 也支持自填本地或云端兼容 API。

## 本次更新：WorkBuddy 桥接

- 在设置页扫码登录国内版 / 国际版 WorkBuddy，选择账号和模型后即可识别任务。
- 可使用账号模型列表中的 **HY3、HY4** 等模型，无需另外填写云端 API Key。
- 安装包已附带桥接与 Node.js，换电脑无需单独部署桥接；新电脑需要首次授权。
- **想“白嫖”模型：使用官方标记为限免或账号享有免费额度的模型。** 活动时段、每日额度、地区及超额后的积分消耗，以 WorkBuddy 当前账号和模型页面为准；SideQuest 不提供永久、无限免费额度。
- 同时更新了统一风格的托盘菜单、可关闭的错误提示、日报进度与自动重连。

[WorkBuddy 模型说明](https://free-plat-test.qcloudcdn.com/docs/workbuddymini/features/Select-Model) · [本版完整更新记录](docs/RELEASE_V11_4_20261110.md)

## 文件怎么找

| 文件夹 / 入口 | 用途 |
| --- | --- |
| `ui/`、`engine/` | 当前界面、后台与任务逻辑 |
| `bridge_workbuddy_v11_4/` | 复用的 WorkBuddy 桥接内核 |
| `installer_v11_4/` | 当前安装包的构建源码 |
| `docs/` | 使用、更新和发布文档 |
| `archive/` | 旧入口、启动脚本和安装版源码 |
| `sidequest_latest.py` | 最新版源码启动入口 |

旧发布说明已归入 `docs/history/`。[完整目录导航](docs/REPOSITORY_LAYOUT.md) · [历史归档说明](archive/README.md)

## 效果预览

以下是用户提供的实际界面截图。拍摄时处于暂停状态；主面板暂无任务，不代表任务识别或模型连接已验收。

### 主面板与时间轴

<p>
  <a href="docs/images/main-panel-20261109.png"><img src="docs/images/main-panel-20261109.png" alt="SideQuest 主面板：暂停状态，暂无主线任务" width="280"></a>
  <a href="docs/images/timeline-20261109.png"><img src="docs/images/timeline-20261109.png" alt="SideQuest 时间轴：窗口停留记录" width="280"></a>
</p>

### 主题与外观设置

从左到右：轻透悬浮、杂志手账、夜航 HUD；另支持深蓝玻璃主题。

<p>
  <a href="docs/images/theme-transparent-20261109.png"><img src="docs/images/theme-transparent-20261109.png" alt="轻透悬浮主题的外观设置" width="200"></a>
  <a href="docs/images/theme-journal-20261109.png"><img src="docs/images/theme-journal-20261109.png" alt="杂志手账主题的外观设置" width="200"></a>
  <a href="docs/images/theme-night-20261109.png"><img src="docs/images/theme-night-20261109.png" alt="夜航 HUD 主题的外观设置" width="200"></a>
</p>

截图为此次详细设置页改版前采集的主面板与外观页，并非 V11.3 模型设置页的新截图。

## 版本与下载

本地最新开发版 **v11.5.0**：当前进行任务锁定至完成、按卡片顺序接续，移除下一步建议；AI 完成确认及 Windows 完成通知。见[本版说明](docs/RELEASE-v11.5.0.md)。以下下载仍指已发布的 v11.4.0。

当前版本：**V11.4 / v11.4.0**，由 `ui/current_release.json` 指定。历史 V11.3、V11.2 和 V1.1.0 保留供回退。

**[下载 V11.4 完整安装器](https://github.com/hcycyxx/sidequest/releases/download/v11.4.0/SideQuest-v11.4.0-windows-x64-setup.exe)** · **[完整源码与中文文档](https://github.com/hcycyxx/sidequest/releases/download/v11.4.0/SideQuest-v11.4.0-source-docs.zip)** · [版本发布页](https://github.com/hcycyxx/sidequest/releases/tag/v11.4.0)

## V11.4 更新

- 托盘菜单随主面板主题绘制，最小化直接收到托盘。
- 异常提示可以关闭；同色进度条区分等待与完成，日报生成结束后自动收起提示。
- 模型输出缺少 JSON 时尝试一次格式纠正，网络故障自动重试，保留原任务。
- 设置页新增 WorkBuddy 国内/国际账号扫码登录，内置 Node.js，无需另装 Node；也保留普通 API 接口。
- 保留背景透明度、自定义提示词、任务步骤和完整任务记录，以及窗口折叠修复。

[功能、登录与验证说明](docs/RELEASE_V11_4_20261110.md)。安装包已编译并在本机执行安装；**未运行界面、扫码、模型及跨机功能验收**。上方截图沿用已公开的历史界面，不作为 V11.4 实测截图。

## 功能

- 主线和支线任务、步骤勾选、展开与排序；手动操作优先保留。
- 桌面浮窗、贴边隐藏、托盘及每日总结。
- AI 判断完成后等待用户确认，不以模型判断直接替代用户验收。
- 模型地址、名称和密钥可配置；设置页提供获取模型与连通性按钮。
- V11.2 改善空模型响应、不兼容返回、重试等待及后台状态提示。

## 环境要求

Windows 桌面环境；源码界面使用 Python、pywebview 与 WebView2，当前设置页同样使用 pywebview。依赖见 `requirements-ui-v10.txt` 和锁定文件。OCR 及窗口读取按实际需要配置，模型服务需用户自行提供。

V11.4 完整安装包沿用既有微软组件方案，并增加独立 Node 运行组件，内含 Python、CPU OCR、WebView2 和 .NET 4.8 离线安装程序；缺少微软组件时可能需要管理员确认或重启。构建记录不等于跨电脑运行通过。

## 安装与启动

### 当前源码

仓库保留多代入口，当前使用 `sidequest_latest.py`。不要用旧 `install.ps1` 或旧 `sidequest.py` 的行为推断最新版。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-ui-v10.txt
.\.venv\Scripts\pythonw.exe sidequest_latest.py --panel
```

需要 Python 安装包含 tkinter，并具备可用的 WebView2/.NET 组件。以上直接打开面板，不等于配置完成后台；后台使用基础 Python 环境，窗口抓取和 OCR 依赖需按需在该环境安装。以上为按源码整理的步骤，本轮未完成全新电脑安装验收。`--open` 和 `launch_sidequest_latest.ps1` 另依赖本机预建的 `%LOCALAPPDATA%\SideQuestV10Runtime` 环境，不能直接视为通用安装器。

### V11.4 完整安装版

从 [v11.4.0 Release](https://github.com/hcycyxx/sidequest/releases/tag/v11.4.0) 下载完整安装器，先退出旧版再安装。沿用 `%LOCALAPPDATA%\Programs\SideQuestDesktop`，任务与设置保存在 `%LOCALAPPDATA%\SideQuestDesktop\data`。

## 使用与设置

首次进入设置，可填写兼容 API 的地址、模型名和密钥；或选择 WorkBuddy，扫码授权、选用账号和模型后保存，再由用户启动识别。新电脑需首次授权，不携带原电脑账号。获取模型与检测连通性只有点击相应按钮才请求接口，不等于模型推理测试。

面板中查看主线与支线，展开步骤、调整任务并确认完成；托盘可显示面板、打开设置和退出。需要暂停时在面板操作，退出前确认后台状态。

源码运行的配置在项目 `config` 目录；V11.2 安装版数据在 `%LOCALAPPDATA%\SideQuestDesktop\data`，安装目录为 `%LOCALAPPDATA%\Programs\SideQuestDesktop`。旧 V1.1.0、便携版与新版安装版的数据路径不同，不能混用。

## 隐私与模型请求

窗口标题、文档片段或 OCR 文字可能进入本地记录，并按配置发送给所选模型接口；是否离开本机取决于接口地址。OCR 在本地处理不代表后续模型请求也是本地。请先确认内容抓取开关与接口服务。

密钥、真实任务、客户记录、窗口历史和每日总结不应提交到 GitHub。关闭抓取、暂停识别等操作以当前界面及配置为准。

## 更新、回退与卸载

更新前退出旧版并备份数据，保存新版到独立目录。使用设置页的导入功能时只选择自己确认过的旧配置。

V11.2 安装版从 Windows 已安装应用中卸载，按版本说明默认保留使用数据；便携版退出后移除对应目录前先备份 `data`。源码版退出面板与后台后保留或备份 `config`、总结，再移除项目目录。旧版本源码与压缩包均保留。

## 构建与验证

当前构建描述为 `installer_v11_4/build_installed.spec` 与 `installer_v11_4/SideQuestSetup.iss`。参见 [V11.4 构建说明](installer_v11_4/BUILDING.md)及[构建记录](installer_v11_4/BUILD_RESULT_20261110.json)。

已完成源码检查、PyInstaller 与 Inno Setup 编译、本机安装及启动命令。按用户要求，未做应用界面、扫码授权、真实模型调用和跨机功能验收。编译成功与安装成功不代表这些功能已经验收。

## 常见问题

- **下载到旧版**：先核对 Release 标签；当前安装版为 v11.3.0，V11.2 和 V1.1.0 是保留的历史版本。
- **后台活着但没有任务更新**：查看最近识别时间、模型错误与本地日志；进程存活不等于推理成功。
- **源码界面无法打开**：检查依赖、WebView2、.NET 和当前入口，不要重复运行多个版本。

<!-- jack-white-rice-support:start -->
## 请大肥鱼吃大白饭 🍚

如果这个项目帮到了你，欢迎请大肥鱼吃一碗大白饭。自愿投喂，量力而行，感谢支持！

<p>
  <a href="assets/support/alipay-jack-v1.jpg"><img src="assets/support/alipay-jack-v1.jpg" alt="Jack 的支付宝收款码：请大肥鱼吃大白饭" height="320"></a>
  <a href="assets/support/rice-meme-v1.png"><img src="assets/support/rice-meme-v1.png" alt="大肥鱼端碗表情包：饭呢？" height="320"></a>
</p>
<!-- jack-white-rice-support:end -->

## 文档与许可

[V11.3 改进与使用](docs/history/releases/RELEASE_Settings_V11_3_20261109.md) · [V11.2 安装说明](docs/history/releases/RELEASE_Installer_V11_2_20261107.md) · [V11.1 设置改进](docs/history/releases/RELEASE_Settings_V11_1_20261107.md) · [历史 README 原文](docs/README_legacy_before_20261109.md)

历史 README 记录旧入口与行为，仅供回溯；其中相对路径按原仓库根目录解释。项目尚未声明独立开源许可证；第三方资源仍遵循各自许可，不能以依赖的许可证替代本项目授权。
