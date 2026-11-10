# Eva Camp — development snapshot

**Not production-ready. Do not enter real guest records.** This is an incomplete local Electron application and database foundation. It has not been tested on Windows, does not include PIN lock or a complete reception workflow. Password-protected portable backup and restore have automated tests, but have not been tested end-to-end on Windows. Backup restore and daily closing have database tests, but have not been verified through the Windows application. Its registration and receipt print layouts have not yet been visually verified or tested on a printer.

Implemented in this snapshot: create units; create a guest and reservation in one transaction; reject overlapping active bookings; record payments and refunds; calculate balances; save and update guest details, encrypted ID values and companions; undo the latest ID change or companion removal; check in, check out, cancel and undo cancellation; show the latest 500 bookings; query an interactive two-week calendar; reschedule reserved bookings, extend checked-in stays and transfer checked-in guests with per-unit stay history; search by name, phone or booking reference; returning-guest selection, normalized phone duplicate detection and paginated linked stay history; edit primary guest and active booking details; date-filtered booking and collection reports with PDF/CSV export; bilingual English/Arabic interface; daily cash reports and reversible day closing; staged database restoration on the same Windows account; basic audit entries for these actions. The dashboard totals represent only the loaded bookings, not a complete report.

## Developer setup

Use Node.js 20 LTS or 22 LTS, a C++ build toolchain and Python required by better-sqlite3. On Windows use the current Visual Studio C++ build tools. From this directory:

```sh
npm ci
npm test
npm run typecheck
npm run build
npx electron-rebuild -f -w better-sqlite3
npm run dev
```

Electron and Node have different native module ABIs. After running `electron-rebuild`, run `npm rebuild better-sqlite3` before running the Node/Vitest tests again. Daily database backups are created under userData/backups (maximum 30 daily copies), and manual database snapshots can be saved to a new file. Restore validates database integrity and checks that encrypted IDs can be opened on the current Windows account, retains a previous database, and restarts. This has not been tested end-to-end on Windows, and encrypted ID recovery on a different account requires the separate password-protected portable backup. Neither restore method has been tested end-to-end on Windows; do not rely on these backups for real records. Electron packaging requires rebuilding the module for its target; cross-building a Windows native module from Linux may not work. Verify the NSIS and portable builds on Windows.

Database files are stored in Electron's userData directory. Startup performs a SQLite quick check and enables WAL. Guest names and phone numbers are currently not encrypted. ID/passport values use Electron safeStorage when available, but encrypted-ID lookup and a Windows-tested restore are not implemented; ID-change undo history retains encrypted previous values inside the database and is validated on restore; the encryption design is not production-ready. ID-number search, verified print layouts, top-client and full historical occupancy reports, and PIN lock remain unimplemented. The report exports CSV compatible with Excel, not XLSX. Scheduled nights use currently configured units and booked dates, so they are not measured actual occupancy. Calendar moves do not change the booking price automatically. Search and calendar interface behavior still requires end-to-end testing on Windows. The Windows CI workflow has successfully built NSIS and portable development executables on GitHub. The tag-triggered draft release workflow remains unverified. An attempted Linux cross-build failed because Wine is not installed.

## العربية
هذه نسخة تطوير غير مكتملة، ولا تصلح لإدخال بيانات العملاء الحقيقية أو تشغيل الاستقبال. تتضمن وظائف أولية للحجوزات والمدفوعات والنسخ الاحتياطي والاستعادة وإغلاق اليوم، لكنها لم تُختبر بالكامل على ويندوز ولم تكتمل بعد. لا تستخدمها مع بيانات عملاء حقيقية.

See `docs/architecture.md` for the database design, risks and remaining verification gates. The paper form image in `assets` is a design reference, not an extracted logo.

## Portable backup

The development build can export a password-protected `.evabackup` containing the database. The password is not stored and cannot be recovered. ID values and undo history are re-encrypted for the destination account during restore. Separately stored attachments are not included. The implementation uses scrypt and AES-256-GCM; its portability and recovery have not been tested on actual Windows machines or independently security-reviewed. Do not rely on it for real guest records yet.

## Windows development build in GitHub Actions

On pushes to `main`, pull requests, or a manual workflow dispatch, the Windows build workflow installs dependencies, runs the TypeScript and Vitest checks, builds an NSIS installer and a portable executable, and uploads them as a development artifact for 14 days. Tagged versions also prepare a draft release. The resulting files are development builds and must not be used for real guest records until the unresolved issues and Windows testing are complete.

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

`npm run test:e2e` uses Playwright to launch the built Electron application against an isolated temporary database. Run it after `npm run dist:win` on Windows so the SQLite native module targets Electron. It exercises the real preload/IPC and database, creates fake guests and companions, checks in, transfers a unit, records a payment, selects a returning guest, rejects an unacknowledged duplicate, permits a shared family phone, closes the day and checks persistence after restarting. It also renders filled/blank registration forms and a receipt through Electron `printToPDF`, checks each is one page, and saves PDFs/screenshots to `test-results`.

Both Windows workflows now run this check before uploading executables or drafting a release. The separate UI artifact contains only synthetic test records. This test does not install NSIS on a clean PC, exercise a physical printer, or establish complete visual fidelity to the paper original. Local execution in the current Linux environment is blocked by the absence of a display server; Windows CI is the execution target.
