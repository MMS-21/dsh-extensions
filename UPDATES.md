# Extension compatibility and updates

The [Update Manager bundle](packages/update-manager/README.md) shares the
compatibility checker and can discover and stage verified Render UI releases.

The repository now checks the official Windows DSH nightly feed daily and opens
one compatibility-review issue for each newly observed version. It uses the
desktop update feed, because the public npm DSH packages currently report
0.0.1-rc.1 while the installed desktop is 0.2.2-rc.5. npm is not an authoritative
desktop release source. Feed/network failures fail the workflow visibly.

Dependabot opens weekly dependency and GitHub Actions update PRs. DSH peer
dependencies are excluded from blind dependency upgrades: they must be checked
against the actual packaged desktop APIs and native fixtures first.

To inspect the installed profile, run `scripts/check-installed-compatibility.mjs`
with the installed DSH Electron executable and `ELECTRON_RUN_AS_NODE=1`.
`DSH_PROFILE_DIR` and `DSH_RUNTIME_ROOT` override the standard paths. Electron's
filesystem integration is needed to read packages inside app.asar. The report
does not change installed files, grants or peer dependency declarations. It
checks exact peer pins and client package availability, and explicitly leaves
ranges and runtime behavior for review.

For each release, run the package suites and native fixtures on the new desktop
using synthetic data, review API changes, then update exact compatibility pins.
Rebuild generated client artifacts before release. Merge only reviewed changes
whose required tests pass. A green unit suite alone is not native certification.

This first update stage automates detection, dependency PRs and fixture checks.
It does not install extensions automatically or change the running application.
A desktop installer still needs managed release artifacts, per-version native
certification, local-change detection, backups, closed-app activation and rollback.
Locally edited linked plugins must not be overwritten by an updater.
