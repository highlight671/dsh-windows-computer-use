# DeepSeek Harness Windows 电脑操作插件

为 DeepSeek Harness 提供 Windows 桌面观察、点击、输入与结果验收，附带 `windows-computer-use` Skill。底层使用 [Windows-MCP](https://github.com/CursorTouch/Windows-MCP)，通过 Harness 原生 MCP 桥接连接。这是社区集成项目。

**0.1.0 预览版。** 已有本机的 Harness 记事本端到端验收经验；独立插件的验证范围见下方。首次使用请先做安全验收。

项目地址：[highlight671/dsh-windows-computer-use](https://github.com/highlight671/dsh-windows-computer-use) · [版本下载](https://github.com/highlight671/dsh-windows-computer-use/releases)

## 插件和 Skill 分别做什么

| 部分 | 作用 |
| --- | --- |
| 原生组合包插件 | 接入 MCP 服务，注册操作 Skill 与持续有效的安全提示；插件停用时由宿主释放注册与连接。 |
| Skill | 指导模型先观察、再操作、重新观察并核验结果；处理已确认的普通弹窗，按需截图并安全收尾。 |
| Windows-MCP | 执行 Windows 界面的观察、点击、输入等实际动作。 |

只复制 Skill 不会获得电脑控制工具。只安装工具也不代表模型会正确验收。推荐安装完整插件。

## 支持范围

- Windows x64；本机基础验收在 Windows 11、Harness **0.2.1-rc.2** 完成。
- Node.js 22+；安装脚本需已有 **uv 0.13.5**，从 [uv 官方发行页](https://github.com/astral-sh/uv/releases/tag/0.13.5) 获取。
- 私有运行时：Python **3.14.9**、Windows-MCP **0.8.8**。Python 依赖版本在 `requirements-windows.txt` 固定；这是版本锁定清单，不是全量带哈希的供应链锁文件。
- 模型需支持工具调用；视觉验收还需当前模型路由与 Harness 附件功能支持图片输入。

固定开放九个工具：`App`、`Snapshot`、`Screenshot`、`Click`、`Type`、`Scroll`、`Wait`、`WaitFor`、`ControlStatus`。使用 stdio，不启动 HTTP 监听；关闭 Windows-MCP 匿名遥测。不开放 MCP 的 PowerShell、Registry、FileSystem、Process、Clipboard、Shortcut 接口。

## 安装

先下载并解压发布页的 ZIP，或克隆对应版本：

```powershell
git clone --branch v0.1.0 https://github.com/highlight671/dsh-windows-computer-use.git
cd dsh-windows-computer-use
```

### 1. 准备独立运行时

从仓库根目录运行。默认仅展示计划，不下载、不修改配置：

```powershell
node .\scripts\setup-runtime.mjs
```

确认计划后安装：

```powershell
node .\scripts\setup-runtime.mjs --apply
```

`uv.exe` 不在 PATH 中时，以 `--uv 'C:\Tools\uv.exe'` 指定其实际位置。脚本使用 uv 下载托管 Python，再从 PyPI 安装固定版本的二进制包，不执行 Python 源码构建。使用现有网络代理环境，不修改系统代理。

默认目录为 `$DSH_HOME\tools\dsh-windows-computer-use`，没有 `DSH_HOME` 时为用户主目录下的 `.dsh\tools\dsh-windows-computer-use`。目录必须不存在，路径中不能有符号链接/目录联接。安装失败保留该目录供排错，不自动递归删除。脚本不会写 Harness profile、全局 AGENTS、注册表、启动项或安全设置。

### 2. 只读检查

使用上一步创建的私有 Python；默认配置根示例：

```powershell
$runtime = Join-Path $env:USERPROFILE '.dsh\tools\dsh-windows-computer-use'
& (Join-Path $runtime '.venv\Scripts\python.exe') .\scripts\probe.py --runtime $runtime
```

自定义了 `DSH_HOME` 或 `--root` 时，使用实际目录。检查只发现工具并调用 `ControlStatus`，不截图、不点击、不输入。用户接管/忙碌状态不等同于工具接入失败。

### 3. 安装原生插件

在 Harness 的插件管理页中安装**本仓库的绝对目录**，或使用固定版本的 Git 安装地址：

```text
git+https://github.com/highlight671/dsh-windows-computer-use.git#v0.1.0
```

`package.json` 声明了 `dsh.bundle.patch`，因此它是 Harness 可识别的组合包插件，而不只是配置片段。插件没有安装生命周期脚本，不会在加载时自行下载软件；上面的独立运行时仍需先准备好。

如果曾手工配置过 namespace 为 `windows` 的 MCP 客户端，先在空闲时停用那条旧配置，避免两套服务重名或争抢桌面。本插件不会擅自删除旧配置。

运行时使用自定义目录时，在 profile patch 中覆盖本插件行：

```yaml
- id: windows-computer-use
  name: dsh-windows-computer-use
  config:
    runtimeRoot: 'D:\HarnessTools\dsh-windows-computer-use'
```

默认目录无需该覆盖。遵循宿主提示重载或正常重启。未发现工具时检查插件诊断，不更改权限绕过错误。

## 使用

示例任务：

> 使用 windows-computer-use Skill，只操作指定应用。完成操作后从实际界面确认结果；普通提示读清内容后主动处理；截图按需获取，默认不额外导出副本。允许清理仅由本次运行创建且已无用途的临时文件，保留交付物和用户数据。

首次安全验收：

> 使用 windows-computer-use Skill，按记事本安全验收流程验证能力。只使用新建空白页，输入短标记后实际读回并看图核对；不保存、不覆盖、不关闭已有文档，保留未保存测试页供我查看。

该验收规程位于 Skill 的 `references/acceptance.md`。日常任务不会自动重复验收。模型无法读取图片时必须报告视觉验收未完成。

## 安全、截图与收尾

- 保留上游用户空闲/接管保护；0.8.8 的物理输入空闲等待为 10 秒。紧急接管键：**Ctrl+Alt+Shift+Backspace**。用户正在操作时代理停止输入，一次只运行一个桌面控制代理。
- 已确认且不改变数据或权限的普通提示可以主动处理。登录、密码、权限和安全提示交给用户。发送、覆盖、删除等动作遵循用户已有的具体授权；Skill 本身不授予额外操作权限。
- 截图默认直接作为工具结果使用，不另存重复副本。只在用户要求图片交付或确需保留证据时导出。没有参考管理接口时不直接删除 Harness 内部附件、日志或共享缓存；工具图片可能仍被会话持久保存。**本插件没有底层附件垃圾回收功能。**
- 获得本次清理授权后，仅逐项清理明确记录了当前任务创建证据、准确路径且已无用途的临时文件；不递归删除目录，保留用户文件、交付物和排错证据。没有文件管理工具时如实报告清理受限，不增开 MCP 接口或绕道执行删除命令。

工具白名单、UIA 进程排除与提示词规则不构成完整系统沙箱。App/点击/输入仍有广泛能力；排除 UIA 进程不能阻止所有截图或坐标操作；Harness 原有文件/终端工具的权限也不因此改变。插件依赖模型遵守规则，不能保证任意任务均成功。

## 停用与升级

在 Harness 中停用或卸载本组合包。宿主释放子 MCP 连接、Skill 提供方及安全提示；某些 profile 需要正常重启后生效。已有会话里的历史 Skill 文字和图片不会被改写或删除。

停用不删除 Python 运行时、备份或其他配置。本版本不提供递归卸载脚本。升级需先审查新版本；现有运行时目录不会被安装脚本覆盖。自定义新运行时目录时按上文设置 `runtimeRoot`。

## 验证与开发

```powershell
node --test tests/runtime.test.mjs tests/plugin.test.mjs
```

测试覆盖路径与链接拒绝、安装默认不修改磁盘、拒绝覆盖已有目录、运行时完整性检查、工具范围、Skill 与提示词注册。另已实跑全新运行时安装、只读 MCP 探测，以及使用宿主原生 API 的插件连接与释放测试。详细范围见 [验证记录](docs/VALIDATION.md)；这些检查不代表已经完成独立插件的 GUI 安装验收，也不取代实际界面验收。

兼容依据：Harness 0.2.1-rc.2 的 `dsh-mcp-client`、`dsh-skill`、`dsh-system-prompt`、`dsh-app-boot` 公开包文档和本机基础验收。其他 Harness 或 Windows-MCP 版本需重新验证。

## 许可证与发布内容

本插件使用 MIT 许可证，上游归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。发布仅包含插件代码、Skill、版本清单、配置模板和测试，不包含用户配置、令牌、会话、截图、Python/uv 二进制或安装目录。
