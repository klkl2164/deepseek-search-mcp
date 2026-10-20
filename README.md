# DeepSeek Search MCP

[![CI](https://github.com/klkl2164/deepseek-search-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/klkl2164/deepseek-search-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

中文 · [English](README.en.md)

为 Claude Code 和其他支持 stdio 的 MCP 客户端提供 **DeepSeek 官方网页搜索与网页抓取**。

| 工具 | 用途 |
| --- | --- |
| `deepseek_search` | 搜索实时网页，返回标题、链接、摘要和来源 |
| `deepseek_fetch` | 读取公开网页的 Markdown 正文，支持分页和缓存 |

需要你自己的 **DeepSeek 官方 API Key**。本项目独立于模型供应商，不要求使用 DeepSeek 模型；也不会替换客户端的内置 WebSearch/WebFetch。无需浏览器、Docker 或数据库。

默认使用策略是 **内置工具优先，DeepSeek 按需兜底**：需要联网时先用 agent 自身的搜索/抓取；对应内置工具未提供、供应商不支持或技术性调用失败时，模型自动改用本 MCP。搜索与抓取分别判断，内置工具成功时不重复调用 DeepSeek。详见[自动兜底规则](docs/ROUTING.md)。

## 快速开始

准备 [Node.js](https://nodejs.org/) 22.12+（推荐 22/24 LTS）、Git、Claude Code，以及 [DeepSeek 官方 API Key](https://platform.deepseek.com/api_keys)。Search/Fetch 为独立 HTTP API，实际调用可能计费，见[官方计费说明](https://api-docs.deepseek.com/zh-cn/guides/search/)。

### 方式一：让 Claude Code 帮你安装

把下面这句话发给 Claude Code：

> 请安装 https://github.com/klkl2164/deepseek-search-mcp 的 MCP 到用户级配置，并启用“内置联网工具优先、DeepSeek 自动兜底”规则。阅读 README，使用 GitHub 安装命令或克隆后的安装脚本；不要改动其他 MCP 或模型配置。若缺少 DEEPSEEK_API_KEY，提示我在本机设置，不要让我在聊天中提供密钥；安装过程中不要发起付费 API 测试。

### 方式二：一条命令注册

Windows PowerShell：

```powershell
npx.cmd -y --package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main deepseek-search-fetch-mcp --setup-claude
```

macOS / Linux：

```sh
npx -y --package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main deepseek-search-fetch-mcp --setup-claude
```

该命令注册 MCP，并安装 Claude Code 用户级的“内置优先、自动兜底”规则；不会修改模型供应商、其他 MCP 或现有 `CLAUDE.md`。已经注册过的用户，可仅[安装或更新规则](docs/ROUTING.md#已有用户启用)。

安装时会下载并构建 GitHub 源码，可能需要一点时间。若后续客户端等待超时，可[延长首次启动等待](docs/CLIENTS.md#首次启动超时)，或使用下面的本地安装。当前通过 GitHub 分发，尚未发布到 npm；无需手动下载压缩包。`#main` 跟随主分支；需要固定版本时可以替换为已存在的 commit SHA 或 release tag。

**然后配置密钥：** Windows 用户可运行下面的安装脚本，隐藏输入并保存 Key。macOS/Linux 请在启动客户端的环境中设置 `DEEPSEEK_API_KEY`，或通过客户端的私有环境变量配置传入，详见[客户端配置](docs/CLIENTS.md)。不要把真实 Key 提交到仓库或发到 Issue 中。

### 方式三：克隆后安装（Windows，可交互设置 Key）

```powershell
git clone https://github.com/klkl2164/deepseek-search-mcp.git
cd deepseek-search-mcp
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

脚本自动安装依赖、构建、注册 `deepseek-web` 并安装自动兜底规则；缺少 Key 时会提示隐藏输入，保存为 Windows 用户环境变量。安装后请保留项目目录。`-SkipKeyPrompt` 跳过 Key 输入，`-CheckOnly` 只检查环境，`-SkipRoutingRules` 不写客户端规则。已经存在同名注册时不会覆盖；可用 `-ConfigureKeyOnly` 单独配置 Key。

重新打开 Claude Code，在 `/mcp` 中确认两个工具已出现。没有 Key 也可以连接和列工具，实际搜索或抓取时会返回 `CONFIG_ERROR`。

## 使用示例

正常使用无需每次指定工具名，例如：

```text
查一下 DeepSeek Search API 的最新官方文档，并给出来源链接。
```

模型先使用可用的内置联网工具；只有不可用时才兜底到 DeepSeek。如需明确指定本 MCP，也可以说：

```text
请使用 deepseek-web 的 deepseek_search 搜索 DeepSeek Search API 官方文档，
展示返回的标题和 URL，再用 deepseek_fetch 读取其中一个公开页面。
```

工具输入示例：

```json
{ "query": "site:api-docs.deepseek.com Search API", "count": 5 }
```

```json
{ "url": "https://api-docs.deepseek.com/zh-cn/guides/search/", "max_chars": 12000 }
```

抓取结果包含 `has_more` 和 `next_offset`。继续读取时用同一 URL 和 `next_offset`；缓存有效时无需重复抓取。页长和偏移按 Unicode 码点计算，中文和 emoji 不会被拆成半个代理对。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 必填 | DeepSeek 官方 Key；实际调用必需 |
| `DEEPSEEK_MCP_PROXY_URL` | 直连 | 独立 HTTP/HTTPS 代理，如 `http://127.0.0.1:7890` |
| `DEEPSEEK_MCP_TIMEOUT_MS` | 30000 | HTTP 操作总超时预算，含排队和重试 |
| `DEEPSEEK_MCP_MAX_OUTPUT_CHARS` | 12000 | Fetch 默认返回码点数 |
| `DEEPSEEK_MCP_CACHE_TTL_MS` | 600000 | Fetch 缓存时间，毫秒 |
| `DEEPSEEK_MCP_CACHE_MAX_ENTRIES` | 50 | Fetch 缓存条目上限 |
| `DEEPSEEK_MCP_LOG_LEVEL` | warn | error / warn / info / debug |

服务只读取进程环境变量，**不会自动加载 `.env`**。代理仅影响本 MCP；未设置时直连，不自动继承 `HTTP_PROXY/HTTPS_PROXY`。所有日志写 stderr，stdout 专用于 MCP JSON-RPC。

## 常见问题

- **连接成功但不能搜索：** 检查客户端是否继承 `DEEPSEEK_API_KEY`。更改用户环境变量后重启客户端及其启动器。
- **401 / 402：** 分别表示官方 Key 未授权、账户余额不足；不会自动重试。
- **403 / 404：** 目标页面被拒绝或没有可提取的正文。
- **首次启动超时：** 先按方式三在本地安装，避免客户端启动期间等待源码构建。
- **同名服务已经存在：** 先用 `claude mcp get deepseek-web` 查看；需要重装时执行 `claude mcp remove --scope user deepseek-web`。
- **模型没有选中工具：** 在 `/mcp` 检查连接，再明确指定工具名；选择工具取决于客户端和模型的 tool calling 支持。

## 开发与贡献

```sh
git clone https://github.com/klkl2164/deepseek-search-mcp.git
cd deepseek-search-mcp
npm ci
npm run check
npm run test:package
```

自动测试使用 mock 或本机模拟代理，不调用付费 API。CI 在 Windows、macOS、Linux 上检查构建和测试；打包测试会在隔离目录安装生成的包并验证 MCP 握手。真实上游调用需自行提供 Key 并明确控制次数。

- [工具参数、限制和错误码](docs/REFERENCE.md)
- [其他客户端与手动配置](docs/CLIENTS.md)
- [自动兜底、已有用户升级与关闭规则](docs/ROUTING.md)
- [贡献指南](CONTRIBUTING.md) · [测试说明](docs/TESTING.md)
- [安全政策](SECURITY.md) · [报告问题](https://github.com/klkl2164/deepseek-search-mcp/issues)

MIT License。与 DeepSeek 官方无隶属关系。
