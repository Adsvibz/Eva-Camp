import {unitAvailabilitySchema,type UnitAvailabilityInput,type UnitAvailability} from '../shared/contracts'
import {paymentHistorySchema,type PaymentHistoryInput,type PaymentHistoryPage,type PaymentRow} from '../shared/contracts'
import {DeclarationArchives,type ArchiveFactory} from './declaration-archives'
import {DeclarationStore} from './declarations'
import type {SaveDeclarationInput,UndoDeclarationInput} from '../shared/declaration'
import {discountSchema,type DiscountInput} from '../shared/contracts'
import {dashboardSummary} from './dashboard'
import {updateUnitSchema,type UpdateUnitInput} from '../shared/contracts'
import type {InvoiceData} from './invoice'
import {addExtraSchema,extraRefSchema,type AddExtraInput,type ExtraRef,type BookingExtra} from '../shared/contracts'
import {uiPreferencesSchema, type UiPreferences} from '../shared/contracts'
import { GuestDirectory } from './guests'
import { normalizePhone } from '../shared/phone'
import type { GuestHistoryInput } from '../shared/contracts'
import type Database from 'better-sqlite3'
import type {RegistrationData,ReceiptData} from './print'
import { unitSchema,bookingSchema,paymentSchema,statusSchema,date,calendarRangeSchema,rescheduleSchema,searchSchema,bookingDetailsSchema,reportRangeSchema,transferSchema,replaceIdentitySchema,addCompanionSchema,updateCompanionSchema,companionRefSchema, type UnitInput,type BookingInput,type PaymentInput,type BookingRow,type UnitRow,type BookingDetail,type DailyReport,type CalendarBooking,type RescheduleInput,type BookingDetailsInput,type ManagementReport,type ReplaceIdentityInput,type AddCompanionInput,type UpdateCompanionInput,type TransferInput,type UnitSegment } from '../shared/contracts'

function localDay():string{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export class CampRepository {
 constructor(private db: Database.Database, private encrypt?: (value:string)=>Buffer, private decrypt?: (value:Buffer)=>string, private today:()=>string=localDay, private archiveFactory?:ArchiveFactory) { db.pragma('foreign_keys = ON') }
 getDeclaration(id:number){return new DeclarationStore(this.db,this.today).get(id)}
 saveDeclaration(input:SaveDeclarationInput){return this.db.transaction(()=>{const changeId=new DeclarationStore(this.db,this.today).save(input);new DeclarationArchives(this.db,this.encrypt,this.decrypt).capture(input.bookingId,changeId,this.registrationData(input.bookingId),this.archiveFactory);return changeId})()}
 listDeclarationArchives(bookingId:number,offset:number){return new DeclarationArchives(this.db,this.encrypt,this.decrypt).list(bookingId,offset)}
 declarationArchiveHtml(id:number){return new DeclarationArchives(this.db,this.encrypt,this.decrypt).html(id)}
 undoDeclaration(input:UndoDeclarationInput){return new DeclarationStore(this.db,this.today).undo(input)}
 dashboard(day:string){return dashboardSummary(this.db,day)}
 findGuests(query:string){return new GuestDirectory(this.db).find(query)}
 duplicateGuests(phone:string){return new GuestDirectory(this.db).matchPhone(phone)}
 guestHistory(input:GuestHistoryInput){return new GuestDirectory(this.db).history(input)}
 getPreferences():UiPreferences{
  const row=this.db.prepare("SELECT value_json AS value FROM settings WHERE key='ui:preferences'").get() as {value:string}|undefined
  if(row){try{const result=uiPreferencesSchema.safeParse(JSON.parse(row.value));if(result.success)return result.data}catch{}}
  return {language:'en',theme:'light'}
 }
 savePreferences(input:UiPreferences):void{
  const d=uiPreferencesSchema.parse(input)
  this.db.transaction(()=>{
   const row=this.db.prepare("SELECT value_json AS value FROM settings WHERE key='ui:preferences'").get() as {value:string}|undefined
   if(row){try{const previous=uiPreferencesSchema.safeParse(JSON.parse(row.value));if(previous.success&&previous.data.language===d.language&&previous.data.theme===d.theme)return}catch{}}
   this.db.prepare("INSERT INTO settings(key,value_json) VALUES ('ui:preferences',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(d))
   this.audit('preferences-update','settings','ui:preferences')
  })()
 }
 private effectiveUnit(bookingId:number,day:string):number {
  date.parse(day)
  const row=this.db.prepare(`SELECT COALESCE(
    (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id AND s.start_date<=@day AND s.end_date>@day ORDER BY s.start_date DESC,s.id DESC LIMIT 1),
    CASE WHEN @day<b.arrival_date THEN (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id ORDER BY s.start_date,s.id LIMIT 1)
    ELSE (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id ORDER BY s.start_date DESC,s.id DESC LIMIT 1) END
  ) AS unitId FROM bookings b WHERE b.id=@id AND b.deleted_at IS NULL`).get({id:bookingId,day}) as {unitId:number|null}|undefined
  if(!row?.unitId)throw new Error('UNIT_ASSIGNMENT_MISSING')
  return row.unitId
 }
 private assertPhysicallyAvailable(unitId:number,bookingId:number,day:string):void {
  const unit=this.db.prepare("SELECT id FROM units WHERE id=? AND deleted_at IS NULL AND housekeeping_status='available'").get(unitId)
  if(!unit)throw new Error('UNIT_UNAVAILABLE')
  const conflict=this.db.prepare(`SELECT b.id FROM bookings b WHERE b.status='checked-in' AND b.deleted_at IS NULL AND b.id<>@id AND COALESCE(
    (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id AND s.start_date<=@day AND s.end_date>@day ORDER BY s.start_date DESC,s.id DESC LIMIT 1),
    CASE WHEN @day<b.arrival_date THEN (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id ORDER BY s.start_date,s.id LIMIT 1)
    ELSE (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id ORDER BY s.start_date DESC,s.id DESC LIMIT 1) END
   )=@unit LIMIT 1`).get({id:bookingId,day,unit:unitId})
  if(conflict)throw new Error('UNIT_OCCUPIED')
 }
 private audit(action:string,entity:string,id:number|string) { this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id) VALUES (?,?,?,?)').run('operator',action,entity,String(id)) }
 private sequence(name:string,year:number):number {
  this.db.prepare('INSERT INTO sequences(name,year,value) VALUES (?,?,1) ON CONFLICT(name,year) DO UPDATE SET value=value+1').run(name,year)
  return (this.db.prepare('SELECT value FROM sequences WHERE name=? AND year=?').get(name,year) as {value:number}).value
 }
 createUnit(data:UnitInput):number { const d=unitSchema.parse(data); return this.db.transaction(()=>{ const id=Number(this.db.prepare('INSERT INTO units(name,type,capacity,base_price_piasters) VALUES (?,?,?,?)').run(d.name,d.type,d.capacity,d.pricePiasters).lastInsertRowid); this.audit('create','unit',id); return id })() }
 listUnits():UnitRow[] { return this.db.prepare("SELECT id,name,type,capacity,base_price_piasters AS pricePiasters,housekeeping_status AS housekeepingStatus,COALESCE(notes,'') AS notes FROM units WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all() as UnitRow[] }
 unitAvailability(input:UnitAvailabilityInput):UnitAvailability[]{
  const d=unitAvailabilitySchema.parse(input)
  return this.db.prepare(`SELECT u.id AS unitId,CASE
   WHEN u.housekeeping_status IN ('cleaning','maintenance') THEN u.housekeeping_status
   WHEN u.capacity < @adults + @children THEN 'capacity'
   WHEN EXISTS (SELECT 1 FROM booking_unit_segments s JOIN bookings b ON b.id=s.booking_id
    WHERE s.unit_id=u.id AND b.deleted_at IS NULL AND b.status IN ('reserved','checked-in')
    AND s.start_date < @departure AND s.end_date > @arrival) THEN 'booked'
   ELSE 'available' END AS state
   FROM units u WHERE u.deleted_at IS NULL ORDER BY u.name COLLATE NOCASE`).all(d) as UnitAvailability[]
 }
 updateUnit(input:UpdateUnitInput):void{const d=updateUnitSchema.parse(input);this.db.transaction(()=>{
  const existing=this.db.prepare("SELECT name,type,capacity,base_price_piasters AS pricePiasters,housekeeping_status AS housekeepingStatus,COALESCE(notes,'') AS notes FROM units WHERE id=? AND deleted_at IS NULL").get(d.id) as {name:string;type:string;capacity:number;pricePiasters:number;housekeepingStatus:string;notes:string}|undefined;if(!existing)throw new Error('UNIT_UNAVAILABLE')
  const day=this.today();date.parse(day)
  const future=this.db.prepare(`SELECT b.id FROM bookings b WHERE b.deleted_at IS NULL AND b.status IN ('reserved','checked-in') AND b.adults_count+b.children_count>? AND EXISTS (SELECT 1 FROM booking_unit_segments s WHERE s.booking_id=b.id AND s.unit_id=? AND (b.status='reserved' OR s.end_date>?)) LIMIT 1`).get(d.capacity,d.id,day)
  const checkedIn=this.db.prepare("SELECT id FROM bookings WHERE deleted_at IS NULL AND status='checked-in' AND adults_count+children_count>?").all(d.capacity) as {id:number}[]
  if(future||checkedIn.some(b=>this.effectiveUnit(b.id,day)===d.id))throw new Error('UNIT_CAPACITY_CONFLICT')
  this.db.prepare('UPDATE units SET name=?,type=?,capacity=?,base_price_piasters=?,housekeeping_status=?,notes=? WHERE id=? AND deleted_at IS NULL').run(d.name,d.type,d.capacity,d.pricePiasters,d.housekeepingStatus,d.notes||null,d.id)
  const {notes,...before}=existing;const after={name:d.name,type:d.type,capacity:d.capacity,pricePiasters:d.pricePiasters,housekeepingStatus:d.housekeepingStatus}
  this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','update','unit',String(d.id),JSON.stringify({before,after,notesChanged:notes!==d.notes}))
 })() }
 createBooking(data:BookingInput):{id:number;reference:string} { const d=bookingSchema.parse(data); return this.db.transaction(()=>{
  const unit=this.db.prepare("SELECT capacity FROM units WHERE id=? AND deleted_at IS NULL AND housekeeping_status='available'").get(d.unitId) as {capacity:number}|undefined
  if(!unit) throw new Error('Unit unavailable')
  if(d.adults+d.children>unit.capacity) throw new Error('Unit capacity exceeded')
  const protect=(value?:string)=>{if(!value)return null;if(!this.encrypt)throw new Error('Identity encryption unavailable');return this.encrypt(value)}
  let guestId:number
  if(d.guestId){
   const guest=this.db.prepare('SELECT id FROM guests WHERE id=? AND deleted_at IS NULL').get(d.guestId) as {id:number}|undefined
   if(!guest)throw new Error('Guest unavailable')
   guestId=guest.id
  }else{
   const shared=this.duplicateGuests(d.phone).length>0
   if(shared&&!d.allowSharedPhone)throw new Error('DUPLICATE_GUEST')
   guestId=Number(this.db.prepare('INSERT INTO guests(full_name,mobile_whatsapp,normalized_phone,nationality,email,date_of_birth,country,home_address,notes,id_passport_ciphertext) VALUES (?,?,?,?,?,?,?,?,?,?)').run(d.fullName,d.phone,normalizePhone(d.phone),d.nationality||null,d.email||null,d.dateOfBirth||null,d.country||null,d.address||null,d.notes||null,protect(d.idNumber)).lastInsertRowid)
   this.audit(shared?'create-shared-phone':'create','guest',guestId)
  }
  const year=Number(d.arrival.slice(0,4)); const reference=`EVA-${year}-${String(this.sequence('booking',year)).padStart(4,'0')}`
  const id=Number(this.db.prepare("INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,children_count,total_piasters,status,source) VALUES (?,?,?,?,?,?,?,?,'reserved',?)").run(reference,guestId,d.unitId,d.arrival,d.departure,d.adults,d.children,d.totalPiasters,d.source).lastInsertRowid)
  for(const companion of d.companions||[]) this.db.prepare('INSERT INTO additional_guests(booking_id,full_name,id_passport_ciphertext) VALUES (?,?,?)').run(id,companion.fullName,protect(companion.idNumber))
  this.audit('create','booking',id); return {id,reference}
 })() }
 listBookings():BookingRow[] { return this.db.prepare(`SELECT b.id,b.booking_reference AS reference,g.full_name AS fullName,u.name AS unitName,b.arrival_date AS arrival,b.departure_date AS departure,b.status,v.total_piasters AS totalPiasters,v.paid_piasters AS paidPiasters,v.balance_piasters AS balancePiasters FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units u ON u.id=b.unit_id JOIN booking_balances v ON v.booking_id=b.id WHERE b.deleted_at IS NULL ORDER BY b.arrival_date DESC,b.id DESC LIMIT 500`).all() as BookingRow[] }
 addPayment(data:PaymentInput):number {
  const d=paymentSchema.parse(data)
  return this.db.transaction(()=>{
   if(this.db.prepare('SELECT key FROM settings WHERE key=?').get(`closed-day:${d.date}`))throw new Error('Day is closed')
   const booking=this.db.prepare("SELECT status FROM bookings WHERE id=? AND deleted_at IS NULL").get(d.bookingId) as {status:string}|undefined
   if(!booking||(booking.status==='cancelled'&&d.amountPiasters>0))throw new Error('Booking unavailable')
   const row=this.db.prepare('SELECT paid_piasters AS paid FROM booking_balances WHERE booking_id=?').get(d.bookingId) as {paid:number}
   if(!Number.isSafeInteger(row.paid)||row.paid<0)throw new Error('PAYMENT_AMOUNT_TOO_LARGE')
   if(d.amountPiasters<0&&-d.amountPiasters>row.paid)throw new Error('Refund exceeds net paid amount')
   if(d.amountPiasters>0&&row.paid>Number.MAX_SAFE_INTEGER-d.amountPiasters)throw new Error('PAYMENT_AMOUNT_TOO_LARGE')
   const year=Number(d.date.slice(0,4)),receipt=`R-${year}-${String(this.sequence('receipt',year)).padStart(4,'0')}`
   const id=Number(this.db.prepare('INSERT INTO payments(booking_id,amount_piasters,method,payment_date,receipt_no,note) VALUES (?,?,?,?,?,?)').run(d.bookingId,d.amountPiasters,d.method,d.date,receipt,d.note||null).lastInsertRowid)
   this.audit('create','payment',id);return id
  })()
 }
 listPayments(input:PaymentHistoryInput):PaymentHistoryPage {
  const d=paymentHistorySchema.parse(input)
  if(!this.db.prepare('SELECT id FROM bookings WHERE id=? AND deleted_at IS NULL').get(d.bookingId))throw new Error('Booking unavailable')
  const rows=this.db.prepare("SELECT id,receipt_no AS receiptNo,payment_date AS date,method,amount_piasters AS amountPiasters,COALESCE(note,'') AS note FROM payments WHERE booking_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 51 OFFSET ?").all(d.bookingId,d.offset) as PaymentRow[]
  return {rows:rows.slice(0,50),hasMore:rows.length>50}
 }

 receiptData(id:number):ReceiptData {
  const row=this.db.prepare(`SELECT p.receipt_no AS receiptNo,g.full_name AS guestName,b.booking_reference AS reference,p.amount_piasters AS amountPiasters,p.method,p.payment_date AS date,COALESCE(p.note,'') AS note FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN guests g ON g.id=b.guest_id WHERE p.id=? AND p.deleted_at IS NULL`).get(id) as ReceiptData|undefined
  if(!row)throw new Error('Payment not found')
  return row
 }
 registrationData(id:number):RegistrationData {
  type Raw = Omit<RegistrationData,'idNumber'|'companions'> & {idCipher:Buffer|null}
  const row=this.db.prepare(`SELECT b.booking_reference AS reference,g.full_name AS fullName,COALESCE(g.nationality,'') AS nationality,COALESCE(g.date_of_birth,'') AS dateOfBirth,COALESCE(g.mobile_whatsapp,'') AS phone,COALESCE(g.email,'') AS email,g.id_passport_ciphertext AS idCipher,COALESCE(g.country,'') AS country,COALESCE(g.home_address,'') AS address,u.name AS unitName,u.type AS unitType,b.arrival_date AS arrival,b.departure_date AS departure,b.adults_count AS adults,b.children_count AS children,v.total_piasters-v.discount_piasters+v.extras_piasters AS totalPiasters,v.paid_piasters AS paidPiasters,v.balance_piasters AS balancePiasters FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units u ON u.id=b.unit_id JOIN booking_balances v ON v.booking_id=b.id WHERE b.id=? AND b.deleted_at IS NULL`).get(id) as Raw|undefined
  if(!row)throw new Error('Booking not found')
  const unseal=(cipher:Buffer|null)=>{if(!cipher)return '';if(!this.decrypt)throw new Error('Identity decryption unavailable');return this.decrypt(cipher)}
  const others=this.db.prepare('SELECT full_name AS fullName,id_passport_ciphertext AS idCipher FROM additional_guests WHERE booking_id=? AND deleted_at IS NULL ORDER BY id').all(id) as {fullName:string;idCipher:Buffer|null}[]
  const {idCipher,...rest}=row
  return {...rest,declaration:this.getDeclaration(id),idNumber:unseal(idCipher),companions:others.map(g=>({fullName:g.fullName,idNumber:unseal(g.idCipher)}))}
 }
 getBooking(id:number):BookingDetail|null {
  const row=this.db.prepare(`SELECT b.id,b.guest_id AS guestId,b.unit_id AS unitId,b.booking_reference AS reference,g.full_name AS fullName,g.nationality,g.email,g.date_of_birth AS dateOfBirth,g.country,g.home_address AS address,g.notes,(g.id_passport_ciphertext IS NOT NULL) AS hasPrimaryId,COALESCE(g.mobile_whatsapp,'') AS phone,b.adults_count AS adults,b.children_count AS children,b.source,u.name AS unitName,b.arrival_date AS arrival,b.departure_date AS departure,b.status,v.total_piasters AS totalPiasters,v.discount_piasters AS discountPiasters,v.extras_piasters AS extrasPiasters,v.total_piasters-v.discount_piasters+v.extras_piasters AS totalDuePiasters,v.paid_piasters AS paidPiasters,v.balance_piasters AS balancePiasters FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units u ON u.id=b.unit_id JOIN booking_balances v ON v.booking_id=b.id WHERE b.id=? AND b.deleted_at IS NULL`).get(id) as Omit<BookingDetail,'companions'>|undefined
  if(!row)return null
  const companions=this.db.prepare('SELECT id,full_name AS fullName,(id_passport_ciphertext IS NOT NULL) AS hasId FROM additional_guests WHERE booking_id=? AND deleted_at IS NULL ORDER BY id').all(id) as {id:number;fullName:string;hasId:boolean}[]
  return {...row,companions}
 }


 invoiceData(bookingId:number):InvoiceData{
  statusSchema.shape.bookingId.parse(bookingId)
  return this.db.transaction(()=>{
   const row=this.db.prepare(`SELECT b.booking_reference AS reference,g.full_name AS fullName,u.name AS unitName,u.type AS unitType,b.arrival_date AS arrival,b.departure_date AS departure,b.status,v.total_piasters AS basePiasters,v.discount_piasters AS discountPiasters,v.extras_piasters AS extrasPiasters,v.total_piasters-v.discount_piasters+v.extras_piasters AS totalPiasters,v.paid_piasters AS paidPiasters,v.balance_piasters AS balancePiasters FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units u ON u.id=b.unit_id JOIN booking_balances v ON v.booking_id=b.id WHERE b.id=? AND b.deleted_at IS NULL`).get(bookingId) as Omit<InvoiceData,'extras'|'payments'>|undefined
   if(!row)throw new Error('Booking not found')
   const extras=this.listExtras(bookingId)
   const payments=this.db.prepare('SELECT receipt_no AS receiptNo,payment_date AS date,method,amount_piasters AS amountPiasters FROM payments WHERE booking_id=? AND deleted_at IS NULL ORDER BY payment_date,id').all(bookingId) as InvoiceData['payments']
   return {...row,extras,payments}
  })()
 }
 setDiscount(input:DiscountInput):void {
  const d=discountSchema.parse(input)
  this.db.transaction(()=>{
   this.activeBooking(d.bookingId)
   const row=this.db.prepare('SELECT total_piasters AS base,discount_piasters AS discount,extras_piasters AS extras FROM booking_balances WHERE booking_id=?').get(d.bookingId) as {base:number;discount:number;extras:number}
   if(row.discount!==d.expectedDiscountPiasters)throw new Error('DISCOUNT_CHANGED')
   if(d.discountPiasters>row.base)throw new Error('DISCOUNT_TOO_LARGE')
   if(!Number.isSafeInteger(row.extras)||row.base-d.discountPiasters>Number.MAX_SAFE_INTEGER-row.extras)throw new Error('EXTRA_AMOUNT_TOO_LARGE')
   if(row.discount===d.discountPiasters)return
   this.db.prepare('UPDATE bookings SET discount_piasters=? WHERE id=?').run(d.discountPiasters,d.bookingId)
   this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','discount-update','booking',String(d.bookingId),JSON.stringify({beforePiasters:row.discount,afterPiasters:d.discountPiasters}))
  })()
 }
 listExtras(bookingId:number):BookingExtra[]{
  extraRefSchema.shape.bookingId.parse(bookingId)
  return this.db.prepare('SELECT e.id,e.description,e.quantity,e.unit_price_piasters AS unitPricePiasters FROM booking_extras e JOIN bookings b ON b.id=e.booking_id WHERE e.booking_id=? AND e.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY e.id').all(bookingId) as BookingExtra[]
 }
 private assertExtraTotal(bookingId:number,additional:number):void{
  const row=this.db.prepare('SELECT total_piasters-discount_piasters+extras_piasters AS total FROM booking_balances WHERE booking_id=?').get(bookingId) as {total:number}|undefined
  if(!row||!Number.isSafeInteger(row.total)||!Number.isSafeInteger(additional)||row.total>Number.MAX_SAFE_INTEGER-additional)throw new Error('EXTRA_AMOUNT_TOO_LARGE')
 }
 addExtra(input:AddExtraInput):number{const d=addExtraSchema.parse(input);return this.db.transaction(()=>{this.activeBooking(d.bookingId);this.assertExtraTotal(d.bookingId,d.quantity*d.unitPricePiasters);const id=Number(this.db.prepare('INSERT INTO booking_extras(booking_id,description,quantity,unit_price_piasters) VALUES (?,?,?,?)').run(d.bookingId,d.description,d.quantity,d.unitPricePiasters).lastInsertRowid);this.audit('create','extra',id);return id})()}
 removeExtra(input:ExtraRef):void{const d=extraRefSchema.parse(input);this.db.transaction(()=>{this.activeBooking(d.bookingId);const result=this.db.prepare('UPDATE booking_extras SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND booking_id=? AND deleted_at IS NULL').run(d.extraId,d.bookingId);if(!result.changes)throw new Error('EXTRA_UNAVAILABLE');this.audit('remove','extra',d.extraId)})()}
 restoreExtra(input:ExtraRef):void{const d=extraRefSchema.parse(input);this.db.transaction(()=>{this.activeBooking(d.bookingId);const row=this.db.prepare('SELECT quantity,unit_price_piasters AS price FROM booking_extras WHERE id=? AND booking_id=? AND deleted_at IS NOT NULL').get(d.extraId,d.bookingId) as {quantity:number;price:number}|undefined;if(!row)throw new Error('EXTRA_UNAVAILABLE');this.assertExtraTotal(d.bookingId,row.quantity*row.price);this.db.prepare('UPDATE booking_extras SET deleted_at=NULL WHERE id=? AND booking_id=?').run(d.extraId,d.bookingId);this.audit('restore','extra',d.extraId)})()}
 private activeBooking(bookingId:number):{guestId:number}{
  const b=this.db.prepare("SELECT guest_id AS guestId FROM bookings WHERE id=? AND deleted_at IS NULL AND status IN ('reserved','checked-in')").get(bookingId) as {guestId:number}|undefined
  if(!b)throw new Error('Booking unavailable')
  return b
 }
 addCompanion(input:AddCompanionInput):number{
  const d=addCompanionSchema.parse(input);return this.db.transaction(()=>{this.activeBooking(d.bookingId);let cipher:Buffer|null=null;if(d.idNumber){if(!this.encrypt)throw new Error('Identity encryption unavailable');cipher=this.encrypt(d.idNumber)}const id=Number(this.db.prepare('INSERT INTO additional_guests(booking_id,full_name,id_passport_ciphertext) VALUES (?,?,?)').run(d.bookingId,d.fullName,cipher).lastInsertRowid);this.audit('create','companion',id);return id})()
 }
 updateCompanion(input:UpdateCompanionInput):void{
  const d=updateCompanionSchema.parse(input);this.db.transaction(()=>{this.activeBooking(d.bookingId);const changed=this.db.prepare('UPDATE additional_guests SET full_name=? WHERE id=? AND booking_id=? AND deleted_at IS NULL').run(d.fullName,d.companionId,d.bookingId);if(!changed.changes)throw new Error('Companion unavailable');this.audit('update','companion',d.companionId)})()
 }
 removeCompanion(bookingId:number,companionId:number):void{
  companionRefSchema.parse({bookingId,companionId});this.db.transaction(()=>{this.activeBooking(bookingId);const changed=this.db.prepare('UPDATE additional_guests SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND booking_id=? AND deleted_at IS NULL').run(companionId,bookingId);if(!changed.changes)throw new Error('Companion unavailable');this.audit('remove','companion',companionId)})()
 }
 restoreCompanion(bookingId:number,companionId:number):void{
  companionRefSchema.parse({bookingId,companionId});this.db.transaction(()=>{this.activeBooking(bookingId);const changed=this.db.prepare('UPDATE additional_guests SET deleted_at=NULL WHERE id=? AND booking_id=? AND deleted_at IS NOT NULL').run(companionId,bookingId);if(!changed.changes)throw new Error('Companion unavailable');this.audit('restore','companion',companionId)})()
 }
 replaceIdentity(input:ReplaceIdentityInput):number{
  const d=replaceIdentitySchema.parse(input);return this.db.transaction(()=>{
   const b=this.activeBooking(d.bookingId);const record=d.kind==='primary'?this.db.prepare('SELECT id_passport_ciphertext AS cipher FROM guests WHERE id=?').get(b.guestId):this.db.prepare('SELECT id_passport_ciphertext AS cipher FROM additional_guests WHERE id=? AND booking_id=? AND deleted_at IS NULL').get(d.companionId,d.bookingId)
   if(!record)throw new Error('Identity unavailable');const before=(record as {cipher:Buffer|null}).cipher;let after:Buffer|null=null
   if(d.idNumber){if(!this.encrypt)throw new Error('Identity encryption unavailable');after=this.encrypt(d.idNumber)}
   if(d.kind==='primary')this.db.prepare('UPDATE guests SET id_passport_ciphertext=?,id_passport_lookup=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(after,b.guestId)
   else this.db.prepare('UPDATE additional_guests SET id_passport_ciphertext=?,id_passport_lookup=NULL WHERE id=? AND booking_id=?').run(after,d.companionId,d.bookingId)
   const detail={bookingId:d.bookingId,kind:d.kind,entityId:d.kind==='primary'?b.guestId:d.companionId,before:before?.toString('base64')??null,after:after?.toString('base64')??null}
   return Number(this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','identity-change',d.kind,String(detail.entityId),JSON.stringify(detail)).lastInsertRowid)
  })()
 }
 undoIdentity(auditId:number):void{
  if(!Number.isSafeInteger(auditId)||auditId<=0)throw new Error('Invalid audit entry')
  this.db.transaction(()=>{
   const audit=this.db.prepare("SELECT detail_json AS detail FROM audit_log WHERE id=? AND action='identity-change'").get(auditId) as {detail:string}|undefined
   if(!audit||this.db.prepare("SELECT id FROM audit_log WHERE action='identity-undo' AND entity_type='identity-change' AND entity_id=?").get(String(auditId)))throw new Error('Identity change unavailable')
   const d=JSON.parse(audit.detail) as {bookingId:number;kind:string;entityId:number;before:string|null;after:string|null};const b=this.activeBooking(d.bookingId)
   if(this.db.prepare("SELECT id FROM audit_log WHERE id>? AND action='identity-change' AND entity_type=? AND entity_id=? LIMIT 1").get(auditId,d.kind,String(d.entityId)))throw new Error('Identity has since changed')
   const current=d.kind==='primary'&&b.guestId===d.entityId?this.db.prepare('SELECT id_passport_ciphertext AS cipher FROM guests WHERE id=?').get(d.entityId):d.kind==='companion'?this.db.prepare('SELECT id_passport_ciphertext AS cipher FROM additional_guests WHERE id=? AND booking_id=? AND deleted_at IS NULL').get(d.entityId,d.bookingId):undefined
   if(!current||((current as {cipher:Buffer|null}).cipher?.toString('base64')??null)!==d.after)throw new Error('Identity has since changed')
   const value=d.before?Buffer.from(d.before,'base64'):null
   if(value){if(!this.decrypt)throw new Error('Identity decryption unavailable');this.decrypt(value)}
   if(d.kind==='primary')this.db.prepare('UPDATE guests SET id_passport_ciphertext=?,id_passport_lookup=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(value,d.entityId)
   else this.db.prepare('UPDATE additional_guests SET id_passport_ciphertext=?,id_passport_lookup=NULL WHERE id=? AND booking_id=?').run(value,d.entityId,d.bookingId)
   this.audit('identity-undo','identity-change',auditId)
  })()
 }
 updateBookingDetails(input:BookingDetailsInput):void{
  const d=bookingDetailsSchema.parse(input)
  this.db.transaction(()=>{
   const row=this.db.prepare(`SELECT b.guest_id AS guestId,b.status,u.capacity,b.total_piasters AS totalPiasters,b.discount_piasters AS discountPiasters,b.adults_count AS adults,b.children_count AS children,b.source FROM bookings b JOIN units u ON u.id=b.unit_id WHERE b.id=? AND b.deleted_at IS NULL`).get(d.bookingId) as {guestId:number;status:string;capacity:number;totalPiasters:number;discountPiasters:number;adults:number;children:number;source:string}|undefined
   if(!row||!['reserved','checked-in'].includes(row.status))throw new Error('Booking cannot be edited')
   if(d.adults+d.children>row.capacity)throw new Error('Unit capacity exceeded')
   if(d.totalPiasters<row.discountPiasters)throw new Error('Total cannot be less than discount')
   const extras=(this.db.prepare('SELECT extras_piasters AS amount FROM booking_balances WHERE booking_id=?').get(d.bookingId) as {amount:number}).amount
   if(!Number.isSafeInteger(extras)||BigInt(d.totalPiasters)-BigInt(row.discountPiasters)+BigInt(extras)>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('EXTRA_AMOUNT_TOO_LARGE')
   const beforeGuest=this.db.prepare("SELECT full_name AS fullName,COALESCE(mobile_whatsapp,'') AS phone,COALESCE(nationality,'') AS nationality,COALESCE(email,'') AS email,COALESCE(date_of_birth,'') AS dateOfBirth,COALESCE(country,'') AS country,COALESCE(home_address,'') AS address,COALESCE(notes,'') AS notes FROM guests WHERE id=?").get(row.guestId) as Record<string,string>
   const guestFields=['fullName','phone','nationality','email','dateOfBirth','country','address','notes'] as const
   const changedGuestFields=guestFields.filter(key=>beforeGuest[key] !== (d[key]||''))
   this.db.prepare('UPDATE guests SET full_name=?,mobile_whatsapp=?,normalized_phone=?,nationality=?,email=?,date_of_birth=?,country=?,home_address=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(d.fullName,d.phone,normalizePhone(d.phone),d.nationality||null,d.email||null,d.dateOfBirth||null,d.country||null,d.address||null,d.notes||null,row.guestId)
   this.db.prepare('UPDATE bookings SET adults_count=?,children_count=?,total_piasters=?,source=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(d.adults,d.children,d.totalPiasters,d.source,d.bookingId)
   const changes={changedGuestFields,before:{adults:row.adults,children:row.children,totalPiasters:row.totalPiasters,source:row.source},after:{adults:d.adults,children:d.children,totalPiasters:d.totalPiasters,source:d.source}}
   this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','update','booking',String(d.bookingId),JSON.stringify(changes))
  })()
 }
 changeStatus(id:number,status:'reserved'|'checked-in'|'checked-out'|'cancelled'):void {
  this.db.transaction(()=>{
   const row=this.db.prepare('SELECT status FROM bookings WHERE id=? AND deleted_at IS NULL').get(id) as {status:string}|undefined
   const transitions:Record<string,string[]>={'reserved':['checked-in','cancelled'],'checked-in':['checked-out'],'checked-out':[],'cancelled':['reserved']}
   if(!row||!transitions[row.status]?.includes(status))throw new Error('Invalid status transition')
   if(status==='checked-in'){const day=this.today();this.assertPhysicallyAvailable(this.effectiveUnit(id,day),id,day)}
   this.db.prepare('UPDATE bookings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,id)
   this.audit('status:'+status,'booking',id)
  })()
 }



 searchBookings(query:string):BookingRow[]{
  const value=searchSchema.parse(query);if(!value)return []
  const pattern='%'+value.replace(/[\\%_]/g,'\\$&')+'%'
  return this.db.prepare(`SELECT b.id,b.booking_reference AS reference,g.full_name AS fullName,u.name AS unitName,b.arrival_date AS arrival,b.departure_date AS departure,b.status,v.total_piasters AS totalPiasters,v.paid_piasters AS paidPiasters,v.balance_piasters AS balancePiasters FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units u ON u.id=b.unit_id JOIN booking_balances v ON v.booking_id=b.id WHERE b.deleted_at IS NULL AND (g.full_name LIKE ? ESCAPE '\\' OR g.mobile_whatsapp LIKE ? ESCAPE '\\' OR b.booking_reference LIKE ? ESCAPE '\\') ORDER BY b.arrival_date DESC,b.id DESC LIMIT 100`).all(pattern,pattern,pattern) as BookingRow[]
 }
 calendar(start:string,end:string):CalendarBooking[]{
  calendarRangeSchema.parse({start,end})
  return this.db.prepare(`SELECT b.id,b.booking_reference AS reference,s.unit_id AS unitId,g.full_name AS fullName,s.start_date AS arrival,s.end_date AS departure,b.arrival_date AS bookingArrival,b.departure_date AS bookingDeparture,b.unit_id AS bookingUnitId,b.status FROM booking_unit_segments s JOIN bookings b ON b.id=s.booking_id JOIN guests g ON g.id=b.guest_id WHERE b.deleted_at IS NULL AND b.status IN ('reserved','checked-in') AND s.start_date<? AND s.end_date>? ORDER BY s.unit_id,s.start_date,b.id`).all(end,start) as CalendarBooking[]
 }


 unitHistory(bookingId:number):UnitSegment[]{
  if(!Number.isSafeInteger(bookingId)||bookingId<=0)throw new Error('Invalid booking')
  return this.db.prepare(`SELECT s.unit_id AS unitId,u.name AS unitName,s.start_date AS start,s.end_date AS end FROM booking_unit_segments s JOIN units u ON u.id=s.unit_id JOIN bookings b ON b.id=s.booking_id WHERE s.booking_id=? AND b.deleted_at IS NULL ORDER BY s.start_date,s.id`).all(bookingId) as UnitSegment[]
 }
 transferUnit(input:TransferInput):void{
  const d=transferSchema.parse(input)
  this.db.transaction(()=>{
   const booking=this.db.prepare("SELECT unit_id AS unitId,departure_date AS departure,adults_count+children_count AS guests FROM bookings WHERE id=? AND deleted_at IS NULL AND status='checked-in'").get(d.bookingId) as {unitId:number;departure:string;guests:number}|undefined
   if(!booking)throw new Error('Booking must be checked in')
   if(booking.unitId===d.unitId)throw new Error('Choose a different unit')
   const unit=this.db.prepare("SELECT capacity FROM units WHERE id=? AND deleted_at IS NULL AND housekeeping_status='available'").get(d.unitId) as {capacity:number}|undefined
   if(!unit)throw new Error('Unit unavailable');if(booking.guests>unit.capacity)throw new Error('Unit capacity exceeded')
   const segment=this.db.prepare('SELECT id,unit_id AS unitId,start_date AS start,end_date AS end FROM booking_unit_segments WHERE booking_id=? ORDER BY start_date DESC,id DESC LIMIT 1').get(d.bookingId) as {id:number;unitId:number;start:string;end:string}|undefined
   if(!segment||segment.unitId!==booking.unitId||segment.end!==booking.departure||d.date<segment.start||d.date>=segment.end)throw new Error('Transfer date must be within the current stay')
   const today=this.today();if(d.date<=today)this.assertPhysicallyAvailable(d.unitId,d.bookingId,today)
   if(d.date===segment.start)this.db.prepare('UPDATE booking_unit_segments SET unit_id=? WHERE id=?').run(d.unitId,segment.id)
   else{this.db.prepare('UPDATE booking_unit_segments SET end_date=? WHERE id=?').run(d.date,segment.id);this.db.prepare('INSERT INTO booking_unit_segments(booking_id,unit_id,start_date,end_date) VALUES (?,?,?,?)').run(d.bookingId,d.unitId,d.date,segment.end)}
   this.db.prepare('UPDATE bookings SET unit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(d.unitId,d.bookingId)
   this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','transfer','booking',String(d.bookingId),JSON.stringify({fromUnitId:booking.unitId,toUnitId:d.unitId,date:d.date}))
  })()
 }
 reschedule(input:RescheduleInput):void{
  const d=rescheduleSchema.parse(input)
  this.db.transaction(()=>{
   const booking=this.db.prepare('SELECT unit_id AS unitId,arrival_date AS arrival,departure_date AS departure,adults_count+children_count AS guests,status FROM bookings WHERE id=? AND deleted_at IS NULL').get(d.bookingId) as {unitId:number;arrival:string;departure:string;guests:number;status:string}|undefined
   if(!booking||!['reserved','checked-in'].includes(booking.status))throw new Error('Booking cannot be rescheduled')
   const unit=this.db.prepare("SELECT capacity FROM units WHERE id=? AND deleted_at IS NULL AND housekeeping_status='available'").get(d.unitId) as {capacity:number}|undefined
   if(!unit)throw new Error('Unit unavailable')
   if(booking.guests>unit.capacity)throw new Error('Unit capacity exceeded')
   if(booking.status==='checked-in'&&(booking.unitId!==d.unitId||booking.arrival!==d.arrival||d.departure<booking.departure))throw new Error('Checked-in bookings can only be extended in the same unit')
   this.db.prepare('UPDATE bookings SET unit_id=?,arrival_date=?,departure_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(d.unitId,d.arrival,d.departure,d.bookingId)
   this.audit('reschedule','booking',d.bookingId)
  })()
 }

 managementReport(start:string,end:string):ManagementReport{
  reportRangeSchema.parse({start,end})
  const b=this.db.prepare(`SELECT COUNT(*) AS bookingCount,COALESCE(SUM(v.total_piasters-v.discount_piasters+v.extras_piasters),0) AS bookingValuePiasters,COALESCE(SUM(CASE WHEN v.balance_piasters>0 THEN v.balance_piasters ELSE 0 END),0) AS outstandingPiasters FROM bookings b JOIN booking_balances v ON v.booking_id=b.id WHERE b.deleted_at IS NULL AND b.status<>'cancelled' AND b.arrival_date>=? AND b.arrival_date<=?`).get(start,end) as {bookingCount:number;bookingValuePiasters:number;outstandingPiasters:number}
  const p=this.db.prepare(`SELECT COALESCE(SUM(amount_piasters),0) AS collectionsPiasters,COALESCE(SUM(CASE WHEN amount_piasters<0 THEN -amount_piasters ELSE 0 END),0) AS refundsPiasters FROM payments WHERE deleted_at IS NULL AND payment_date>=? AND payment_date<=?`).get(start,end) as {collectionsPiasters:number;refundsPiasters:number}
  const n=this.db.prepare(`SELECT COALESCE(SUM(CAST(julianday(MIN(seg.end_date,date(?,'+1 day')))-julianday(MAX(seg.start_date,?)) AS INTEGER)),0) AS scheduledNights FROM booking_unit_segments seg JOIN bookings b ON b.id=seg.booking_id JOIN units u ON u.id=seg.unit_id AND u.deleted_at IS NULL WHERE b.deleted_at IS NULL AND b.status IN ('reserved','checked-in','checked-out') AND seg.start_date<date(?,'+1 day') AND seg.end_date>?`).get(end,start,end,start) as {scheduledNights:number}
  const available=this.db.prepare(`SELECT (SELECT COUNT(*) FROM units WHERE deleted_at IS NULL)*CAST(julianday(date(?,'+1 day'))-julianday(?) AS INTEGER) AS availableNights`).get(end,start) as {availableNights:number}
  const nationalities=this.db.prepare(`SELECT COALESCE(NULLIF(TRIM(g.nationality),''),'—') AS nationality,COUNT(*) AS stays FROM bookings b JOIN guests g ON g.id=b.guest_id WHERE b.deleted_at IS NULL AND b.status<>'cancelled' AND b.arrival_date>=? AND b.arrival_date<=? GROUP BY 1 ORDER BY stays DESC,nationality ASC`).all(start,end) as {nationality:string;stays:number}[]
  return {start,end,...b,...p,...n,...available,nationalities}
 }
 dailyReport(day:string):DailyReport {
  date.parse(day)
  const totals=this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN method='cash' THEN amount_piasters ELSE 0 END),0) AS cash,COALESCE(SUM(CASE WHEN method='card' THEN amount_piasters ELSE 0 END),0) AS card,COALESCE(SUM(CASE WHEN method='transfer' THEN amount_piasters ELSE 0 END),0) AS transfer,COALESCE(SUM(CASE WHEN amount_piasters>0 THEN amount_piasters ELSE 0 END),0) AS gross,COALESCE(SUM(CASE WHEN amount_piasters<0 THEN -amount_piasters ELSE 0 END),0) AS refunds,COALESCE(SUM(amount_piasters),0) AS net,COUNT(*) AS count FROM payments WHERE payment_date=? AND deleted_at IS NULL`).get(day) as Omit<DailyReport,'date'|'closed'>
  return {date:day,...totals,closed:!!this.db.prepare('SELECT key FROM settings WHERE key=?').get(`closed-day:${day}`)}
 }
 closeDay(day:string):DailyReport {date.parse(day);return this.db.transaction(()=>{const report=this.dailyReport(day);if(report.closed)throw new Error('Day is already closed');this.db.prepare('INSERT INTO settings(key,value_json) VALUES (?,?)').run(`closed-day:${day}`,JSON.stringify({...report,closed:true}));this.audit('close','day',day);return {...report,closed:true}})()}
 reopenDay(day:string):void {date.parse(day);this.db.transaction(()=>{const result=this.db.prepare('DELETE FROM settings WHERE key=?').run(`closed-day:${day}`);if(!result.changes)throw new Error('Day is not closed');this.audit('reopen','day',day)})()}
 countAudit():number {return (this.db.prepare('SELECT count(*) AS n FROM audit_log').get() as {n:number}).n}
 guestCount():number {return (this.db.prepare('SELECT count(*) AS n FROM guests').get() as {n:number}).n}
}
