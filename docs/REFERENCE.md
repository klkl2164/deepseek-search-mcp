# 工具与配置参考

[返回 README](../README.md)

## deepseek_search

| 参数 | 范围 | 默认值 |
| --- | --- | --- |
| `query` | 去首尾空白后 1～128 个 Unicode 码点 | 必填 |
| `count` | 整数 1～50 | 5 |
| `need_content` | boolean | false |
| `ori_question` | 可选，去首尾空白后 1～128 个码点 | 不传 |
| `localization` | 可选，IPv4/IPv6 字面量 | 不传 |

`site:`、`-site:`、`lang:`、`after:`、`before:`、引号等搜索语法原样传给 DeepSeek。不支持 `time_range` 等非官方字段。搜索不缓存。

返回 `query/count/results/cached/truncated/source_trust`。每条结果保留 `title/url/snippet/summary/date/site_name/site_icon/rerank_score/authority`。空搜索结果正常返回 `results:[],count:0`。

`need_content=false` 时不返回正文。为 true 时每条正文最多 2,000 个码点，总计最多 12,000 个码点。标题/短摘要/长摘要/站点名上限分别为 500/500/1200/200 码点；裁切文本或结果条数时 `truncated=true`。URL 和图标 URL 超过 8,192 字符视为异常响应，不截坏链接。

## deepseek_fetch

| 参数 | 范围 | 默认值 |
| --- | --- | --- |
| `url` | 公开 HTTP/HTTPS URL，无 userinfo，最多 8192 字符 | 必填 |
| `offset` | 非负安全整数；本地码点偏移 | 0 |
| `max_chars` | 整数 1000～30000；本地页长 | 12000 或配置值 |

实际发送给 DeepSeek 的请求体只有 `{ "url": "..." }`。分页参数由本地处理。

响应形状示例（非真实搜索或抓取结果）：

```json
{
  "url": "https://example.com/article",
  "title": "Example title",
  "content": "Markdown excerpt…",
  "offset": 0,
  "returned_chars": 12000,
  "total_chars": 24000,
  "has_more": true,
  "next_offset": 12000,
  "cached": false,
  "source_trust": "untrusted_web_content"
}
```

偏移、长度均为 Unicode 码点，不是 UTF-16 code unit。组合 emoji 和组合音标仍可能跨页。最后一页 `has_more=false,next_offset=null`；offset 超过正文返回空片段并保留总长度。标题最多返回 500 码点。

完整正文使用进程内 LRU/TTL 缓存，默认 10 分钟、50 条、20 MiB 字符串预算（取 UTF-16/UTF-8 大小较大值）。URL key 去除 fragment、保留 query。并发读取同一 URL 会排队复查缓存。过期、淘汰、进程重启后重新抓取可能再次收费；不保证永久复用。超过缓存容量的单页返回 `RESPONSE_TOO_LARGE`，HTTP JSON 响应流另有 24 MiB 上限。

成功结果同时提供 MCP 文本 JSON 与 `structuredContent`；工具运行失败为 `isError:true`。SDK 对不合规输入也可能直接返回协议参数错误。

## 环境变量范围

| 变量 | 允许值 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 官方 Key，仅从进程环境读取 |
| `DEEPSEEK_MCP_TIMEOUT_MS` | 1～300000，默认 30000 |
| `DEEPSEEK_MCP_MAX_OUTPUT_CHARS` | 1000～30000，默认 12000 |
| `DEEPSEEK_MCP_CACHE_TTL_MS` | 1～86400000，默认 600000 |
| `DEEPSEEK_MCP_CACHE_MAX_ENTRIES` | 1～1000，默认 50 |
| `DEEPSEEK_MCP_PROXY_URL` | HTTP/HTTPS 代理，不支持 SOCKS |
| `DEEPSEEK_MCP_LOG_LEVEL` | error / warn / info / debug，默认 warn |

不自动加载 `.env`。未配置独立代理时创建显式直连 Agent，不继承环境代理，不关闭 TLS 验证。API 主机固定为 `https://api.deepseek.com`，不允许生产 Base URL 覆盖，不跟随 API 重定向。

## 错误码和重试

| 错误码 | 含义 |
| --- | --- |
| `CONFIG_ERROR` | 缺少 Key 或配置无效 |
| `INVALID_ARGUMENT` | 参数不合规或上游拒绝请求参数 |
| `AUTH_FAILED` | HTTP 401，Key 未授权 |
| `INSUFFICIENT_BALANCE` | HTTP 402，需充值 |
| `FETCH_FORBIDDEN` | HTTP 403，页面被拒绝 |
| `FETCH_NOT_FOUND` | HTTP 404 或空正文 |
| `UNSAFE_URL` / `DNS_FAILED` | 非公开 URL 或解析失败 |
| `RATE_LIMITED` | HTTP 429，有限重试后仍限速 |
| `TIMEOUT` / `CANCELLED` | 超时或客户端取消 |
| `PROXY_ERROR` / `NETWORK_ERROR` | 连接故障 |
| `UPSTREAM_SCHEMA_ERROR` | 非法 JSON 或成功响应不符合 schema |
| `RESPONSE_TOO_LARGE` | 超过本地大小限制 |
| `UPSTREAM_ERROR` | 其它上游或内部失败 |

HTTP 408、429、500、502、503、504，网络错误和单次超时最多重试两次。退避为 500/1500 ms 加 0～199 ms jitter；合法 `Retry-After` 秒数或日期最多等待 5 秒，受总超时约束。其他 4xx 不重试，客户端取消不重试。

每次尝试最多使用总超时配置的约 1/3；总预算包含 HTTP 调度排队、重试和读取响应。首次 Fetch 前还有最多 5 秒本地 DNS 校验。同一 URL 并发等待缓存的时间不计入 HTTP 客户端预算；客户端取消可以中断等待。

Search/Fetch 共用串行调度器，HTTP 开始间隔至少 300 ms；不保证满足全部账号或目标域名的实时 QPS 限制。重试仍可能产生额外上游请求；费用和限额以[官方指南](https://api-docs.deepseek.com/zh-cn/guides/search/)为准。

## 信任和 URL 边界

搜索和抓取内容均为不可信网页数据，服务不会执行网页指令。客户端应继续按引用内容处理，不能把正文指令提升为系统权限。

拒绝非 HTTP/HTTPS、userinfo、内部后缀、私网/环回/链路本地/保留 IPv4、非公网 IPv6；域名任一 DNS 答案指向内部地址时拒绝。服务只向 DeepSeek 发请求，不在本机下载目标网页；远端 DNS 和重定向不受本地固定，仍依赖 DeepSeek 的安全策略。

## 官方参考

- [Search schema](https://api-docs.deepseek.com/zh-cn/api/search/)
- [Fetch schema](https://api-docs.deepseek.com/zh-cn/api/fetch/)
- [MCP SDK v2 stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
