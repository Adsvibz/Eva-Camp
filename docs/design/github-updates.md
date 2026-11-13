# In-app GitHub updates
Continue the existing redesign branch. The public repository Adsvibz/Eva-Camp is the sole update source. Only published stable releases with an increasing vMAJOR.MINOR.PATCH tag and a matching package version are offered; draft releases, prereleases and source commits are not updates.

Use the GitHub releases API plus its asset SHA-256 digest. Keep the single public asset evacamp.exe; no latest.yml, blockmap or bundled credentials. Standard electron-updater was considered but requires additional release metadata; browser-only download does not satisfy the in-app request. This small main-process updater downloads the complete NSIS installer.

A background check starts after launch and repeats every six hours. Preferences includes current/new version, plain-text release notes, check, download with progress/cancel, and restart/install. A sidebar indicator appears for an available or downloaded update. Network failure never interrupts offline reception. Development/portable/non-Windows builds cannot install.

The renderer never supplies URLs or executable paths. Restrict HTTPS requests to the repository release path and GitHub asset redirects; limit JSON and installer size; stream to a temporary file, verify size and SHA-256 before marking ready and immediately before installation. Failed/cancelled downloads are removed. One operation at a time.

Installation requires explicit confirmation, a verified SQLite backup and graceful database shutdown. Start the NSIS installer only after outstanding file jobs drain and SQLite closes, using its documented update/relaunch arguments. Preserve appId and userData. Fail closed if backup or integrity checks fail. Keep the downloaded update for the current session only; after restart it may be downloaded again.

Release pipeline validates tag against package.json, builds/tests, then uploads only evacamp.exe as a draft. Publishing that draft makes it discoverable. Existing v0.1.0 cannot acquire an updater retrospectively: install the first update-capable build once.

Verification: unit tests for version/asset selection, request origin/redirects, corruption/size, cancellation, concurrency, re-verification and installer arguments. Real Electron checks settings in both languages, development mode and locked IPC. Full Windows CI and rendered screenshots before completion.
