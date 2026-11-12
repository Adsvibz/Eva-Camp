import type Database from 'better-sqlite3'
import {date} from '../shared/contracts'
import {confirmationText,signatureSchema,saveDeclarationSchema,undoDeclarationSchema,type DeclarationRecord,type SaveDeclarationInput,type UndoDeclarationInput} from '../shared/declaration'

type Stored={revision:number;is_current:number;confirmation_text:string;received_by:string|null;signed_date:string|null;signature_json:string|null}
export class DeclarationStore {
 constructor(private db:Database.Database,private today:()=>string){}
 private stored(id:number):Stored {
  const row=this.db.prepare('SELECT d.revision,d.is_current,d.confirmation_text,d.received_by,d.signed_date,d.signature_json FROM declarations d JOIN bookings b ON b.id=d.booking_id WHERE d.booking_id=? AND b.deleted_at IS NULL').get(id) as Stored|undefined
  if(!row)throw new Error('Booking unavailable')
  return row
 }
 get(id:number):DeclarationRecord {
  saveDeclarationSchema.shape.bookingId.parse(id)
  const row=this.stored(id)
  return {revision:row.revision,isCurrent:row.is_current===1,confirmationText:row.confirmation_text||confirmationText,receivedBy:row.received_by||'',signedDate:row.signed_date||'',signature:row.is_current&&row.signature_json?signatureSchema.parse(JSON.parse(row.signature_json)):null,hasPrevious:!!row.confirmation_text}
 }
 private assertActive(id:number){if(!this.db.prepare("SELECT id FROM bookings WHERE id=? AND deleted_at IS NULL AND status IN ('reserved','checked-in')").get(id))throw new Error('Booking unavailable')}
 save(input:SaveDeclarationInput):number {
  const d=saveDeclarationSchema.parse(input)
  if(d.signedDate>date.parse(this.today()))throw new Error('DECLARATION_FUTURE_DATE')
  return this.db.transaction(()=>{
   this.assertActive(d.bookingId)
   const before=this.stored(d.bookingId)
   if(before.revision!==d.expectedRevision)throw new Error('DECLARATION_CHANGED')
   const revision=before.revision+1
   this.db.prepare('UPDATE declarations SET confirmation_text=?,received_by=?,signed_date=?,signature_json=?,signature_path=NULL,is_current=1,revision=? WHERE booking_id=?').run(confirmationText,d.receivedBy,d.signedDate,d.signature?JSON.stringify(d.signature):null,revision,d.bookingId)
   return Number(this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','declaration-save','booking',String(d.bookingId),JSON.stringify({before,afterRevision:revision})).lastInsertRowid)
  })()
 }
 undo(input:UndoDeclarationInput):void {
  const d=undoDeclarationSchema.parse(input)
  this.db.transaction(()=>{
   this.assertActive(d.bookingId)
   const audit=this.db.prepare("SELECT detail_json FROM audit_log WHERE id=? AND action='declaration-save' AND entity_type='booking' AND entity_id=?").get(d.changeId,String(d.bookingId)) as {detail_json:string}|undefined
   if(!audit)throw new Error('DECLARATION_CHANGED')
   const {before,afterRevision}=JSON.parse(audit.detail_json) as {before:Stored;afterRevision:number}
   const current=this.stored(d.bookingId)
   if(current.revision!==afterRevision)throw new Error('DECLARATION_CHANGED')
   if(before.signature_json)signatureSchema.parse(JSON.parse(before.signature_json))
   this.db.prepare('UPDATE declarations SET confirmation_text=?,received_by=?,signed_date=?,signature_json=?,is_current=?,revision=? WHERE booking_id=?').run(before.confirmation_text,before.received_by,before.signed_date,before.signature_json,before.is_current,current.revision+1,d.bookingId)
   this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','declaration-undo','booking',String(d.bookingId),JSON.stringify({changeId:d.changeId}))
  })()
 }
}
