# 已有方案与功能状态

核对日期：2026-10-24。本项目提供 Windows-MCP 与 DeepSeek Harness 的社区集成，重点是可检查的安装配置、中文操作验收及本次临时产物的收尾流程。这些是本仓库的具体交付选择，不代表独有性或相对其他项目的安全优势。

## 已有方案与来源

下表基于上游说明及三个相关项目的 README，链接固定到所核对的相关项目提交。没有安装或完整审计这些项目，因此这里只确认已有公开方案，不作运行效果或安全性排名。文档未提及某项功能，也不能推断该项目没有它。

| 来源 | 已有的公开说明 | 与本项目的关系 |
| --- | --- | --- |
| [CursorTouch/Windows-MCP](https://github.com/CursorTouch/Windows-MCP) | Windows 桌面观察与输入、工具选择、用户空闲和紧急接管保护。 | 本项目的桌面控制依赖；这些底层能力归上游，本插件只选择与配置。 |
| [helloHub1212/dsh-windows-mcp](https://github.com/helloHub1212/dsh-windows-mcp/blob/103c9d76705d4822c2029429dbb1a466b28e7c46/README.md) | 使用 Harness 原生 MCP 桥接 Windows-MCP 的组合包插件；文档还描述了诊断工具和默认关闭、可在调度时拒绝调用的电脑操作开关。 | 同一接入路径已有直接先例；原生桥接、固定版本和禁用遥测均不能作为本项目的独创声明。 |
| [jing-hy/computer-user](https://github.com/jing-hy/computer-user/blob/91728cf164cb77a42284ee2c476f1b678cb3466a/README.md) | Windows 电脑操作插件；说明包含先定位窗口、观察、单次操作后截图验证，以及手动审批模式。 | “操作后再观察并验证”和安全操作流程已有先例；其底层输入实现不同。 |
| [wushi2333/dsh-computer-use_codex-style](https://github.com/wushi2333/dsh-computer-use_codex-style/blob/f5b352177c7fea528599324223fa2598502715f7/README.md) | 电脑操作插件配套 Skill 与持续安全提示；说明包含重新观察、观察失效检查、应用授权和不可信内容边界。 | “电脑操作插件＋Skill＋安全策略”的打包方式已有先例；本项目没有复现其底层引擎或授权机制。 |

发现线索来自 [DSH 插件市场](https://github.com/losebird/dsh-plugin-market) 和 [awesome-deepseek-harness](https://github.com/Dominic789654/awesome-deepseek-harness)，上表结论以项目自身文档为依据。这是有限范围的相关工作核对，不是穷尽检索。相关项目在此作为参考链接列出；本次核对未引入其代码、Skill 或其他文件。实际依赖的归属和许可证见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

## 本版本实际交付了什么

| 项目 | 实现位置 | 执行方式及边界 |
| --- | --- | --- |
| Harness 原生集成与停用释放 | [插件入口](../src/index.mjs)、[组合包声明](../package.json)、[加载配置](../cordis.patch.yml) | 代码注册 MCP 子插件、Skill 和安全提示，生命周期由 Harness/Cordis 管理；复用宿主 API。 |
| 固定九个工具、本地 stdio | [运行时与工具配置](../src/runtime.mjs) | 代码向上游传入准确的 `--tools` 列表；不开放 MCP 的终端、文件、注册表等接口。工具选择机制来自上游，不构成系统沙箱，也不限制宿主其他工具。 |
| 独立运行时安装保护 | [安装脚本](../scripts/setup-runtime.mjs)、[运行时检查](../src/runtime.mjs) | 默认只展示计划，明确 `--apply` 才安装；拒绝覆盖已有根目录、拒绝链接路径、固定依赖版本、不注册系统 Python 或全局入口，并在加载时检查配置摘要。版本清单不是全量带哈希的供应链锁，摘要也不是签名。 |
| 不操作桌面的接入检查 | [协议探测](../scripts/probe.py)、[测试](../tests/) | 发现准确的九个工具并调用 `ControlStatus`；不截图、不输入。检查通过只能证明接入情况，不能证明具体界面任务完成。 |
| 持续安全规则与普通弹窗处理 | [安全规则](../skills/windows-computer-use/references/safety.md)、[注册入口](../src/index.mjs) | 代码注入规则，模型按规则执行；普通弹窗先读清再处理，敏感操作沿用用户具体授权。这不是插件强制的逐操作授权或应用隔离。 |
| 操作后重新观察并核验 | [操作 Skill](../skills/windows-computer-use/SKILL.md) | 模型执行观察、操作、复查；要求从实际界面确认，不能把工具成功回执当成任务成功。没有看图能力时须报告视觉验收未完成。 |
| 不保存文件的记事本验收 | [验收规程](../skills/windows-computer-use/references/acceptance.md) | 用户请求时，模型在新空白页输入短标记、读回、看图核对；保留未保存测试页。它是操作规程，不是插件自动执行的 GUI 测试。 |
| 截图最小化与本次产物收尾 | [操作 Skill](../skills/windows-computer-use/SKILL.md)、[安全规则](../skills/windows-computer-use/references/safety.md) | 默认直接观察工具图片、不导出重复副本。已有清理授权和文件管理能力时，模型按准确路径及本次创建证据逐个清理冗余文件，并核实结果；不递归清目录。插件没有自动文件删除钩子。 |

这里的“安全策略＋验收＋清理”是组合设计重点。“清理”的具体内容是限制归属、授权、保留证据和报告实际结果的规则；不能据此声称已实现附件自动回收，也不能据有限检索声称这个组合没有先例。

## 验证边界与尚未提供的能力

本版本已有 10 项 Node 测试、全新运行时安装、真实 MCP 只读探测和宿主原生 API 下的连接与释放验证。详细证据及范围见 [验证记录](VALIDATION.md)。此前本机集成的记事本验收，不等于独立发布插件已通过 GUI 安装及完整桌面验收。

本插件没有独立桌面输入或截图引擎，没有强制模型完成验收的调度门禁，也没有内置逐操作授权或应用隔离机制。工具范围和提示词只能降低部分风险，仍依赖模型、宿主及上游实现。

本插件没有 Harness 内部附件引用管理、聊天截图自动删除或后台垃圾回收。会话可能继续保存工具图片；不能为实现“收尾”而直接删附件对象、会话日志或共享缓存。用户文件、交付物、指定证据以及恢复排错需要的文件应保留。

## 公开介绍的建议表述

> 面向 DeepSeek Harness 的 Windows-MCP 社区集成插件，提供固定九工具配置、独立运行时安装检查，以及中文的安全操作、记事本验收和本次临时产物收尾 Skill。复用上游桌面能力；已有相关接入与安全验收方案，本文档明确列出来源和实现边界。
