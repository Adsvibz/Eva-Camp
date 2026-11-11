# Returning Guests Implementation Plan

Goal: reuse a primary guest profile for another booking, detect matching phone numbers, and browse paginated stay history.

Architecture: schema 3 adds an indexed normalized phone field. SQLite keeps bookings linked to the same guest; choosing a profile never silently overwrites its data. Names provide suggestions, phone matches require an explicit choice, and shared family numbers remain supported. No existing guests are automatically merged. Exact encrypted ID lookup remains separate future work.

Stack: Electron IPC, React, Zod, better-sqlite3, Vitest.

Reference lock: preserve the existing Eva Camp monochrome modal, typography, fields and search-result buttons. Place returning-guest search before the primary details. Keep errors next to the relevant fields, use native buttons and labels, and retain Arabic RTL and keyboard access.

- [x] Write failing repository tests: explicit reuse, shared phone approval, normalized Arabic/local/international phone matching, profile preservation, deleted profiles, transactional rollback, pagination and migration backfill.
- [x] Add migration 3, normalization helper and shared contracts; support schema 3 in both backup formats and startup upgrades.
- [x] Implement guest search, exact duplicate suggestions and paginated history. Add optional guestId and allowSharedPhone to booking creation. Maintain the phone index when editing a profile.
- [x] Expose validated IPC methods, build returning-guest selector and history panel, and make linked-profile editing semantics explicit.
- [ ] Run complete tests, TypeScript and production build, attempt UI testing, update documentation, push and verify Windows packaging.

Review focus: shared family numbers must not merge people; stale guest selection must not overwrite a profile; conflict failures must leave no orphan guest or consumed booking reference; older backups must migrate correctly; history must have a way to reach records beyond the first page.
