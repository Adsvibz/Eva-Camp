import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CampRepository } from '../src/main/repository'

describe('camp repository', () => {
 let repo: CampRepository
 beforeEach(() => { const db = new Database(':memory:'); db.exec(readFileSync(join(process.cwd(), 'db/migrations/0001_initial.sql'), 'utf8')); repo = new CampRepository(db) })
 it('creates a guest and booking together with a reference and audit entries', () => {
   const unit = repo.createUnit({ name: '1', type: 'room', capacity: 2, pricePiasters: 150000 })
   const result = repo.createBooking({ fullName: 'محمد علي', phone: '01000000000', unitId: unit, arrival: '2026-11-01', departure: '2026-11-03', adults: 2, children: 0, totalPiasters: 300000, source: 'phone' })
   expect(result.reference).toBe('EVA-2026-0001')
   expect(repo.listBookings()[0]).toMatchObject({ fullName: 'محمد علي', balancePiasters: 300000 })
   expect(repo.countAudit()).toBe(2)
 })
 it('rolls back guest creation and reference sequence on overlap', () => {
   const unit = repo.createUnit({ name: '1', type: 'room', capacity: 2, pricePiasters: 10000 })
   const details = { fullName: 'One', phone: '', unitId: unit, arrival: '2026-11-01', departure: '2026-11-03', adults: 1, children: 0, totalPiasters: 20000, source: 'phone' as const }
   repo.createBooking(details)
   expect(() => repo.createBooking({ ...details, fullName: 'Two' })).toThrow()
   expect(repo.listBookings()).toHaveLength(1)
   expect(repo.guestCount()).toBe(1)
   const next = repo.createBooking({ ...details, arrival: '2026-11-03', departure: '2026-11-04' })
   expect(next.reference).toBe('EVA-2026-0002')
 })
 it('records partial payments and refunds and updates computed balance', () => {
   const unit = repo.createUnit({ name: '1', type: 'room', capacity: 2, pricePiasters: 10000 })
   const booking = repo.createBooking({ fullName: 'Guest', phone: '', unitId: unit, arrival: '2026-11-01', departure: '2026-11-03', adults: 1, children: 0, totalPiasters: 20000, source: 'phone' })
   const paymentId=repo.addPayment({ bookingId: booking.id, amountPiasters: 12000, method: 'cash', date: '2026-11-01' })
   expect(repo.receiptData(paymentId)).toMatchObject({guestName:'Guest',amountPiasters:12000,receiptNo:'R-2026-0001'})
   repo.addPayment({ bookingId: booking.id, amountPiasters: -2000, method: 'cash', date: '2026-11-01' })
   expect(repo.listBookings()[0]).toMatchObject({ paidPiasters: 10000, balancePiasters: 10000 })
 })
})

describe('guest companions and stay status', () => {
 let repo: CampRepository
 let db: Database.Database
 beforeEach(() => { db = new Database(':memory:'); db.exec(readFileSync(join(process.cwd(), 'db/migrations/0001_initial.sql'), 'utf8')); repo = new CampRepository(db, (text) => Buffer.from(`encrypted:${text}`), (value) => value.toString().replace('encrypted:','')) })
 it('saves guest details and companion identity with the booking', () => {
  const unit=repo.createUnit({name:'C1',type:'chalet',capacity:4,pricePiasters:0})
  const result=repo.createBooking({fullName:'مريم أحمد',phone:'0101',unitId:unit,arrival:'2026-12-01',departure:'2026-12-04',adults:2,children:1,totalPiasters:30000,source:'phone',nationality:'Egyptian',email:'guest@example.com',dateOfBirth:'1990-01-20',country:'Egypt',address:'Cairo',notes:'Near the sea',idNumber:'P123',companions:[{fullName:'علي أحمد',idNumber:'P456'}]})
  expect(repo.getBooking(result.id)).toMatchObject({fullName:'مريم أحمد',nationality:'Egyptian',email:'guest@example.com',dateOfBirth:'1990-01-20',country:'Egypt',address:'Cairo',notes:'Near the sea',companions:[{fullName:'علي أحمد'}]})
  expect(repo.registrationData(result.id)).toMatchObject({idNumber:'P123',companions:[{fullName:'علي أحمد',idNumber:'P456'}]})
  expect((db.prepare('SELECT id_passport_ciphertext AS value FROM guests').get() as {value:Buffer}).value.toString()).toBe('encrypted:P123')
  expect((db.prepare('SELECT id_passport_ciphertext AS value FROM additional_guests').get() as {value:Buffer}).value.toString()).toBe('encrypted:P456')
 })
 it('only permits valid status transitions and preserves overlap protection', () => {
  const unit=repo.createUnit({name:'R1',type:'room',capacity:2,pricePiasters:0})
  const input={fullName:'Guest',phone:'',unitId:unit,arrival:'2026-12-01',departure:'2026-12-04',adults:1,children:0,totalPiasters:0,source:'phone' as const}
  const first=repo.createBooking(input)
  expect(()=>repo.changeStatus(first.id,'checked-out')).toThrow()
  repo.changeStatus(first.id,'checked-in')
  repo.changeStatus(first.id,'checked-out')
  expect(repo.getBooking(first.id)?.status).toBe('checked-out')
  expect(()=>repo.changeStatus(first.id,'reserved')).toThrow()
  expect(repo.countAudit()).toBe(4)
 })
 it('allows undoing a cancellation only when the unit is still available', () => {
  const unit=repo.createUnit({name:'R1',type:'room',capacity:2,pricePiasters:0})
  const input={fullName:'Guest',phone:'',unitId:unit,arrival:'2026-12-01',departure:'2026-12-04',adults:1,children:0,totalPiasters:0,source:'phone' as const}
  const first=repo.createBooking(input)
  repo.changeStatus(first.id,'cancelled')
  repo.changeStatus(first.id,'reserved')
  repo.changeStatus(first.id,'cancelled')
  repo.createBooking({...input,fullName:'Other'})
  expect(()=>repo.changeStatus(first.id,'reserved')).toThrow('overlaps')
  expect(repo.getBooking(first.id)?.status).toBe('cancelled')
 })
 it('rejects ID data when an encryption provider is unavailable without creating any record', () => {
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const unprotected=new CampRepository(db)
  const unit=unprotected.createUnit({name:'R2',type:'room',capacity:1,pricePiasters:0})
  expect(()=>unprotected.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-12-01',departure:'2026-12-04',adults:1,children:0,totalPiasters:0,source:'phone',idNumber:'123'})).toThrow()
  expect(unprotected.guestCount()).toBe(0)
 })
})
describe('daily closing',()=>{
 it('calculates collections and refunds by method, closes the day, and allows an audited reopening',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db)
  const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const booking=repo.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-10',departure:'2026-11-11',adults:1,children:0,totalPiasters:100000,source:'phone'})
  repo.addPayment({bookingId:booking.id,amountPiasters:30000,method:'cash',date:'2026-11-10'});repo.addPayment({bookingId:booking.id,amountPiasters:-5000,method:'cash',date:'2026-11-10'});repo.addPayment({bookingId:booking.id,amountPiasters:40000,method:'card',date:'2026-11-10'})
  expect(repo.dailyReport('2026-11-10')).toMatchObject({cash:25000,card:40000,transfer:0,net:65000,refunds:5000,closed:false})
  repo.closeDay('2026-11-10');expect(repo.dailyReport('2026-11-10').closed).toBe(true)
  expect(()=>repo.addPayment({bookingId:booking.id,amountPiasters:100,method:'cash',date:'2026-11-10'})).toThrow('closed')
  expect(()=>repo.closeDay('2026-11-10')).toThrow()
  repo.reopenDay('2026-11-10');repo.addPayment({bookingId:booking.id,amountPiasters:100,method:'cash',date:'2026-11-10'});expect(repo.dailyReport('2026-11-10').net).toBe(65100)
  expect(repo.countAudit()).toBe(8);db.close()
 })
})
describe('booking calendar and rescheduling',()=>{
 it('queries stays intersecting the requested interval, independent of the recent list limit',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db)
  const u=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:u,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone'})
  expect(repo.calendar('2026-11-02','2026-11-04')).toMatchObject([{id:b.id,unitId:u,fullName:'Guest'}]);expect(repo.calendar('2026-11-03','2026-11-04')).toEqual([]);db.close()
 })
 it('moves or extends reserved stays atomically and rejects conflicts and insufficient capacity',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db)
  const one=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0}),two=repo.createUnit({name:'B',type:'room',capacity:1,pricePiasters:0});const input={fullName:'Guest',phone:'',unitId:one,arrival:'2026-11-01',departure:'2026-11-03',adults:2,children:0,totalPiasters:0,source:'phone' as const}
  const first=repo.createBooking(input);const other=repo.createBooking({...input,arrival:'2026-11-03',departure:'2026-11-05'})
  expect(()=>repo.reschedule({bookingId:first.id,unitId:one,arrival:'2026-11-01',departure:'2026-11-04'})).toThrow('overlaps')
  expect(()=>repo.reschedule({bookingId:first.id,unitId:two,arrival:'2026-11-01',departure:'2026-11-03'})).toThrow('capacity')
  expect(repo.getBooking(first.id)?.departure).toBe('2026-11-03');repo.reschedule({bookingId:other.id,unitId:one,arrival:'2026-11-04',departure:'2026-11-06'})
  repo.reschedule({bookingId:first.id,unitId:one,arrival:'2026-11-01',departure:'2026-11-04'});expect(repo.getBooking(first.id)?.departure).toBe('2026-11-04');db.close()
 })
 it('permits a checked-in stay extension but prevents rewriting its arrival or previous unit',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db)
  const one=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0}),two=repo.createUnit({name:'B',type:'room',capacity:2,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:one,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone'});repo.changeStatus(b.id,'checked-in')
  expect(()=>repo.reschedule({bookingId:b.id,unitId:two,arrival:'2026-11-01',departure:'2026-11-04'})).toThrow();expect(()=>repo.reschedule({bookingId:b.id,unitId:one,arrival:'2026-11-02',departure:'2026-11-04'})).toThrow()
  repo.reschedule({bookingId:b.id,unitId:one,arrival:'2026-11-01',departure:'2026-11-04'});expect(repo.getBooking(b.id)?.departure).toBe('2026-11-04');db.close()
 })
})
it('finds calendar entries even if they are outside the newest 500 bookings',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const old=repo.createBooking({fullName:'Old stay',phone:'',unitId:unit,arrival:'2026-01-01',departure:'2026-01-02',adults:1,children:0,totalPiasters:0,source:'phone'})
 const insert=db.prepare("INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,total_piasters,status,source) VALUES (?,1,?,'2027-01-01','2027-01-02',1,0,'cancelled','phone')");db.transaction(()=>{for(let i=0;i<501;i++)insert.run(`later-${i}`,unit)})()
 expect(repo.listBookings().find(b=>b.id===old.id)).toBeUndefined();expect(repo.calendar('2026-01-01','2026-01-02').map(b=>b.id)).toContain(old.id);db.close()
})
it('rejects an attempted undo when another booking now occupies the original dates',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const data={fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone' as const};const first=repo.createBooking(data)
 repo.reschedule({bookingId:first.id,unitId:unit,arrival:'2026-11-05',departure:'2026-11-07'});repo.createBooking({...data,fullName:'New guest'});expect(()=>repo.reschedule({bookingId:first.id,unitId:unit,arrival:data.arrival,departure:data.departure})).toThrow('overlaps');expect(repo.getBooking(first.id)?.arrival).toBe('2026-11-05');db.close()
})
describe('guest and booking search',()=>{
 it('finds bookings by guest name, phone, and reference using literal search characters',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const b=repo.createBooking({fullName:'محمد علي',phone:'01012345678',unitId:unit,arrival:'2026-10-01',departure:'2026-10-03',adults:1,children:0,totalPiasters:0,source:'phone'})
  expect(repo.searchBookings('محمد').map(v=>v.id)).toContain(b.id);expect(repo.searchBookings('012345').map(v=>v.id)).toContain(b.id);expect(repo.searchBookings(b.reference).map(v=>v.id)).toContain(b.id);expect(repo.searchBookings('%')).toEqual([]);expect(repo.searchBookings('   ')).toEqual([]);db.close()
 })
})
it('rejects calendar edits for cancelled bookings and invalid date ranges',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const booking=repo.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone'});repo.changeStatus(booking.id,'cancelled')
 expect(()=>repo.reschedule({bookingId:booking.id,unitId:unit,arrival:'2026-11-02',departure:'2026-11-04'})).toThrow();expect(()=>repo.calendar('2026-02-30','2026-03-03')).toThrow();expect(()=>repo.calendar('2026-01-01','2027-01-01')).toThrow();db.close()
})
describe('booking details editing',()=>{
 it('updates guest and booking details in one transaction without altering payments or encrypted IDs',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db,(s)=>Buffer.from('sealed:'+s))
  const unit=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});const booking=repo.createBooking({fullName:'Guest',phone:'010',unitId:unit,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:10000,source:'phone',idNumber:'ABC'});repo.addPayment({bookingId:booking.id,amountPiasters:2500,method:'cash',date:'2026-11-01'})
  repo.updateBookingDetails({bookingId:booking.id,fullName:'اسم جديد',phone:'012',nationality:'Egyptian',email:'new@example.com',dateOfBirth:'1990-01-01',country:'Egypt',address:'Cairo',notes:'Note',adults:1,children:1,totalPiasters:15000,source:'agency'})
  expect(repo.getBooking(booking.id)).toMatchObject({fullName:'اسم جديد',phone:'012',adults:1,children:1,totalPiasters:15000,paidPiasters:2500,balancePiasters:12500,source:'agency'})
  expect((db.prepare('SELECT id_passport_ciphertext AS c FROM guests').get() as {c:Buffer}).c.toString()).toBe('sealed:ABC');expect(repo.countAudit()).toBe(4);const audit=(db.prepare("SELECT detail_json FROM audit_log WHERE action='update'").get() as {detail_json:string}).detail_json;expect(JSON.parse(audit).changedGuestFields).toContain('fullName');expect(audit).not.toContain('اسم جديد')
  expect(()=>repo.updateBookingDetails({bookingId:booking.id,fullName:'Invalid',phone:'',adults:2,children:1,totalPiasters:20000,source:'phone'})).toThrow('capacity');expect(repo.getBooking(booking.id)?.fullName).toBe('اسم جديد');db.close()
 })
})
describe('date-filtered management reports',()=>{
 it('separates net collections from booking values and counts scheduled nights within the selected dates',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const room=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});repo.createUnit({name:'B',type:'room',capacity:2,pricePiasters:0})
  const stay=repo.createBooking({fullName:'Guest',phone:'',nationality:'Egyptian',unitId:room,arrival:'2026-11-01',departure:'2026-11-04',adults:1,children:0,totalPiasters:100000,source:'phone'})
  repo.addPayment({bookingId:stay.id,amountPiasters:40000,method:'cash',date:'2026-11-02'});repo.addPayment({bookingId:stay.id,amountPiasters:-5000,method:'cash',date:'2026-11-03'});repo.addPayment({bookingId:stay.id,amountPiasters:10000,method:'card',date:'2026-11-10'})
  const report=repo.managementReport('2026-11-01','2026-11-03');expect(report).toMatchObject({bookingCount:1,bookingValuePiasters:100000,collectionsPiasters:35000,refundsPiasters:5000,scheduledNights:3,availableNights:6,outstandingPiasters:55000});expect(report.nationalities).toEqual([{nationality:'Egyptian',stays:1}]);db.close()
 })
 it('rejects invalid or overly long reporting periods',()=>{const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);expect(()=>repo.managementReport('2026-11-04','2026-11-01')).toThrow();expect(()=>repo.managementReport('2026-01-01','2028-01-01')).toThrow();db.close()})
})
it('refuses a refund larger than the net amount collected and preserves receipt numbering',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:10000,source:'phone'});repo.addPayment({bookingId:b.id,amountPiasters:3000,method:'cash',date:'2026-11-01'})
 expect(()=>repo.addPayment({bookingId:b.id,amountPiasters:-4000,method:'cash',date:'2026-11-01'})).toThrow('Refund exceeds');const id=repo.addPayment({bookingId:b.id,amountPiasters:-1000,method:'cash',date:'2026-11-01'});expect(repo.receiptData(id).receiptNo).toBe('R-2026-0002');expect(repo.getBooking(b.id)?.paidPiasters).toBe(2000);db.close()
})
it('allows an existing deposit to be refunded after cancellation but rejects new deposits',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:10000,source:'phone'});repo.addPayment({bookingId:b.id,amountPiasters:3000,method:'cash',date:'2026-11-01'});repo.changeStatus(b.id,'cancelled');expect(()=>repo.addPayment({bookingId:b.id,amountPiasters:100,method:'cash',date:'2026-11-01'})).toThrow();repo.addPayment({bookingId:b.id,amountPiasters:-3000,method:'cash',date:'2026-11-01'});expect(repo.getBooking(b.id)?.paidPiasters).toBe(0);db.close()
})
describe('identity and companion management',()=>{
 it('replaces and undoes a primary identity without writing plaintext to audit history',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));const unit=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:0,source:'phone',idNumber:'OLD-ID'})
  const change=repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:'NEW-ID'});expect(repo.registrationData(b.id).idNumber).toBe('NEW-ID');const audit=(db.prepare('SELECT detail_json FROM audit_log WHERE id=?').get(change) as {detail_json:string}).detail_json;expect(audit).not.toContain('OLD-ID');expect(audit).not.toContain('NEW-ID');repo.undoIdentity(change);expect(repo.registrationData(b.id).idNumber).toBe('OLD-ID');expect(()=>repo.undoIdentity(change)).toThrow();db.close()
 })
 it('adds, edits, removes and restores companions only within their booking',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));const unit=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});const data={fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:0,source:'phone' as const};const b=repo.createBooking(data);const other=repo.createBooking({...data,arrival:'2026-11-02',departure:'2026-11-03'})
  const id=repo.addCompanion({bookingId:b.id,fullName:'Sara',idNumber:'ABC'});repo.updateCompanion({bookingId:b.id,companionId:id,fullName:'Sarah'});expect(repo.registrationData(b.id).companions).toEqual([{fullName:'Sarah',idNumber:'ABC'}]);expect(()=>repo.removeCompanion(other.id,id)).toThrow();repo.removeCompanion(b.id,id);expect(repo.getBooking(b.id)?.companions).toHaveLength(0);repo.restoreCompanion(b.id,id);expect(repo.getBooking(b.id)?.companions).toMatchObject([{id,fullName:'Sarah'}]);db.close()
 })
 it('rejects identity changes if encryption is unavailable and leaves the existing identity untouched',()=>{
  const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db);const unit=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:0,source:'phone'});expect(()=>repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:'123'})).toThrow('encryption');expect((db.prepare('SELECT id_passport_ciphertext AS id FROM guests').get() as {id:Buffer|null}).id).toBeNull();db.close()
 })
})
it('refuses to undo an older identity edit after a newer edit even if ciphertext matches again',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));const u=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:u,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:0,source:'phone',idNumber:'A'});const first=repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:'B'});repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:'C'});repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:'B'});expect(()=>repo.undoIdentity(first)).toThrow();expect(repo.registrationData(b.id).idNumber).toBe('B');db.close()
})
it('clears an ID with a one-time undo and refuses edits on inactive bookings',()=>{
 const db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));const u=repo.createUnit({name:'A',type:'room',capacity:1,pricePiasters:0});const b=repo.createBooking({fullName:'Guest',phone:'',unitId:u,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:0,source:'phone',idNumber:'ABC'});const change=repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:''});expect(repo.registrationData(b.id).idNumber).toBe('');repo.undoIdentity(change);expect(repo.registrationData(b.id).idNumber).toBe('ABC');expect(()=>repo.undoIdentity(change)).toThrow();repo.changeStatus(b.id,'cancelled');expect(()=>repo.addCompanion({bookingId:b.id,fullName:'Guest 2'})).toThrow();expect(()=>repo.replaceIdentity({bookingId:b.id,kind:'primary',idNumber:'C'})).toThrow();db.close()
})
