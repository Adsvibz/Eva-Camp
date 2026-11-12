BEGIN IMMEDIATE;
CREATE TABLE declaration_archive_fonts (
 bundle_hash TEXT PRIMARY KEY,
 fonts_json TEXT NOT NULL
);
CREATE TABLE declaration_archives (
 id INTEGER PRIMARY KEY,
 booking_id INTEGER NOT NULL REFERENCES bookings(id),
 change_id INTEGER NOT NULL UNIQUE REFERENCES audit_log(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 signed_date TEXT NOT NULL,
 received_by TEXT NOT NULL,
 has_signature INTEGER NOT NULL CHECK(has_signature IN (0,1)),
 document_ciphertext BLOB NOT NULL,
 cipher_hash TEXT NOT NULL,
 fonts_hash TEXT NOT NULL REFERENCES declaration_archive_fonts(bundle_hash)
);
CREATE INDEX declaration_archives_booking_idx ON declaration_archives(booking_id,id DESC);
CREATE INDEX declaration_undo_lookup ON audit_log(entity_id,json_extract(detail_json,'$.changeId')) WHERE action='declaration-undo' AND entity_type='booking';
INSERT INTO schema_migrations(version) VALUES (5);
COMMIT;
