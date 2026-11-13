# Source and adaptation

Upstream: https://github.com/Cosmonautic1/hermes-dreamer
Reviewed revision: 694a015422915ae9ac88f24bd385c0fd2ad0cd5f, manifest version 1.5.0.
License: MIT, copyright 2026 AION; see LICENSE.upstream.

This is a DSH-native JavaScript reimplementation of the idle/residue/dream/wake
behavior, not a Python compatibility wrapper. Provider calls use DSH's prepared
LLM facade; journal persistence uses storageDomain; history reads use read-only
sessionPersistence handles; request/response audit uses ignorable native plugin
records. The next fresh session gets a sourced, fallible wake message through
the native first-step dispatcher. Nothing uses Computer Use.

See PARITY.md for the audited differences. Old Hermes SQLite journals are neither
read nor migrated. No upstream marketing/testimony about numbers of dreams or
model self-reports is treated as a guarantee of behavior.
