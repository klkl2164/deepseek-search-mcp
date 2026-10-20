# DeepSeek Search MCP

[![CI](https://github.com/klkl2164/deepseek-search-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/klkl2164/deepseek-search-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文](README.md) · English

Use DeepSeek's official Search and Fetch APIs from Claude Code or any MCP client supporting stdio.

| Tool | Purpose |
| --- | --- |
| `deepseek_search` | Search the live web for titles, links, snippets and sources |
| `deepseek_fetch` | Read public pages as Markdown, with pagination and an in-memory cache |

Requires your own **official DeepSeek API key**. Works independently of your model provider. No browser, Docker or database required. This community project is not affiliated with DeepSeek.

Default selection policy: **native web tools first, DeepSeek as an automatic fallback**. Search and fetch are evaluated independently. If the matching native capability is missing, unsupported or fails technically, the model uses this MCP within existing permissions. Successful native calls are not duplicated. See [routing](docs/ROUTING.md).

## Quick start

Install Node.js 22.12+ (22/24 LTS recommended), Git and Claude Code. Obtain an [official API key](https://platform.deepseek.com/api_keys). Independent Search/Fetch requests may incur charges; see the [official guide](https://api-docs.deepseek.com/zh-cn/guides/search/).

Windows PowerShell:

```powershell
npx.cmd -y --package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main deepseek-search-fetch-mcp --setup-claude
```

macOS / Linux:

```sh
npx -y --package=git+https://github.com/klkl2164/deepseek-search-mcp.git#main deepseek-search-fetch-mcp --setup-claude
```

Setup registers the server and installs a user-level Claude Code routing rule, preserving model settings, other MCP servers and existing `CLAUDE.md` files. Existing installations can use `--install-claude-rules` instead of registering again. Set `DEEPSEEK_API_KEY` in the environment that launches your MCP client, or through its private environment configuration. The server does **not** load `.env` automatically. Restart your client and check `/mcp`. Discovery works without a key; actual calls return `CONFIG_ERROR` until configured.

GitHub installation requires Git and builds on first launch. If the client times out, allow more startup time with `MCP_TIMEOUT=120000` in the environment launching Claude Code, or build locally first. This package has not been published to npm. `#main` follows the default branch; use an existing commit SHA or release tag to pin a version.

### Windows guided setup

```powershell
git clone https://github.com/klkl2164/deepseek-search-mcp.git
cd deepseek-search-mcp
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

The script builds and registers the server, installs native-first fallback rules, and prompts for a missing key with hidden input, saving it as a Windows user environment variable. Keep the clone after installation. Use `-SkipKeyPrompt` for unattended registration, `-CheckOnly` for a dry run, `-SkipRoutingRules` to leave client rules untouched, or `-ConfigureKeyOnly` to configure a key without registering again. Existing registrations are preserved. Restart the client after setup.

### Ask your coding agent

> Install https://github.com/klkl2164/deepseek-search-mcp as a user-scoped MCP server and enable native-first automatic fallback rules. Follow its README. Preserve other servers and model settings. If DEEPSEEK_API_KEY is missing, ask me to configure it locally, never in chat. Do not make paid API test requests during installation.

## Usage

Ask a normal web question: the model should use native tools first and fall back only if needed. You can also explicitly request `deepseek_search` and `deepseek_fetch`. This is a model-followed policy, not a hard tool interceptor or a guarantee that the model will always comply.

```json
{ "query": "site:api-docs.deepseek.com Search API", "count": 5 }
```

```json
{ "url": "https://api-docs.deepseek.com/zh-cn/guides/search/", "max_chars": 12000 }
```

Use `next_offset` to continue a page when `has_more` is true. Offsets count Unicode code points. Cached continuation avoids another upstream fetch while the page remains in the cache; expiration, eviction or process restart may require another paid request.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Required for calls | Official DeepSeek API key |
| `DEEPSEEK_MCP_PROXY_URL` | Direct connection | Independent HTTP/HTTPS proxy |
| `DEEPSEEK_MCP_TIMEOUT_MS` | 30000 | Overall HTTP operation budget in milliseconds |
| `DEEPSEEK_MCP_MAX_OUTPUT_CHARS` | 12000 | Default Fetch page size in code points |
| `DEEPSEEK_MCP_CACHE_TTL_MS` | 600000 | In-memory Fetch cache TTL |
| `DEEPSEEK_MCP_CACHE_MAX_ENTRIES` | 50 | Cache entry limit |
| `DEEPSEEK_MCP_LOG_LEVEL` | warn | error / warn / info / debug |

Ambient `HTTP_PROXY/HTTPS_PROXY` settings are not inherited automatically. Logs go to stderr; stdout is reserved for MCP JSON-RPC. Website content is untrusted data, never executable instructions.

## Troubleshooting

- Missing key: restart the process that launches your MCP client after setting environment variables.
- HTTP 401 / 402: invalid key / insufficient balance; these are not retried.
- HTTP 403 / 404: the page was rejected or no usable content was found.
- Slow first launch: clone and build locally, then register the compiled entry point.
- Existing registration: inspect with `claude mcp get deepseek-web`; remove with `claude mcp remove --scope user deepseek-web` before reinstalling.
- Tool not selected: check `/mcp` and explicitly request the tool; model/client tool-calling support is required.

## Contributing

```sh
git clone https://github.com/klkl2164/deepseek-search-mcp.git
cd deepseek-search-mcp
npm ci
npm run check
npm run test:package
```

Automated tests use mocks or a local mock proxy, never paid API calls. CI covers Windows, macOS and Linux. Package tests install a generated tarball in isolation and verify MCP discovery.

- [API reference](docs/REFERENCE.md) · [Client setup](docs/CLIENTS.md)
- [Routing, upgrading and removing rules](docs/ROUTING.md)
- [Contributing](CONTRIBUTING.md) · [Testing](docs/TESTING.md) · [Security](SECURITY.md)
- [Issues](https://github.com/klkl2164/deepseek-search-mcp/issues)

Licensed under the [MIT License](LICENSE).
