# Changelog

## Unreleased

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
