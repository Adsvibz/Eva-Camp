# Eva Camp — development snapshot

**Not production-ready. Do not enter real guest records.** This is an incomplete local Electron application and database foundation. It has not been manually acceptance-tested on a clean Windows 10/11 PC, and does not yet have a complete reception workflow. Automated Windows Server CI exercises the real Electron app and the unpacked executable with synthetic records. Automated Windows CI now exercises manual and password-protected portable backup and restore through the Electron application with synthetic data and native dialogs simulated; it verifies recovery after restart on the same Windows account. Cross-account and cross-PC restore still require real-machine testing. Daily closing has automated application and database coverage. Its registration and receipt layouts have not been verified for exact visual fidelity or tested on a physical printer.

Implemented in this snapshot: create and edit units, including housekeeping status, capacity and default pricing; create a guest and reservation in one transaction; reject overlapping active bookings; record payments and refunds; add and undo itemized booking service charges; calculate balances; save and update guest details, encrypted ID values and companions; undo the latest ID change or companion removal; check in, check out, cancel and undo cancellation; show the latest 500 bookings; query an interactive two-week calendar; reschedule reserved bookings, extend checked-in stays and transfer checked-in guests with per-unit stay history; search by name, phone or booking reference; returning-guest selection, normalized phone duplicate detection and paginated linked stay history; edit primary guest and active booking details; date-filtered booking and collection reports with PDF/CSV export; bilingual English/Arabic interface with locally bundled Cairo and saved light/dark/system appearance; daily cash reports and reversible day closing; staged database restoration on the same Windows account; basic audit entries for these actions. The dashboard queries the database independently of the latest-500 booking table. Occupancy uses checked-in status and dated room assignments, including early arrivals and overdue departures; unit categories give occupied rooms priority over maintenance, cleaning and reservations. Scheduled arrivals/departures include active reservations and checked-in stays, with the first 10 shown in each list. Collections are net payments (including refunds and payments on cancelled bookings) through the local day. Outstanding balances sum positive balances on non-cancelled stays, including recorded future-dated payments.

## Developer setup

Use Node.js 22.12 or later (22 LTS or 24 LTS), a C++ build toolchain and Python required by better-sqlite3. The Windows builds target 64-bit Windows; 32-bit Windows is not supported. On Windows use the current Visual Studio C++ build tools. From this directory:

```sh
npm ci
npm test
npm run typecheck
npm run build
npx electron-rebuild -f -w better-sqlite3
npm run dev
```

Electron and Node have different native module ABIs. After running `electron-rebuild`, run `npm rebuild better-sqlite3` before running the Node/Vitest tests again. Daily database backups are created under userData/backups (maximum 30 daily copies), and manual database snapshots can be saved to a new file. Snapshots with broken foreign-key relationships are rejected without replacing a previous daily backup. Restore validates database integrity and foreign-key relationships and checks that encrypted IDs can be opened on the current Windows account, retains a previous database, and restarts. Encrypted ID recovery on a different account requires the separate password-protected portable backup. Both restore methods have automated same-account Windows application coverage with simulated file dialogs; recovery on another account or PC remains unverified. Do not rely on these backups for real records yet. Electron packaging requires rebuilding the module for its target; cross-building a Windows native module from Linux may not work. Verify the NSIS and portable builds on Windows.

Database files are stored in Electron's userData directory. Startup performs a SQLite quick check and enables WAL. Guest names and phone numbers are currently not encrypted. ID/passport values use Electron safeStorage when available, but encrypted-ID lookup and a cross-account-tested restore are not implemented; ID-change undo history retains encrypted previous values inside the database and is validated on restore; the encryption design is not production-ready. ID-number search, verified print layouts, top-client and full historical occupancy reports, remain unimplemented. The report exports CSV compatible with Excel, not XLSX. Scheduled nights use currently configured units and booked dates, so they are not measured actual occupancy. Calendar moves do not change the booking price automatically. Search and calendar interface behavior still requires end-to-end testing on Windows. The Windows CI workflow has successfully built NSIS and portable development executables on GitHub. The tag-triggered draft release workflow remains unverified. An attempted Linux cross-build failed because Wine is not installed.

## العربية
هذه نسخة تطوير غير مكتملة، ولا تصلح لإدخال بيانات العملاء الحقيقية أو تشغيل الاستقبال. تتضمن وظائف أولية للحجوزات والمدفوعات والنسخ الاحتياطي والاستعادة وإغلاق اليوم، لكنها لم تُختبر بالكامل على ويندوز ولم تكتمل بعد. لا تستخدمها مع بيانات عملاء حقيقية.

See `docs/architecture.md` for the database design, risks and remaining verification gates, and `docs/user-manual-ar.md` for the Arabic user manual. The paper form image in `assets` is a design reference, not an extracted logo.

## Portable backup

The development build can export a password-protected `.evabackup` containing the database. The password is not stored and cannot be recovered. ID values and undo history are re-encrypted for the destination account during restore. Separately stored attachments are not included. The implementation uses scrypt and AES-256-GCM; its recovery has automated coverage on a Windows CI runner under the same account; cross-machine recovery has not been tested or independently security-reviewed. Do not rely on it for real guest records yet.

## Windows development build in GitHub Actions

On pushes to `main`, pull requests, or a manual workflow dispatch, the Windows build workflow installs dependencies, checks for high and critical dependency advisories, runs the TypeScript and Vitest checks, builds an NSIS installer and a portable executable, and uploads them as a development artifact for 14 days. Tagged versions also prepare a draft release. The resulting files are development builds and must not be used for real guest records until the unresolved issues and Windows testing are complete.

## Unit transfers

Open a checked-in booking, choose **Transfer unit**, select the destination and the effective date, then save. The calendar retains each unit's date interval. Conflicting stays, insufficient capacity and unavailable units are rejected transactionally. The latest transfer can be undone while the transfer panel stays open, provided the previous unit is still available. A same-day transfer changes the current interval and adds an audit entry rather than a zero-night stay. The booking amount does not change automatically.

Schema migration 2 backfills existing bookings into unit-stay segments. Local and portable backups accept schemas 1, 2 and 3; older restores are upgraded at the next startup. Automated tests cover history preservation through both backup formats, conflict rollback, repeated transfers, extensions and blocked undo. Windows UI and printer acceptance testing are still required.

### نقل العميل إلى وحدة أخرى
افتح الحجز بعد تسجيل الوصول، ثم اختر «نقل الوحدة». حدد الوحدة الجديدة وتاريخ النقل واضغط «نقل». يحتفظ التقويم بفترة الإقامة في كل وحدة ويرفض التعارض أو تجاوز السعة. يمكنك التراجع عن آخر نقل ما دامت النافذة مفتوحة والوحدة السابقة متاحة. لا يتغير سعر الحجز تلقائياً.

## Returning guests and duplicate phones

In **New booking**, use **Find a returning guest** to search by the beginning of a name or a complete phone number. Selecting a result reuses that guest profile and its encrypted ID; it does not overwrite the saved profile. A phone match blocks creation of another profile until you select the existing guest or explicitly acknowledge a different person sharing the number. Arabic and Persian digits are normalized; Egyptian mobile numbers in local, +20 and 0020 forms match. Phone matches do not establish identity. No old duplicate records are automatically merged, and encrypted ID lookup is not implemented yet.

Booking details include **Guest stay history**, with 50 entries per page and access to older pages. Guest profile edits affect every linked booking; dates, charges, companions and payments remain specific to each booking. The current implementation does not preserve historical snapshots of the primary guest's profile. Schema 3 backfills phone lookup values and adds indexes; backups retain linked guest and stay history.

### العميل السابق وسجل الإقامات
في «حجز جديد»، ابحث عن العميل ببداية اسمه أو رقم هاتفه كاملاً. اختيار العميل يعيد استخدام ملفه ورقم هويته المحفوظ. إذا كان الرقم مشتركاً بين أشخاص مختلفين، أكد ذلك قبل إنشاء ملف جديد. لا تُدمج الملفات القديمة تلقائياً. يظهر سجل الإقامات في تفاصيل الحجز مع أزرار للتنقل بين الصفحات. تعديل بيانات العميل يظهر في جميع حجوزاته المرتبطة.

## Automated Windows UI checks

`npm run test:e2e` uses Playwright to launch the built Electron application against an isolated temporary database. Run it after `npm run dist:win` on Windows so the SQLite native module targets Electron. It exercises the real preload/IPC and database, creates fake guests and companions, checks in, transfers a unit, records a payment, selects a returning guest, rejects an unacknowledged duplicate, permits a shared family phone, closes the day and checks persistence after restarting. It also renders filled/blank registration forms and a receipt through Electron `printToPDF`, checks each is one page, and saves PDFs/screenshots to `test-results`. The test then launches the unpacked packaged executable with a disposable profile, writes a unit to its SQLite database, and renders a blank registration PDF.

Both Windows workflows now run this check before uploading executables or drafting a release. The separate UI artifact contains only synthetic test records. This test does not install NSIS on a clean PC, exercise a physical printer, or establish complete visual fidelity to the paper original. Local execution in the current Linux environment is blocked by the absence of a display server; Windows CI is the execution target.

## Dependency security

Electron, electron-builder and Vitest were updated to address the high and critical advisories reported by npm on 11 November 2026. better-sqlite3 was updated for compatibility with the newer Electron runtime. The full audit still reported six moderate findings in the build-time electron-builder/minimatch dependency chain. An npm audit is a point-in-time dependency check and is not a security review of the application. Windows CI rejects builds when npm reports high or critical advisories.

## Language and appearance

Open **Preferences** from the sidebar to select English or Arabic and Light, Dark or System appearance. System follows the operating system colour preference. Choices are saved locally, remain after restart and are included in database backups. A failed save leaves the previously saved choice in effect. The interface uses locally bundled Cairo; English headings use Noto Serif. Print previews retain their own paper layout.

### اللغة والمظهر
اختر «الإعدادات» من القائمة الجانبية لتغيير اللغة أو المظهر إلى فاتح أو داكن أو حسب الجهاز. تُحفظ الاختيارات على الجهاز وتبقى بعد إعادة التشغيل، وتُحفظ ضمن النسخة الاحتياطية.


### Windows backup test scope

The Windows CI backup test uses disposable synthetic records and the real Electron main process, SQLite and Windows safeStorage. It simulates file selection and confirmation dialogs, tests the wrong password without replacing data, restores both backup formats across restarts, and checks that a sample identity decrypts in the print preview. It does not test a second Windows account, a second physical computer, USB/OneDrive reliability or independently review the cryptography.


## Physical room occupancy checks

On check-in, the application checks the current local date against dated room assignments and refuses a room occupied by any guest who has not checked out, including early and overdue stays. Cleaning and maintenance rooms cannot be checked in. Immediate or backdated transfers also refuse a room currently occupied by another checked-in guest. The change and audit entry are transactional. Future-dated transfers remain scheduled by date, so staff must check for overdue stays before the transfer date and keep check-out status current; the app does not yet automatically resolve a conflict that arises later when a scheduled transfer becomes effective.


## Optional application PIN

Preferences → Application lock enables a 6–12 digit PIN. Once enabled, the program locks on launch and can be locked manually. The PIN is stored as a salted scrypt verifier; main-process IPC denies guest and database operations while locked. Five incorrect PINs cause a 30-second delay persisted through restart. Changing or removing a PIN requires the current PIN. The PIN travels with database backups, and there is no in-app PIN recovery; keep it safe. This is an application access lock, not full-disk or full-database encryption, and does not protect against a person able to modify the database or access files directly. Windows account access and physical access still matter.


## Booking services and extras

Open a reserved or checked-in booking to add meals, trips, snorkeling, safari, laundry, or a custom service with a quantity and unit price. Item descriptions and prices are stored on the booking; changing a future price does not alter saved charges. The booking displays accommodation, any discount, extras, total, paid and balance. Totals flow into the registration form and management reports. Charges can be removed with an immediate undo while the booking remains active. After checkout or cancellation charges are read-only. This is an itemized booking-charge feature; a managed service catalog and per-service reporting remain to be implemented. A printable invoice-style current booking statement is available from the booking details; it itemizes services and recorded payments, including future-dated payments and refunds. It is not a tax invoice or an immutable numbered invoice snapshot.


## Unit setup and housekeeping

From Units, choose **Edit unit** to change its name, type, capacity, default nightly price, housekeeping status or notes. Cleaning and maintenance mark the unit unavailable for new bookings, transfers and check-ins until changed back to Ready, including bookings for future dates; existing reservations are not cancelled. Occupancy and reservation statuses are calculated from bookings separately. Capacity cannot be reduced below active assigned bookings, including overdue checked-in guests. The default price is a reference; staff must enter booking totals manually. Price changes do not recalculate existing bookings. Unit names are live references and changes appear in past booking views. Changes are recorded in the audit log.


## Accommodation discounts

Booking details → Accommodation discount accepts a fixed EGP amount, including Arabic digits, with at most two decimal places. It applies to accommodation only and cannot exceed its base amount. Enter zero to remove it. Reserved and checked-in bookings are editable; checked-out and cancelled bookings are read-only. Each change saves the before/after amounts in the audit log in the same transaction. Undo is available while the screen remains open and refuses to overwrite a subsequently changed discount.

Current balances, the registration form, booking statement, dashboard and management report reflect the discount. Payments, receipts and closed-day collections are unchanged. A negative balance is a guest credit; staff must record an actual refund separately. Discounts are fixed amounts, not percentages, and do not apply taxes or service-charge rules.

## Guest declaration and drawn signature

In an active booking, review the registration details with the guest, enter the receptionist and date, and confirm the declaration. The guest may draw a signature with a mouse or touchscreen, or leave a blank line for a handwritten signature. The saved details appear on the registration PDF. Staff can replace the declaration and undo the last replacement while the booking is open.

A change to a printed guest field, ID, companion, assigned unit, booking dates, occupancy or amounts invalidates the declaration, including its signature; the previous signature is not placed on the updated form. The guest must review and sign again. Changing it back does not restore validity. The drawing is stored inside SQLite and is included in both backup formats; a protected portable backup preserves current/stale state while re-encrypting identity fields. It is a captured drawing, not a certified digital signature. Signature strokes and declaration history are stored in the database without separate field encryption; the PIN does not encrypt that database. Physical cross-PC restore and printing still need testing.


## Archived guest registration forms

Saving a declaration now atomically creates a frozen registration-form archive with the then-current values, signature (if drawn), layout, logo and fonts. Open **Saved registration forms** inside booking details to preview or print any version, including versions later marked as undone. A blank-signature version remains explicitly labelled as blank. Changing the live registration invalidates its old declaration but does not change past archived forms. Earlier version-4 declarations were not automatically archived because their original print state cannot be reconstructed reliably.

The frozen HTML document is compressed and encrypted with Windows safeStorage before it is written to SQLite; its public font bundle is stored once per unique font set. Archive creation and the declaration update commit together. Local backup/restore includes the archive; portable backup re-encrypts it for the destination account. Checksums detect accidental corruption but do not protect against an attacker modifying both data and checksums. The archive freezes content and template rather than storing an immutable PDF byte stream; Chromium rendering can change with a future application upgrade. The drawn signature is not certified. Existing signature vectors and undo history outside the archived HTML remain unencrypted, as does most of the database. Test cross-PC restore and physical printing before use with real records.
