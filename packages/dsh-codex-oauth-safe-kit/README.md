# DSH Codex OAuth Safe — development kit (0.1.0)

A source overlay for the MIT-licensed `birat-chapagain/dsh-codex-oauth`, pinned to commit `362738416bccddcb7a882ccf4c98f2ac2959e61f`. It retains the upstream Codex provider adapter and its token-usage stream conversion, replaces the automatic installer with a manual build, and adds a Codex subscription quota chip in DSH Web's composer. This is **a development candidate**, not an official OpenAI or DeepSeek product or a verified installable release.

## What changed

- AES-256-GCM authenticated encryption, random 96-bit nonce on each write; a separately provisioned 32-byte key file is required. No plaintext fallback or silent import of old tokens. The new vault is `$DSH_HOME/codex-oauth-safe.json`.
- The key file is never included in the package. POSIX key and vault ownership and mode checks are enforced; Windows users must protect both with NTFS ACLs. Same-user processes, malware, or unrestricted agent tools can still read a key file and decrypt the vault; **encryption is not a sandbox**. Keep the key outside the workspace and Harness home, restrict agent access, use a dedicated OS account or VM, and do not expose the UI beyond localhost.
- Login accepts only HTTPS `auth.openai.com` and `chatgpt.com` authorization URLs; browser launching does not use `cmd /c start` on Windows. The third-party pi-ai library still implements OAuth and token refresh, and is trusted code. Login status no longer prints account IDs; error messages are generic. No provider redirects or alternate hosts are allowed in the new quota request.
- No `install` verb, no automatic pnpm allowBuilds edits, no downloaded executable release, no automatic package lifecycle scripts during the recommended build. The patch script pins the upstream commit, removes the committed JS, and builds from TypeScript instead. Direct runtime and development dependencies are pinned to the reviewed lockfile versions. The original DSH peer ranges are retained for host compatibility; pnpm may resolve transitive dependencies independently when installing a tarball. Review the installed profile lockfile as well.
- Prompt cache retention requests default to `none`; this is a client preference, not a guarantee about provider storage or retention.
- The quota chip shows server-reported usage percentages, the duration of each available window and reset timestamps. It uses DSH's published composer and new-chat slots; it only displays for the `codex` route and only fetches while visible. It exposes only quota metadata via a read-only Typert RPC, not tokens, account IDs, prompts or response text. Host-side caching and concurrent-request deduplication avoid excess calls. DSH's native per-request token usage remains separate from subscription quota. No model tool is registered.
- Local logout deletes the encrypted credential entry, **not** the server-side OAuth grant. Use account session/security controls or OpenAI support if compromise is suspected.

## Build and test

Requirements: Git, Python 3.12+, Node **22.19+ or 24+** (upstream engine range), npm, DSH and pnpm. Use a disposable development machine or VM first. This overlay targets the DSH APIs and peer ranges of the upstream August 2026 plugin, plus the Typert and composer-slot interfaces observed in `Carrick-K7/dsh-ai-quota`. Compatibility with your DSH version, desktop build, TUI or headless profile is not verified; the quota UI targets the Web profile only. Do not install alongside the original plugin because both register the `codex` route and `/codex` command.

From the directory containing the extracted kit:

```sh
git clone https://github.com/birat-chapagain/dsh-codex-oauth.git upstream-codex
git -C upstream-codex checkout --detach 362738416bccddcb7a882ccf4c98f2ac2959e61f
python assemble.py upstream-codex dsh-codex-oauth-safe
cd dsh-codex-oauth-safe
npm ci --ignore-scripts
npm run test:security
npm run build
npm pack --ignore-scripts
```

`assemble.py` uses only local tracked Git object contents, checks the exact commit and expected source snippets, and fails if the destination exists or the source differs. It does not fetch or execute code from the repository. Inspect the assembled source and dependencies before running the build. `npm ci` downloads dependencies; ignoring scripts reduces but does not eliminate risk. `npm run build` executes the pinned TypeScript compiler. The lockfile is retained for the build, but the packed artifact does not force pnpm to use npm's complete transitive lock. The security tests use synthetic credentials and mocked network calls. The old upstream tests are preserved for reference (except obsolete installer/bin tests); they are not part of the new test command and some require adaptation for the vault. A full build and test against DSH have not been performed in the authoring environment.

## Create the vault key and start DSH

Generate a new key once, not every time you start DSH. Never paste it into a chat or commit it. Store it outside `$DSH_HOME` and any AI workspace. Keep a secure backup if you want to retain access to an existing vault; losing the key means you must reauthenticate.

Example on Linux/macOS (run in a private terminal):

```sh
mkdir -p "$HOME/.private-dsh-codex"
chmod 700 "$HOME/.private-dsh-codex"
export DSH_CODEX_VAULT_KEY_FILE="$HOME/.private-dsh-codex/vault.key"
node -e 'require("node:fs").writeFileSync(process.env.DSH_CODEX_VAULT_KEY_FILE,require("node:crypto").randomBytes(32),{mode:0o600,flag:"wx"})'
```

The `wx` flag refuses to overwrite a key. In later shells set only `DSH_CODEX_VAULT_KEY_FILE`, not the generation command. On Windows PowerShell, use a private NTFS directory under your user profile, set `$env:DSH_CODEX_VAULT_KEY_FILE` to an absolute path in it and use the same `node -e` command; verify the directory and key's ACL grants only the intended user and necessary system administrators. POSIX modes do not secure Windows ACLs. The key path environment variable is inherited by DSH and potentially its subprocesses; restrict the agent workspace and sandbox separately.

## Install into a disposable DSH profile

Use an absolute path to the local tarball produced by `npm pack` (replace the example path with yours). Use an isolated Harness home for the first test if possible, and keep the vault key separate. Remove the old plugin from that profile before using this version; uninstalling it does not revoke or migrate its credentials.

```sh
dsh plugin --profile web add /absolute/path/dsh-codex-oauth-safe-0.1.0.tgz --ignore-scripts
dsh --profile web --dump-config
dsh web
```

If pnpm refuses installation because dependencies require unapproved build scripts, stop and inspect the exact scripts and dependency versions. Do not globally allow scripts or blindly approve packages. DSH's plugin manager may have version-specific behavior around CLI flags; verify that lifecycle scripts are disabled in your installed version. If the host rejects a peer version, do not bypass its compatibility checks.

In the Web chat, run `/codex login` and verify the browser's exact domain before authorizing. Then select provider `codex` and a supported model. A quota ring should appear near the composer with the percentage **used** in each window. Click it for remaining percentages and reset times. Click Check quota to recheck the cached snapshot; refresh automatically occurs about once a minute while visible. Unknown/expired responses are shown as unavailable, never fabricated as 0%. A normal Codex request can refresh an expired access token through pi-ai, or log in again. Quota polling itself never refreshes credentials.

The quota fetch uses `https://chatgpt.com/backend-api/wham/usage`, a first-party but internal Codex usage endpoint, not a supported general-purpose public API. It may change, return no windows or reject access. The UI fails closed; actual quota cannot be inferred reliably from local tokens. No bypass or reset manipulation is implemented. Use only within your subscription's authorization and OpenAI's terms.

## Smoke-test checklist before using a real account

1. Run the local tests and full TypeScript build. Inspect the output package and resolved DSH dependencies. Confirm the expected two bundle rows and the Typert remote register without errors.
2. Launch DSH on localhost with a new dedicated home and restricted agent workspace. Select a non-Codex provider; the chip should not display. Select `codex`; it should say signed out, not 0%.
3. Log in with an account you are authorized to use. Confirm vault file contains only version, nonce, authentication tag and ciphertext. Do not print or share decrypted contents.
4. Make one small model request. Confirm DSH's native token usage and the quota chip update; compare quota windows with the official Codex usage screen. Test logged-out, expired, offline, and key-missing states.
5. Inspect network destinations, including dependencies, under a restricted environment. Do not use the extension if unexpected destinations, permission escalation or credentials in browser payloads/logs are detected.
6. Test logout; the chip should switch to signed out after refresh, and the vault should contain no usable credential. Use official account settings for remote session revocation if needed.

## Remove

Use `dsh plugin --profile web remove dsh-codex-oauth-safe`, restart DSH, and remove the encrypted vault and key file if you no longer need them. Retain a backup only if necessary. Old plaintext vaults from the original plugin remain untouched; handle them separately and revoke sessions if appropriate.

## References and limitations

- Original code: https://github.com/birat-chapagain/dsh-codex-oauth/tree/362738416bccddcb7a882ccf4c98f2ac2959e61f (MIT; upstream LICENSE is retained by the assembler).
- DSH slot and remote interface reference: https://github.com/Carrick-K7/dsh-ai-quota (MIT).
- DSH packaging: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md
- Codex account rate-limit documentation: https://learn.chatgpt.com/docs/app-server
- Official CLI: https://github.com/openai/codex

The kit's eight isolated tests passed using Node 22.16; that version is below the upstream plugin's declared minimum for the full build. The container had no GitHub or npm network access, so the assembly against the actual checkout, compilation, packaging, host/client registration, real login, and authenticated quota request remain unverified. No antivirus scan, dependency-wide security audit or runtime network audit was performed. The quota display is a prototype, not a pixel-identical copy of any particular DSH icon. The included `preview.html` shows example values only. Security depends on the trusted upstream code, DSH, pi-ai, dependencies and OS isolation; this is risk reduction, not a security certification.
