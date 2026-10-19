# Testing

[README](../README.md) · [Contributing](../CONTRIBUTING.md)

## Run locally

```sh
npm ci
npm run check
npm run test:package
```

`npm ci` installs from the lockfile and builds through `prepare`. `check` runs TypeScript validation, builds and runs Vitest, then scans public files. `test:package` creates a tarball, installs it with production dependencies in an isolated temporary directory, and tests the packaged stdio server without a key. It also checks the Git-source packaging lifecycle needed by npx GitHub installation. Package tests need network access to download npm dependencies, but never call paid DeepSeek APIs.

## Coverage

| Area | Checks |
| --- | --- |
| Search | Official field mapping, defaults, empty results, input bounds, Unicode, optional IP, body limits, response validation |
| Fetch | Markdown, code-point pagination, cache hits/expiry/LRU, concurrent continuation, body limits, empty and malformed responses |
| HTTP | Error codes, bounded retries, Retry-After, malformed JSON, streaming limits, cancellation, timeouts and scheduling |
| Security | Dangerous URL forms, reserved IP ranges, DNS answers, configuration validation, credential redaction |
| Proxy | Direct/ProxyAgent selection, native fetch with a network-disabled MockAgent, local CONNECT simulation |
| MCP | Real child-process initialize/tools-list/tools-call, mock Search → Fetch, isError and clean JSON-RPC stdout |
| Windows installer | Mock registration, absolute paths, build failure, existing registration preservation, key-only mode |
| Distribution | Compiled bin, production-only installation, package contents, Git prepare lifecycle and packaged MCP discovery |

Windows installer cases are skipped on other operating systems. Mock response values are fixtures, never production fallback results.

## Public-file checks

```sh
npm run check:public
```

The scan checks distributable source/docs for machine-specific home paths, personal validation reports, local registry URLs and credential file names. It validates relative Markdown links and source/test presence. Generated build output and node_modules are excluded from the source scan; package smoke tests separately scan packed contents.

## Inspector

```sh
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

Expect exactly `deepseek_search` and `deepseek_fetch`. Listing tools verifies transport and schema exposure; it does not verify API credentials or current upstream service availability.

## Real upstream testing

No real API integration test runs by default. To verify upstream behavior, explicitly configure an official key and sufficient balance, then call Search once and Fetch once through your MCP client. Record only redacted status, duration and field checks. Do not loop until success or claim mock results prove paid API availability. Actual billing follows DeepSeek's current rules.
