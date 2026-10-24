# 上游项目

本插件是社区集成项目，不代表 DeepSeek 或 Windows-MCP 官方。电脑控制由 [CursorTouch/Windows-MCP](https://github.com/CursorTouch/Windows-MCP) 提供，本插件负责 Harness 接入、固定工具范围、操作 Skill 和安装/验收流程。

Windows-MCP 0.8.8 通过 PyPI 单独安装；本仓库不包含其源码、Python 运行时、二进制包或依赖副本。Windows-MCP 的 MIT 许可如下：

```text
MIT License

Copyright (c) 2025 JEOMON GEORGE

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Harness 的 MCP 桥接、Skill 注册和提示词 API 来自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。本插件将其声明为宿主提供的 peer dependencies，不复制应用代码或打包本机配置。
