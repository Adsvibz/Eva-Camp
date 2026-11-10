BEGIN IMMEDIATE;
CREATE TABLE booking_unit_segments (
 id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), unit_id INTEGER NOT NULL REFERENCES units(id),
 start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 CHECK(length(start_date)=10 AND date(start_date,'+0 days') IS start_date),
 CHECK(length(end_date)=10 AND date(end_date,'+0 days') IS end_date), CHECK(start_date<end_date)
);
CREATE INDEX booking_segments_unit_dates ON booking_unit_segments(unit_id,start_date,end_date);
CREATE INDEX booking_segments_booking ON booking_unit_segments(booking_id,start_date);
INSERT INTO booking_unit_segments(booking_id,unit_id,start_date,end_date)
 SELECT id,unit_id,arrival_date,departure_date FROM bookings;
DROP TRIGGER booking_no_overlap_insert;
DROP TRIGGER booking_no_overlap_update;
CREATE TRIGGER segment_no_overlap_insert BEFORE INSERT ON booking_unit_segments BEGIN
 SELECT RAISE(ABORT,'unit booking overlaps') WHERE EXISTS (
  SELECT 1 FROM booking_unit_segments s JOIN bookings other ON other.id=s.booking_id JOIN bookings current ON current.id=NEW.booking_id
  WHERE current.deleted_at IS NULL AND current.status IN ('reserved','checked-in') AND other.deleted_at IS NULL AND other.status IN ('reserved','checked-in')
  AND (s.unit_id=NEW.unit_id OR s.booking_id=NEW.booking_id) AND NEW.start_date<s.end_date AND s.start_date<NEW.end_date
 );
END;
CREATE TRIGGER segment_no_overlap_update BEFORE UPDATE OF unit_id,start_date,end_date ON booking_unit_segments BEGIN
 SELECT RAISE(ABORT,'unit booking overlaps') WHERE EXISTS (
  SELECT 1 FROM booking_unit_segments s JOIN bookings other ON other.id=s.booking_id JOIN bookings current ON current.id=NEW.booking_id
  WHERE s.id<>NEW.id AND current.deleted_at IS NULL AND current.status IN ('reserved','checked-in') AND other.deleted_at IS NULL AND other.status IN ('reserved','checked-in')
  AND (s.unit_id=NEW.unit_id OR s.booking_id=NEW.booking_id) AND NEW.start_date<s.end_date AND s.start_date<NEW.end_date
 );
END;
CREATE TRIGGER booking_initial_segment AFTER INSERT ON bookings BEGIN
 INSERT INTO booking_unit_segments(booking_id,unit_id,start_date,end_date) VALUES (NEW.id,NEW.unit_id,NEW.arrival_date,NEW.departure_date);
END;
CREATE TRIGGER booking_restore_conflict BEFORE UPDATE OF status,deleted_at ON bookings WHEN NEW.deleted_at IS NULL AND NEW.status IN ('reserved','checked-in') AND (OLD.deleted_at IS NOT NULL OR OLD.status NOT IN ('reserved','checked-in')) BEGIN
 SELECT RAISE(ABORT,'unit booking overlaps') WHERE EXISTS (
  SELECT 1 FROM booking_unit_segments own JOIN booking_unit_segments s ON s.unit_id=own.unit_id AND s.booking_id<>own.booking_id
  JOIN bookings other ON other.id=s.booking_id WHERE own.booking_id=NEW.id AND other.deleted_at IS NULL AND other.status IN ('reserved','checked-in')
  AND own.start_date<s.end_date AND s.start_date<own.end_date
 );
END;
CREATE TRIGGER booking_checked_in_consistency BEFORE UPDATE OF arrival_date,unit_id ON bookings WHEN OLD.status='checked-in' AND NEW.status='checked-in' BEGIN
 SELECT RAISE(ABORT,'checked-in segment mismatch') WHERE NEW.arrival_date<>OLD.arrival_date OR NOT EXISTS (
  SELECT 1 FROM booking_unit_segments s WHERE s.booking_id=OLD.id AND s.unit_id=NEW.unit_id AND s.id=(SELECT id FROM booking_unit_segments WHERE booking_id=OLD.id ORDER BY start_date DESC,id DESC LIMIT 1)
 );
END;
CREATE TRIGGER booking_sync_segments AFTER UPDATE OF arrival_date,departure_date,unit_id ON bookings BEGIN
 DELETE FROM booking_unit_segments WHERE booking_id=NEW.id AND NEW.status='reserved';
 INSERT INTO booking_unit_segments(booking_id,unit_id,start_date,end_date)
  SELECT NEW.id,NEW.unit_id,NEW.arrival_date,NEW.departure_date WHERE NEW.status='reserved';
 UPDATE booking_unit_segments SET end_date=NEW.departure_date WHERE NEW.status='checked-in' AND id=(SELECT id FROM booking_unit_segments WHERE booking_id=NEW.id ORDER BY start_date DESC,id DESC LIMIT 1);
END;
INSERT INTO schema_migrations(version) VALUES (2);
COMMIT;
