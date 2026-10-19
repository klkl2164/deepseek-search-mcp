# 实际验证记录

日期：2026-10-19，北京时间。操作系统：Windows，终端：PowerShell。

## 一键安装更新的验证

同日 16:27:13 运行 `npm run check`：构建与类型检查成功，**7 个测试文件、103 项测试全部通过**，耗时 4.48 秒。新增安装脚本测试以模拟 npm/Claude 命令验证：从其它工作目录安装时绝对路径和空格正确处理、构建失败后不注册、注册失败不删除已有服务。测试不写用户 Key、不注册真实 Claude 配置。

实际运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -CheckOnly` 成功，确认当前机器能找到 Node、npm、Claude。未实际运行会修改用户配置的安装模式。

已运行 `npm pack`，生成 `deepseek-search-fetch-mcp-1.0.0.tgz`，27 个文件，约 22.4 kB，包含已构建的可执行入口，不含测试、node_modules 或真实密钥。随后用官方 Inspector 启动 **npx + 本地 tgz 包** 验证，退出码 0 并列出 `deepseek_search`、`deepseek_fetch`。该验证清空 Key，仅执行 `tools/list`。未发布到公共 npm。

## 环境与依赖

- Node.js：`v24.11.1`
- MCP SDK：`@modelcontextprotocol/server@2.3.1`（官方 v2 包）
- Zod：`4.6.7`
- Undici：`7.30.1`
- TypeScript：`7.0.2`
- Vitest：`5.0.5`
- 已生成 `package-lock.json`，并实际执行 `npm ci` 重新安装验证（46 个包）。

官方 Search / Fetch schema、中文使用指南、SDK stdio 启动文档、Claude Code MCP 文档已在开发前在线核对，链接见 README。

## 构建、类型检查与自动测试

实际执行：

```powershell
npm ci
npm run check
```

首版运行于 16:20:57 开始，输出摘要（最新安装更新结果见上方）：

```text
> typecheck
> tsc --noEmit
                         # 退出码 0
> build
> tsc -p tsconfig.build.json
                         # 退出码 0
> pretest
> npm run build
                         # 退出码 0
> test
> vitest run

Test Files  6 passed (6)
     Tests  100 passed (100)
  Duration  2.68s
```

六个测试文件覆盖：

| 文件 | 已验证行为 |
| --- | --- |
| `tests/search.test.ts` | 官方字段映射、默认参数、原样搜索语法、空结果、Unicode query、参数越界、IP localization、正文裁切与响应 schema |
| `tests/fetch.test.ts` | 中文/emoji 码点分页、query 保留/fragment 去除、请求体仅 url、缓存命中/过期/LRU/内存上限、并发去重、空正文和异常响应 |
| `tests/errors.test.ts` | HTTP 分类、不重试的 4xx、两次有限重试、Retry-After、无效 JSON、响应体大小、连接/正文超时、实际在途请求取消、错误不泄露凭据、串行节流 |
| `tests/security.test.ts` | 内部/保留 IP、IPv4 变形、IPv6 映射/特殊网段、危险协议/userinfo、混合 DNS 答案、配置校验与日志脱敏 |
| `tests/proxy.test.ts` | 显式直连/代理 dispatcher、原生 fetch + 禁网 MockAgent、仅本机 CONNECT 模拟代理、代理故障有限重试、代理 CONNECT 不携带 DeepSeek Authorization |
| `tests/mcp-stdio.test.ts` | 实际 Node 子进程握手、恰好两个工具、无 Key 启动与调用报错、参数 schema、mock Search → Fetch、isError、stdout JSON-RPC、stdout/stderr/结果脱敏 |

测试中的响应均为明确标记的 fixture/mock。`tests/fixtures/mock-server.ts` 不会编译进 `dist`，正式入口没有模拟成功或假搜索结果分支。MockAgent 禁用外网；模拟代理只在 127.0.0.1 监听临时端口并拒绝 CONNECT，不连接 DeepSeek。

## 官方 MCP Inspector

实际执行 CLI（在该子进程环境清空 Key）：

```powershell
npx --yes @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

退出码 0，返回两项工具：

```text
deepseek_search    DeepSeek Web Search
deepseek_fetch     DeepSeek Web Fetch
```

完整返回含 `inputSchema` 和 `readOnlyHint/destructiveHint/openWorldHint`。未执行 Inspector GUI 中的付费工具调用。

## 依赖审计

```powershell
npm audit --omit=dev --registry=https://registry.npmjs.org
```

退出码 0：`found 0 vulnerabilities`。本机默认 npm 镜像没有实现 audit API，首次审计返回 404；随后显式使用 npm 官方审计端点取得上述结果，未修改用户 npm 配置。审计结论是当次数据库扫描结果，不代表永久安全保证。

## 尚未进行的真实环境验收

- **真实 DeepSeek Search 请求：0 次。**
- **真实 DeepSeek Fetch 请求：0 次。**
- 未验证真实 Key、账户余额、实际返回字段与网站可抓取性。
- 未执行 `claude mcp add`，未验证用户实际 Claude Code → CC Switch → OpenCode Go 模型对工具选择的兼容性。
- 未修改现有模型、供应商、`.claude` 目录、共享 settings 或系统代理配置。

真实验收在准备好官方 Key 和额度后，由用户明确发起 Search 1 次、Fetch 1 次，再在 Claude Code 中核实来源引用。具体接入、费用、卸载与故障排查见 README；本记录不把 mock 成功视为真实上游联调成功。
