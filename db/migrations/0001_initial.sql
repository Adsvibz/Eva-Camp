PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TABLE guests (
 id INTEGER PRIMARY KEY, full_name TEXT NOT NULL CHECK(length(trim(full_name))>0), nationality TEXT, date_of_birth TEXT,
 mobile_whatsapp TEXT, email TEXT, id_passport_ciphertext BLOB, id_passport_lookup TEXT, country TEXT, home_address TEXT, notes TEXT,
 id_scan_path TEXT, vip INTEGER NOT NULL DEFAULT 0 CHECK(vip IN (0,1)), blacklisted INTEGER NOT NULL DEFAULT 0 CHECK(blacklisted IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT
);
CREATE INDEX guests_name_idx ON guests(full_name) WHERE deleted_at IS NULL;
CREATE INDEX guests_phone_idx ON guests(mobile_whatsapp) WHERE deleted_at IS NULL;
CREATE INDEX guests_id_lookup_idx ON guests(id_passport_lookup) WHERE deleted_at IS NULL;
CREATE TABLE units (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity>0),
 base_price_piasters INTEGER NOT NULL DEFAULT 0 CHECK(base_price_piasters>=0),
 housekeeping_status TEXT NOT NULL DEFAULT 'available' CHECK(housekeeping_status IN ('available','cleaning','maintenance')),
 notes TEXT, deleted_at TEXT
);
CREATE TABLE seasonal_rates (
 id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES units(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 price_piasters INTEGER NOT NULL CHECK(price_piasters>=0), CHECK(start_date<end_date)
);
CREATE TABLE bookings (
 id INTEGER PRIMARY KEY, booking_reference TEXT NOT NULL UNIQUE, guest_id INTEGER NOT NULL REFERENCES guests(id),
 unit_id INTEGER NOT NULL REFERENCES units(id), arrival_date TEXT NOT NULL, departure_date TEXT NOT NULL,
 adults_count INTEGER NOT NULL CHECK(adults_count>0), children_count INTEGER NOT NULL DEFAULT 0 CHECK(children_count>=0),
 total_piasters INTEGER NOT NULL CHECK(total_piasters>=0), discount_piasters INTEGER NOT NULL DEFAULT 0 CHECK(discount_piasters>=0 AND discount_piasters<=total_piasters),
 status TEXT NOT NULL CHECK(status IN ('reserved','checked-in','checked-out','cancelled')),
 source TEXT NOT NULL CHECK(source IN ('walk-in','phone','whatsapp','agency')), notes TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT,
 CHECK(length(arrival_date)=10 AND date(arrival_date,'+0 days') IS arrival_date),
 CHECK(length(departure_date)=10 AND date(departure_date,'+0 days') IS departure_date), CHECK(arrival_date<departure_date)
);
CREATE INDEX bookings_guest_idx ON bookings(guest_id,arrival_date);
CREATE INDEX bookings_calendar_idx ON bookings(unit_id,arrival_date,departure_date,status) WHERE deleted_at IS NULL;
CREATE INDEX bookings_dates_idx ON bookings(arrival_date,departure_date) WHERE deleted_at IS NULL;
CREATE TRIGGER booking_no_overlap_insert BEFORE INSERT ON bookings WHEN NEW.deleted_at IS NULL AND NEW.status IN ('reserved','checked-in') BEGIN
 SELECT RAISE(ABORT,'unit booking overlaps') WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.unit_id=NEW.unit_id AND b.deleted_at IS NULL AND b.status IN ('reserved','checked-in') AND NEW.arrival_date<b.departure_date AND b.arrival_date<NEW.departure_date);
END;
CREATE TRIGGER booking_no_overlap_update BEFORE UPDATE OF unit_id,arrival_date,departure_date,status,deleted_at ON bookings WHEN NEW.deleted_at IS NULL AND NEW.status IN ('reserved','checked-in') BEGIN
 SELECT RAISE(ABORT,'unit booking overlaps') WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.id<>NEW.id AND b.unit_id=NEW.unit_id AND b.deleted_at IS NULL AND b.status IN ('reserved','checked-in') AND NEW.arrival_date<b.departure_date AND b.arrival_date<NEW.departure_date);
END;
CREATE TABLE additional_guests (id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), full_name TEXT NOT NULL CHECK(length(trim(full_name))>0), id_passport_ciphertext BLOB, id_passport_lookup TEXT, deleted_at TEXT);
CREATE INDEX additional_guests_booking_idx ON additional_guests(booking_id);
CREATE TABLE declarations (booking_id INTEGER PRIMARY KEY REFERENCES bookings(id), confirmation_text TEXT NOT NULL, signature_path TEXT, received_by TEXT, signed_date TEXT);
CREATE TABLE payments (
 id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), amount_piasters INTEGER NOT NULL CHECK(amount_piasters<>0),
 method TEXT NOT NULL CHECK(method IN ('cash','card','transfer')), payment_date TEXT NOT NULL,
 receipt_no TEXT NOT NULL UNIQUE, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT,
 CHECK(length(payment_date)=10 AND date(payment_date,'+0 days') IS payment_date)
);
CREATE INDEX payments_booking_idx ON payments(booking_id) WHERE deleted_at IS NULL;
CREATE INDEX payments_date_idx ON payments(payment_date,method) WHERE deleted_at IS NULL;
CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit_price_piasters INTEGER NOT NULL CHECK(unit_price_piasters>=0), deleted_at TEXT);
CREATE TABLE booking_extras (id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), service_id INTEGER REFERENCES services(id), description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), unit_price_piasters INTEGER NOT NULL CHECK(unit_price_piasters>=0), deleted_at TEXT);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, actor TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, detail_json TEXT);
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE sequences (name TEXT NOT NULL, year INTEGER NOT NULL, value INTEGER NOT NULL CHECK(value>=0), PRIMARY KEY(name,year));
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO schema_migrations(version) VALUES (1);
CREATE VIEW booking_balances AS SELECT b.id AS booking_id, b.total_piasters, b.discount_piasters, COALESCE((SELECT sum(e.quantity*e.unit_price_piasters) FROM booking_extras e WHERE e.booking_id=b.id AND e.deleted_at IS NULL),0) AS extras_piasters, COALESCE((SELECT sum(p.amount_piasters) FROM payments p WHERE p.booking_id=b.id AND p.deleted_at IS NULL),0) AS paid_piasters, b.total_piasters-b.discount_piasters+COALESCE((SELECT sum(e.quantity*e.unit_price_piasters) FROM booking_extras e WHERE e.booking_id=b.id AND e.deleted_at IS NULL),0)-COALESCE((SELECT sum(p.amount_piasters) FROM payments p WHERE p.booking_id=b.id AND p.deleted_at IS NULL),0) AS balance_piasters FROM bookings b WHERE b.deleted_at IS NULL;
COMMIT;
