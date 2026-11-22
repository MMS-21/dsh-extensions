# Local Power BI coordinator

This is the hidden loopback backend for the chat-based task tools. Preparation
starts it automatically; users do not open a browser or sidebar.

Change operations require the private host control token. The task workflow can
authorize only the exact validated change digest. Source/session/project checks,
checkpoints, unsaved-work guards, processing journals and evidence checks remain.
The former web UI and static HTML routes were removed in 0.6.0.

For manual diagnostics use `start-coordinator.ps1` with an explicit project and
unused port. Normal agent work uses the five task tools described in ../README.md.
