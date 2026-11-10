import sqlite3
import unittest
from pathlib import Path

SQL = (Path(__file__).parents[1] / 'db/migrations/0001_initial.sql').read_text()

class SchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(SQL)
        self.db.execute("INSERT INTO guests(full_name) VALUES ('عميل تجريبي')")
        self.db.execute("INSERT INTO units(name,type,capacity) VALUES ('1','room',2)")

    def book(self, ref, start, end, status='reserved'):
        self.db.execute('INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,total_piasters,status,source) VALUES (?,1,1,?,?,1,100000,?,\'phone\')', (ref,start,end,status))

    def test_overlap_and_back_to_back(self):
        self.book('A','2026-11-01','2026-11-03')
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'overlaps'):
            self.book('B','2026-11-02','2026-11-04')
        self.book('C','2026-11-03','2026-11-05')
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'overlaps'):
            self.db.execute("UPDATE bookings SET arrival_date='2026-11-02' WHERE booking_reference='C'")

    def test_cancelled_and_restore(self):
        self.book('A','2026-11-01','2026-11-03','cancelled')
        self.book('B','2026-11-01','2026-11-03')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE bookings SET status='reserved' WHERE booking_reference='A'")

    def test_balances_with_extras_and_refund(self):
        self.book('A','2026-11-01','2026-11-03')
        self.db.execute("INSERT INTO booking_extras(booking_id,description,quantity,unit_price_piasters) VALUES (1,'Meal',2,5000)")
        self.db.execute("INSERT INTO payments(booking_id,amount_piasters,method,payment_date,receipt_no) VALUES (1,40000,'cash','2026-11-01','R1')")
        self.db.execute("INSERT INTO payments(booking_id,amount_piasters,method,payment_date,receipt_no) VALUES (1,-10000,'cash','2026-11-01','R2')")
        self.assertEqual(self.db.execute('SELECT paid_piasters,balance_piasters FROM booking_balances').fetchone(),(30000,80000))

    def test_invalid_dates_and_foreign_keys(self):
        with self.assertRaises(sqlite3.IntegrityError): self.book('A','2026-02-30','2026-03-03')
        with self.assertRaises(sqlite3.IntegrityError): self.db.execute("INSERT INTO payments(booking_id,amount_piasters,method,payment_date,receipt_no) VALUES (999,1,'cash','2026-11-01','R1')")

if __name__ == '__main__': unittest.main()
