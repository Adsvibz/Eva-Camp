import type Database from 'better-sqlite3'
import { guestHistorySchema, searchSchema, type GuestProfile, type GuestHistoryInput, type GuestHistoryPage, type BookingRow } from '../shared/contracts'
import { normalizePhone } from '../shared/phone'

const profileFields = `id,full_name AS fullName,COALESCE(mobile_whatsapp,'') AS phone,nationality,email,date_of_birth AS dateOfBirth,country,home_address AS address,notes,(id_passport_ciphertext IS NOT NULL) AS hasPrimaryId`

export class GuestDirectory {
  constructor(private db: Database.Database) {}

  find(query: string): GuestProfile[] {
    const value = searchSchema.parse(query)
    if (!value) return []
    const phone = normalizePhone(value)
    if (phone.length >= 7 && /^[+\d\s().\-٠-٩۰-۹]+$/.test(value)) return this.matchPhone(value)
    const pattern = value.replace(/[\\%_]/g, '\\$&') + '%'
    return this.db.prepare(`SELECT ${profileFields} FROM guests WHERE deleted_at IS NULL AND full_name LIKE ? ESCAPE '\\' ORDER BY full_name COLLATE NOCASE,id LIMIT 20`).all(pattern) as GuestProfile[]
  }

  matchPhone(value: string): GuestProfile[] {
    const phone = normalizePhone(searchSchema.parse(value))
    if (phone.length < 7) return []
    return this.db.prepare(`SELECT ${profileFields} FROM guests WHERE deleted_at IS NULL AND normalized_phone=? ORDER BY id LIMIT 20`).all(phone) as GuestProfile[]
  }

  history(input: GuestHistoryInput): GuestHistoryPage {
    const {guestId,offset} = guestHistorySchema.parse(input)
    if (!this.db.prepare('SELECT id FROM guests WHERE id=? AND deleted_at IS NULL').get(guestId)) throw new Error('Guest unavailable')
    const rows = this.db.prepare(`SELECT b.id,b.booking_reference AS reference,g.full_name AS fullName,u.name AS unitName,b.arrival_date AS arrival,b.departure_date AS departure,b.status,v.total_piasters AS totalPiasters,v.paid_piasters AS paidPiasters,v.balance_piasters AS balancePiasters FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units u ON u.id=b.unit_id JOIN booking_balances v ON v.booking_id=b.id WHERE b.guest_id=? AND b.deleted_at IS NULL ORDER BY b.arrival_date DESC,b.id DESC LIMIT 51 OFFSET ?`).all(guestId,offset) as BookingRow[]
    return {rows:rows.slice(0,50),hasMore:rows.length>50}
  }
}
