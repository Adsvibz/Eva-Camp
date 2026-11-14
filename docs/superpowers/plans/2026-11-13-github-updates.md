# GitHub updates implementation plan
Goal: Check, download and install published GitHub updates from Eva Camp.
Architecture: Main-process service with fixed trusted source and streamed verified downloads; narrow IPC API and React settings/sidebar controls; existing SQLite shutdown remains the installation boundary.
Tech Stack: TypeScript, Electron, React, Node HTTPS/fetch and crypto; no added dependency.
Spec: docs/design/github-updates.md

Global constraints: one public installer named evacamp.exe; no embedded credentials; no forced downloads/restarts; preserve offline reception, database, languages, theme and appId.
Review focus: malicious/malformed release metadata, truncated/tampered downloads, cancellation/concurrent actions, locked/restoring application, failed backup or installer launch.

1. Implement src/shared/updates.ts and src/main/updates.ts with tests/updates.test.ts. Test release ordering/trust, actual temporary files and streamed responses, cancellation and cache re-verification. Run tests locally with Node's TypeScript stripping and in Vitest CI.
2. Add trusted IPC in main/preload/api; integrate installer launch after database closure. Add UpdateSettings and UpdateIndicator; render in existing preferences/sidebar. Test development controls and locked access in Electron.
3. Configure NSIS-only evacamp.exe and version 0.2.0, validate release tag/package version and upload only installer. Document publish workflow. Run complete Windows CI; review screenshots and obtain fresh code review. Preserve current release until the verified changes are integrated and published.
