BEGIN IMMEDIATE;
ALTER TABLE guests ADD COLUMN normalized_phone TEXT NOT NULL DEFAULT '';
-- Convert Western, Arabic and Persian digits without storing a second raw ID value.
WITH RECURSIVE phone_digits(id,rest,digits) AS (
 SELECT id,COALESCE(mobile_whatsapp,''),'' FROM guests
 UNION ALL
 SELECT id,substr(rest,2),digits || CASE
  WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1)
  WHEN instr('٠١٢٣٤٥٦٧٨٩',substr(rest,1,1))>0 THEN CAST(instr('٠١٢٣٤٥٦٧٨٩',substr(rest,1,1))-1 AS TEXT)
  WHEN instr('۰۱۲۳۴۵۶۷۸۹',substr(rest,1,1))>0 THEN CAST(instr('۰۱۲۳۴۵۶۷۸۹',substr(rest,1,1))-1 AS TEXT)
  ELSE '' END
 FROM phone_digits WHERE rest<>''
), international AS (
 SELECT id,CASE WHEN substr(digits,1,2)='00' THEN substr(digits,3) ELSE digits END AS number FROM phone_digits WHERE rest=''
)
UPDATE guests SET normalized_phone=(SELECT CASE WHEN length(number)=11 AND substr(number,1,2)='01' AND substr(number,3,1) IN ('0','1','2','5') THEN '20'||substr(number,2) ELSE number END FROM international WHERE international.id=guests.id);
CREATE INDEX guests_normalized_phone_idx ON guests(normalized_phone) WHERE deleted_at IS NULL;
CREATE INDEX guests_name_prefix_idx ON guests(full_name COLLATE NOCASE) WHERE deleted_at IS NULL;
INSERT INTO schema_migrations(version) VALUES (3);
COMMIT;
