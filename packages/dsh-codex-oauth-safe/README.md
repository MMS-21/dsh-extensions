# DSH Codex OAuth Safe v0.2.1

The current client places the subscription-usage ring in `sidebar.footer.action`
above the account control, replacing conversation-dock chips. The ring shows
the highest used percentage across returned quota windows. Its popover shows
each window, remaining quota, reset time and the snapshot time. It polls every
60 seconds while visible, refreshes on focus, and offers Check quota. Host-side
caching remains up to 60 seconds. Unknown quota displays `?`, never a fabricated
0%. Live account availability depends on the existing read-only native quota
RPC returning data. Credentials never enter the browser client.

A quota companion targeting **DSH 0.2.2-rc.5**. It reads DSH's native OpenAI Codex OAuth grant. If that quota request is unavailable, it reads normalized limits from the locally installed Codex app-server. The browser client receives only quota metadata. The plugin has no additional runtime dependencies or installation scripts. The desktop quota card was verified in a running DSH instance.

## Install

Confirm your installed DSH version is exactly 0.2.2-rc.5. Remove the older third-party Codex provider from the active profile if present. Do not install the old `dsh-codex-oauth-safe-kit` development overlay alongside this package. Do not bypass compatibility checks or allow unreviewed scripts.

From a checkout of `MMS-21/dsh-extensions`, run:

```sh
cd packages/dsh-codex-oauth-safe
npm test
npm pack --ignore-scripts
```

Install the resulting archive using DSH's plugin manager if supported, or run the CLI (replace the sample absolute path with the actual path):

```sh
dsh plugin --profile desktop add /absolute/path/dsh-codex-oauth-safe-0.2.1.tgz --ignore-scripts
dsh --profile desktop --dump-config
```

Replace `desktop` with `web` for the Web profile, or the actual active profile name. Restart DSH to load host changes. If host peers are unavailable or a version mismatch is reported, stop rather than disabling checks. Sign in to the native OpenAI Codex provider in DSH Settings → Models, or use `/chatgpt login`; then select an `openai-codex` model. Complete consent yourself on the genuine OpenAI authorization domain.

The sidebar footer displays a quota ring. Click for percentages used/remaining and reset timestamps. Quota data refreshes approximately once per minute while visible. DSH token usage remains separate. Unknown data is never reported as zero. The example values in preview.html are synthetic.

## Security and limitations

The host reads the native `llm-pi-ai/openai-codex` grant using DSH's credential service. It neither enumerates credentials nor writes or refreshes them. The owner-defined grant format is internal, so the package deliberately targets a single DSH version. The native quota query sends an existing access token only to `https://chatgpt.com/backend-api/wham/usage`, with redirects rejected, response size and time bounded, and no raw provider bodies logged. This first-party endpoint is internal and may change. If it fails, a local Codex app-server subprocess supplies rate limits. Only allowlisted numeric quota metadata reaches the browser RPC. DSH itself remains responsible for credential protection and authentication. This is not an official OpenAI or DeepSeek extension.

The quota card and local Codex fallback were verified in the desktop profile. Local tests use synthetic data. Run DSH on Node >=22.19 or its supported embedded runtime. Remove with `dsh plugin --profile desktop remove dsh-codex-oauth-safe` (use the actual profile). Native credentials/settings are not deleted.

## Publish to GitHub

Copy this folder to `packages/dsh-codex-oauth-safe/`, commit the source and tests, then push. To distribute a prebuilt artifact, run the tests, pack with `npm pack --ignore-scripts`, compute its SHA-256, and attach the tarball and checksum to a GitHub prerelease. Do not commit tokens, credential files, or installed dependencies. Mark the release experimental until a real DSH smoke test passes.

## References

- https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.5
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/llm/llm-pi-ai/src/login.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/llm/llm-pi-ai/src/auth.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/docs/user/develop/basic/publish.md
- Original MIT-licensed source kit: https://github.com/birat-chapagain/dsh-codex-oauth/tree/362738416bccddcb7a882ccf4c98f2ac2959e61f
- Slot and Typert interface reference: https://github.com/Carrick-K7/dsh-ai-quota
