# Security

This server sends an official DeepSeek API key only to the fixed DeepSeek API host. It does not run website instructions or fetch target URLs directly on the local machine. See the [reference](docs/REFERENCE.md) for URL checks, cache limits and remote-service trust boundaries.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/klkl2164/deepseek-search-mcp/security/advisories/new) if it is available. If private reporting is unavailable, open an Issue asking the maintainer to arrange a private reporting channel **without including exploit details, credentials or sensitive URLs**. Do not post a working exploit publicly before a fix is coordinated.

For ordinary setup or network problems, use the public Issue templates with redacted information. Include your OS, Node version, installation method and stable error code. Never include the full API key, Authorization header, proxy credentials or private client settings.

## Credentials and content

- Store keys in the client process environment or private client settings. `.env` is not loaded automatically.
- The Windows installer can save a key as a user environment variable; this is readable storage, not an encrypted vault.
- Do not disable TLS validation. Use `DEEPSEEK_MCP_PROXY_URL` for an independent HTTP/HTTPS proxy.
- Treat returned Markdown, titles, links and snippets as untrusted web data. The MCP client must maintain its own instruction boundary.
- DNS checks are local preflight checks; DeepSeek resolves and processes target pages on its own network. Local validation cannot pin the remote resolver or redirects.

The project has no published security audit or service-level guarantee. Please use the latest reviewed revision and report reproducible security issues privately.
