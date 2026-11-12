BEGIN IMMEDIATE;
ALTER TABLE declarations ADD COLUMN signature_json TEXT;
ALTER TABLE declarations ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE declarations ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1));
INSERT OR IGNORE INTO declarations(booking_id,confirmation_text) SELECT id,'' FROM bookings;
CREATE TRIGGER declaration_on_booking AFTER INSERT ON bookings BEGIN
 INSERT INTO declarations(booking_id,confirmation_text) VALUES (NEW.id,'');
END;

CREATE TRIGGER declaration_booking_changed AFTER UPDATE ON bookings WHEN OLD.guest_id IS NOT NEW.guest_id OR OLD.unit_id IS NOT NEW.unit_id OR OLD.booking_reference IS NOT NEW.booking_reference OR OLD.arrival_date IS NOT NEW.arrival_date OR OLD.departure_date IS NOT NEW.departure_date OR OLD.adults_count IS NOT NEW.adults_count OR OLD.children_count IS NOT NEW.children_count OR OLD.total_piasters IS NOT NEW.total_piasters OR OLD.discount_piasters IS NOT NEW.discount_piasters OR OLD.deleted_at IS NOT NEW.deleted_at BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=NEW.id;
END;

CREATE TRIGGER declaration_guest_changed AFTER UPDATE ON guests WHEN OLD.full_name IS NOT NEW.full_name OR OLD.nationality IS NOT NEW.nationality OR OLD.date_of_birth IS NOT NEW.date_of_birth OR OLD.mobile_whatsapp IS NOT NEW.mobile_whatsapp OR OLD.email IS NOT NEW.email OR OLD.id_passport_ciphertext IS NOT NEW.id_passport_ciphertext OR OLD.country IS NOT NEW.country OR OLD.home_address IS NOT NEW.home_address OR OLD.deleted_at IS NOT NEW.deleted_at BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id IN (SELECT id FROM bookings WHERE guest_id=NEW.id);
END;

CREATE TRIGGER declaration_unit_changed AFTER UPDATE ON units WHEN OLD.name IS NOT NEW.name OR OLD.type IS NOT NEW.type BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id IN (SELECT id FROM bookings WHERE unit_id=NEW.id);
END;

CREATE TRIGGER declaration_additional_guests_changed AFTER UPDATE ON additional_guests WHEN OLD.booking_id IS NOT NEW.booking_id OR OLD.full_name IS NOT NEW.full_name OR OLD.id_passport_ciphertext IS NOT NEW.id_passport_ciphertext OR OLD.deleted_at IS NOT NEW.deleted_at BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id IN (OLD.booking_id,NEW.booking_id);
END;

CREATE TRIGGER declaration_additional_guests_insert AFTER INSERT ON additional_guests BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=NEW.booking_id;
END;

CREATE TRIGGER declaration_additional_guests_delete AFTER DELETE ON additional_guests BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=OLD.booking_id;
END;

CREATE TRIGGER declaration_payments_changed AFTER UPDATE ON payments WHEN OLD.booking_id IS NOT NEW.booking_id OR OLD.amount_piasters IS NOT NEW.amount_piasters OR OLD.deleted_at IS NOT NEW.deleted_at BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id IN (OLD.booking_id,NEW.booking_id);
END;

CREATE TRIGGER declaration_payments_insert AFTER INSERT ON payments BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=NEW.booking_id;
END;

CREATE TRIGGER declaration_payments_delete AFTER DELETE ON payments BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=OLD.booking_id;
END;

CREATE TRIGGER declaration_booking_extras_changed AFTER UPDATE ON booking_extras WHEN OLD.booking_id IS NOT NEW.booking_id OR OLD.quantity IS NOT NEW.quantity OR OLD.unit_price_piasters IS NOT NEW.unit_price_piasters OR OLD.description IS NOT NEW.description OR OLD.deleted_at IS NOT NEW.deleted_at BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id IN (OLD.booking_id,NEW.booking_id);
END;

CREATE TRIGGER declaration_booking_extras_insert AFTER INSERT ON booking_extras BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=NEW.booking_id;
END;

CREATE TRIGGER declaration_booking_extras_delete AFTER DELETE ON booking_extras BEGIN
 UPDATE declarations SET is_current=0,revision=revision+1 WHERE booking_id=OLD.booking_id;
END;

INSERT INTO schema_migrations(version) VALUES (4);
COMMIT;
