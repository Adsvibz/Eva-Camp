# Changelog

## Unreleased

- Reject backup snapshots and restores with broken foreign-key relationships, preserving existing backup files. Add Windows end-to-end coverage for manual and portable backup recovery.

- Add a database-backed bilingual front-desk dashboard with arrival and departure lists, occupancy, unit states, net collections and outstanding balances.

- Add persisted English/Arabic and light/dark/system preferences, with Cairo and Noto Serif fonts bundled locally.

- Exercise the unpacked packaged Windows executable, its bundled SQLite module and print template in CI.

- Upgrade Electron to 45.3.0, better-sqlite3 to 13.0.3, electron-builder to 26.18.0 and Vitest to 5.1.0; run a high-severity dependency audit and assert the Electron version in Windows CI.

- Name the room-transfer selector for assistive technology and add an Arabic operating guide.
- Update Zod and Drizzle ORM to versions that address currently reported production dependency advisories.

- Add returning-guest selection, indexed phone normalization, explicit shared-phone acknowledgement and paginated guest stay history.
- Add schema 3 upgrades and restore compatibility for schemas 1–3.
- Add a Playwright suite exercising the real Electron application and Chromium PDF rendering on Windows; executables are uploaded only after it passes.

### Earlier development work

- Add checked-in unit transfers with dated room history, transactional conflict and capacity checks, and immediate undo.
- Keep earlier room assignments in the calendar and update only the final segment when extending a stay.
- Upgrade schema-1 bookings to schema 2 automatically and preserve room segments through local and password-protected portable backups.
- Add migration, transfer, rollback, extension and backup regression tests.

Validation: 57 Vitest tests, four Python schema tests, TypeScript checks and the production bundle pass locally. GUI validation was attempted but blocked by the Linux environment's missing display and Chromium socket restrictions. These checks do not establish Windows installation, printing or reception acceptance.

## 0.1.0 — Development snapshot

- Initial offline guest, unit, booking and payment workflows.
- Bilingual registration and receipt templates, calendar, reports and daily closing.
- Local and password-protected portable backups.
- GitHub Actions builds NSIS and portable Windows development executables.

This remains an incomplete development version. See README.md for limitations.
