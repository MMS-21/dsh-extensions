# Request budget for DSH

Prevent oversized JSON model requests from crashing a DeepSeek Harness turn.

This extension measures the complete UTF-8 request body at the HTTP boundary, before it is sent. The default **8,000,000-byte budget** leaves headroom below a provider gateway's 10 MB limit. It reuses DSH's durable context-reduction mechanisms and retries only after the request context actually shrinks.

## What it does

- Checks the serialized JSON, including tools, instructions, conversation history and base64 image overhead.
- Bounds large tool results before token-pressure compaction runs.
- Recovers from local size guards and provider HTTP 413 responses through durable result pruning, older-image offloading, or bounded native history compaction.
- Preserves the current user request, balanced tool-call/result groups, original session events and completed tool effects.
- Retries only the model request. It does not execute completed tools again.
- Keeps content-free size diagnostics and learns a smaller per-model budget after a provider rejects a request below the configured limit.

This is a community desktop extension, not an official DeepSeek package. Version 0.1.0 was tested against DSH 0.2.2-rc.3 and its packaged Node 24.21.0 runtime on Windows.

## Install

Requires an existing DSH desktop profile and PowerShell 7. No npm dependencies are required for this package.

From a checkout of this repository:

```powershell
cd packages/request-budget
npm test
pwsh -File ./install-desktop.ps1
```

Restart DSH once, then continue the same chat. A new conversation is not required.

The installer copies only this extension into the desktop profile, registers its bundle, verifies file hashes, and backs up the profile manifest. It does not replace the application archive or any core package. Close DSH before updating an already installed copy.

The default profile is `$HOME/.dsh/profiles/desktop`. The package name is `@local/dsh-plugin-request-budget`. The `private` field in package.json prevents accidental npm publication; it does not control this GitHub repository's visibility.

## Configuration

The installed bundle's `cordis.patch.yml` accepts:

| Option | Default | Meaning |
| --- | --- | --- |
| `maxRequestBytes` | `8000000` | Maximum serialized JSON inference request size |
| `providerLimits` | `{}` | Optional provider-route byte limits |
| `maxRecoveryAttempts` | `8` | Maximum reductions per turn/step; valid range 1–32 |
| `diagnosticPath` | Plugin-local `.runtime/request-sizes.jsonl` | Content-free size log |

Example provider override:

```yaml
config:
  maxRequestBytes: 8000000
  providerLimits:
    my-gateway: 6000000
  maxRecoveryAttempts: 8
```

Choose limits for the provider's HTTP body cap, independently of its context window in tokens.

## How recovery works

1. DSH's existing tool-result pruner reduces large individual results on the model-facing surface.
2. If a request is still too large, older images can be offloaded while retaining the newest image.
3. If needed, balanced completed history is summarized in bounded chunks using DSH's native compaction engine.
4. The next model request is rebuilt from the resulting durable surface. Original session events remain available.

An irreducible current prompt, tool schema or system envelope can still exceed the budget. In that case the extension stops rather than silently discarding instructions or retrying an identical payload. Recovery can require additional summarization model calls.

## Scope and diagnostics

The guard applies to JSON HTTP inference requests scoped through `llm/stream`. It does not modify unrelated network traffic or multipart uploads. WebSocket transports are outside this HTTP guard.

The shipped DSH base supplies the result-pruner, compaction engine and image-offload projection. Other compositions need those components for the corresponding recovery paths.

The bounded diagnostic log contains routing names, numeric byte counts, section sizes and outcomes. It does **not** log prompts, tool contents, headers or credentials. Full tool results remain in DSH's original session log; only the model-facing surface is reduced.

## Test

```powershell
npm test
```

The 18 dependency-free regression tests cover UTF-8 accounting, exact budget boundaries, concurrent requests, provider-specific limits, HTTP 413 adaptation, cancellation, multipart exclusion, request-body preservation and context-reduction safety.

The optional runtime integration test requires an installed DSH desktop runtime. Run it with the packaged Electron executable in Node mode, or set `DSH_RUNTIME_ROOT` for another runtime layout:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
try {
  & "$env:LOCALAPPDATA/Programs/DeepSeek Harness/DeepSeek Harness.exe" "$PWD/test-dsh-runtime.mjs"
} finally {
  Remove-Item Env:ELECTRON_RUN_AS_NODE
}
```

That integration uses the real Cordis plugin lifecycle, LLM service, pi-ai adapter, provider SDK, result-pruner and retry implementation against a local HTTP mock. It verifies blocked requests make no network call, recovery does not rerun the tool, and irreducible input does not enter an always-retry loop. It makes no real or paid provider requests.

## Disable or roll back

Remove `@local/dsh-plugin-request-budget` from `dsh.profile.bundles` in the desktop profile's package.json and restart DSH. The installer prints its backup directory; restore its `profile-package.json` if you need the exact previous manifest. Review other profile changes before restoring an older backup. Existing conversations and plugin data are not deleted.

## License

MIT. No DSH runtime source, credentials, profile backups or session data are included.
