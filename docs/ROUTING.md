# 内置工具优先，DeepSeek 自动兜底

[README](../README.md) · [客户端配置](CLIENTS.md)

当用户的问题需要实时外部信息或网页内容时，模型按以下策略选择工具，不需要用户每次说出 MCP 名称。

| 情况 | 行为 |
| --- | --- |
| agent 自身搜索工具可用，例如 WebSearch | 优先内置搜索 |
| agent 自身网页读取工具可用，例如 WebFetch | 优先内置抓取 |
| 对应能力未提供、当前供应商不支持、额度耗尽、服务暂不可用、技术性错误或超时 | 在现有权限范围内自动使用对应的 `deepseek_search` / `deepseek_fetch` |
| 内置搜索成功但结果为空 | 视为有效结果；必要时改进查询，不因此自动换付费提供商 |
| 用户拒绝授权、工具权限拒绝、安全限制、登录/付费墙或目标站点限制 | 不通过 MCP 绕过 |
| 用户明确要求用 DeepSeek | 在允许的情况下遵循用户选择 |
| 不需要联网，或用户禁止联网/此提供商 | 不调用 |

搜索和抓取**分别判断**。例如 WebSearch 不可用但 WebFetch 可用时，用 DeepSeek 搜索，再用 WebFetch 读取结果。不要同时调用两个提供商做相同工作；会话中已确认某内置能力不可用时，不要每次重复试探。新会话或已知恢复后再优先内置工具。

## 如何生效

1. MCP 握手的 `instructions` 提供上述策略。
2. 两个工具的 `description` 都强调它们是内置能力不可用时的 fallback。
3. Claude Code 安装器额外写入用户规则 `~/.claude/rules/deepseek-web-fallback.md`，在每个项目的新会话中加载；尊重 `CLAUDE_CONFIG_DIR` 自定义目录。

这是模型遵循的工具选择规则，**不是底层强制路由**。MCP 进程无法查看宿主内置工具是否成功，也无法直接执行或拦截 WebSearch/WebFetch。客户端需要把工具说明/服务说明暴露给模型；模型、客户端规则配置和上下文会影响遵循情况。规则不改变客户端审批机制。其他 agent 可使用 MCP 自带说明，也可把相同策略加入其支持的持久指令文件。

Claude Code 用户规则机制与限制见[官方文档](https://code.claude.com/docs/en/memory#user-level-rules)。规则是上下文指导，不是安全强制机制；禁用用户规则加载或存在冲突指令时，不能保证执行。

## 已有用户启用

已注册 MCP 的用户不必删除重装，执行一次以下命令即可安装/更新规则。

Windows PowerShell：

```powershell
npx.cmd -y --package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main deepseek-search-fetch-mcp --install-claude-rules
```

macOS/Linux：

```sh
npx -y --package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main deepseek-search-fetch-mcp --install-claude-rules
```

本地源码构建后也可运行：

```sh
node dist/index.js --install-claude-rules
```

重启 Claude Code；可在 `/context` 中核对规则是否已加载。MCP 源码也应更新至包含 fallback 说明的版本；本地注册用户先 `git pull`、`npm ci`。GitHub 注册用户使用新版本代码，固定 commit/tag 的用户需更新固定版本。

命令可重复运行，不产生付费 API 请求，不读取或修改 Key。只管理自己的 Markdown 标记区，保留标记区外的文字和其他规则；遇到同名非托管文件会报错并保留原文件，不强制覆盖。`--setup-claude` 和 Windows `install.ps1` 默认安装规则；仅以 stdio 启动服务不会写本机规则。

## 关闭与卸载

只移除本项目管理的规则区块：

```sh
node dist/index.js --remove-claude-rules
```

GitHub 安装者把上一节 npx 命令的 `--install-claude-rules` 换成 `--remove-claude-rules` 即可。若文件剩余自定义文字，会保留；不删除其他规则或注册。规则移除后，MCP 服务说明和工具描述仍表达内置优先的默认偏好，但不再有额外的 Claude Code 用户规则。

完整卸载还需执行 `claude mcp remove --scope user deepseek-web`。Windows 安装器可加 `-SkipRoutingRules` 跳过规则安装。

## 验证范围

自动测试验证握手说明、工具描述、规则安装/更新/卸载、原文件保留、配置目录隔离和安装器集成。测试不调用真实模型，也不宣称已证明所有模型都能正确选择或切换工具。真实验收可观察：内置成功时没有 MCP 请求；内置能力不存在或技术性失败时转用对应 MCP；权限/安全拒绝时不切换绕过。

DeepSeek 兜底请求可能计费；仅安装规则、MCP 握手和列工具不会调用 Search/Fetch API。
