# Changelog

## 0.1.0

- Check serialized UTF-8 JSON inference request size before HTTP transmission.
- Default to an 8,000,000-byte request budget with optional provider overrides.
- Reuse durable tool-result pruning, image offloading and bounded native compaction.
- Retry only after context reduction; preserve completed tool effects and original history.
- Keep content-free size diagnostics and adapt after provider HTTP 413 responses.
- Verify with 18 regression tests and the installed DSH provider SDK against a local mock server.
