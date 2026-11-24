# DSH Codex OAuth Safe v0.2.0 (development candidate)

A prebuilt quota companion targeting **DSH 0.2.2-rc.5**. Unlike the old source kit, this relies on DSH's native OpenAI Codex OAuth and credential storage. It does not install a second provider or create an additional credential vault. No build or extra npm runtime dependencies, no installation lifecycle scripts. DSH provides the exact-version peer packages. Desktop and Web use the browser-client slots; live compatibility is not yet verified.

## Install

Confirm your installed DSH version is exactly 0.2.2-rc.5. Remove the older third-party Codex provider from the active profile if present. Do not install the old `dsh-codex-oauth-safe-kit` development overlay alongside this package. Do not bypass compatibility checks or allow unreviewed scripts.

From a checkout of `MMS-21/dsh-extensions`, run:

```sh
cd packages/dsh-codex-oauth-safe
npm test
npm pack --ignore-scripts
```

Or use the separately supplied `dsh-codex-oauth-safe-0.2.0.tgz` directly. No npm install is needed to package or run the isolated tests. Install the archive using DSH's plugin manager if supported, or run the CLI (replace the sample absolute path with the actual path):

```sh
dsh plugin --profile desktop add /absolute/path/dsh-codex-oauth-safe-0.2.0.tgz --ignore-scripts
dsh --profile desktop --dump-config
```

Replace `desktop` with `web` for the Web profile, or the actual active profile name. Close/restart DSH when appropriate. If host peers are unavailable or a version mismatch is reported, stop rather than disabling checks. Sign in to the native OpenAI Codex provider in DSH Settings → Models, configure/enable it if needed, and select an `openai-codex` model. Complete consent yourself, on the genuine OpenAI authorization domain. This extension does not implement sign-in.

The composer displays a quota ring for the native `openai-codex` route. Click for percentages used/remaining and reset timestamps. Quota data refreshes approximately once per minute while visible. DSH token usage remains separate. Unknown data is never reported as zero. Custom route aliases are not recognized; do not use this display with a credential or endpoint override. The example values in preview.html are synthetic.

## Security and limitations

The host reads only the native `llm-pi-ai/openai-codex` grant using DSH's credential service. It neither enumerates credentials nor writes or refreshes them. The owner-defined grant format is internal, so the package deliberately targets a single DSH version. The quota query sends an existing access token only to `https://chatgpt.com/backend-api/wham/usage`, with redirects rejected, response size and time bounded, and no raw provider bodies logged. This first-party endpoint is internal and may change. Only allowlisted numeric quota metadata reaches the browser RPC. No model tool or shell subprocess. DSH itself remains responsible for credential protection and authentication; the extension does not encrypt or migrate native credentials, and does not isolate same-user processes. This is not an official OpenAI or DeepSeek extension.

Before using a real account, test in a restricted profile: bundle registration, native model selection, quota UI, sign-out, expired credentials, account switching, network errors, and whether the values match the official Codex quota screen. Inspect RPC output and network destinations. No live DSH runtime, real OAuth, or authenticated quota requests were tested in the packaging environment. Local tests use synthetic data. The packaging environment's Node 22.16 is below the declared runtime minimum; run DSH on Node >=22.19 or its supported embedded runtime. Remove with `dsh plugin --profile desktop remove dsh-codex-oauth-safe` (use the actual profile). Native credentials/settings are not deleted.

## Publish to GitHub

Copy this folder to `packages/dsh-codex-oauth-safe/`, commit the source and tests, then push. To distribute a prebuilt artifact, run the tests, pack with `npm pack --ignore-scripts`, compute its SHA-256, and attach the tarball and checksum to a GitHub prerelease. Do not commit tokens, credential files, or installed dependencies. Mark the release experimental until a real DSH smoke test passes.

## References

- https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.5
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/llm/llm-pi-ai/src/login.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/llm/llm-pi-ai/src/auth.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/docs/user/develop/basic/publish.md
- Original MIT-licensed source kit: https://github.com/birat-chapagain/dsh-codex-oauth/tree/362738416bccddcb7a882ccf4c98f2ac2959e61f
- Slot and Typert interface reference: https://github.com/Carrick-K7/dsh-ai-quota
