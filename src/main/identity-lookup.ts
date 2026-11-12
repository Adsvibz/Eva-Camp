import {createHmac,randomBytes} from 'node:crypto'
import type Database from 'better-sqlite3'
import {z} from 'zod'
import {companionHistoryPageSchema,type CompanionStay,type CompanionHistoryInput,type CompanionHistoryPage} from '../shared/contracts'

export const IDENTITY_KEY_SETTING='security:identity-lookup-key-v1'
export const COMPANION_INDEX_SETTING='security:companion-identity-index-v1'
export const normalizeIdentity=(value:string)=>value.trim().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)>=0x06f0?0x06f0:0x0660))).toUpperCase()
export class IdentityLookup {
 constructor(private db:Database.Database,private encrypt?: (value:string)=>Buffer,private decrypt?: (value:Buffer)=>string){}
 private existingKey():Buffer|null{
  const row=this.db.prepare('SELECT value_json AS value FROM settings WHERE key=?').get(IDENTITY_KEY_SETTING) as {value:string}|undefined
  if(!row)return null
  if(!this.decrypt)throw new Error('Identity lookup decryption unavailable')
  const encoded=JSON.parse(row.value);if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Identity lookup key invalid')
  const secret=this.decrypt(Buffer.from(encoded,'base64'));if(!/^[0-9a-f]{64}$/.test(secret))throw new Error('Identity lookup key invalid')
  return Buffer.from(secret,'hex')
 }
 private digest(value:string,key:Buffer):string{return createHmac('sha256',key).update('eva-identity-v1\0').update(normalizeIdentity(value),'utf8').digest('hex')}
 forWrite(value:string):string|null{const key=this.existingKey();if(!key)return null;try{return value?this.digest(value,key):null}finally{key.fill(0)}}
 private initialize():Buffer{
  const existing=this.existingKey();if(existing)return existing
  if(!this.encrypt||!this.decrypt)throw new Error('Identity lookup encryption unavailable')
  const key=randomBytes(32)
  try{
   const protectedKey=this.encrypt(key.toString('hex'));if(this.decrypt(protectedKey)!==key.toString('hex'))throw new Error('Identity lookup key verification failed')
   this.db.transaction(()=>{
    const select=this.db.prepare('SELECT id,id_passport_ciphertext AS cipher FROM guests WHERE id>? AND id_passport_ciphertext IS NOT NULL ORDER BY id LIMIT 100')
    const update=this.db.prepare('UPDATE guests SET id_passport_lookup=? WHERE id=?')
    let last=0;for(;;){const rows=select.all(last) as {id:number;cipher:Buffer}[];if(!rows.length)break;for(const row of rows){update.run(this.digest(this.decrypt!(row.cipher),key),row.id);last=row.id}}
    this.db.prepare('DELETE FROM settings WHERE key=?').run(COMPANION_INDEX_SETTING)
    this.db.prepare('INSERT INTO settings(key,value_json) VALUES (?,?)').run(IDENTITY_KEY_SETTING,JSON.stringify(protectedKey.toString('base64')))
   })()
   return key
  }catch(error){key.fill(0);throw error}
 }
 private ensureCompanionIndex(key:Buffer):void{
  const marker=this.db.prepare('SELECT value_json AS value FROM settings WHERE key=?').get(COMPANION_INDEX_SETTING) as {value:string}|undefined
  if(marker){if(marker.value!=='true')throw new Error('Companion lookup index invalid');return}
  if(!this.decrypt)throw new Error('Identity lookup decryption unavailable')
  this.db.transaction(()=>{
   this.db.exec('CREATE INDEX IF NOT EXISTS companions_identity_lookup_idx ON additional_guests(id_passport_lookup) WHERE deleted_at IS NULL')
   const select=this.db.prepare('SELECT id,id_passport_ciphertext AS cipher FROM additional_guests WHERE id>? AND id_passport_ciphertext IS NOT NULL ORDER BY id LIMIT 100')
   const update=this.db.prepare('UPDATE additional_guests SET id_passport_lookup=? WHERE id=?')
   let last=0;for(;;){const rows=select.all(last) as {id:number;cipher:Buffer}[];if(!rows.length)break;for(const row of rows){update.run(this.digest(this.decrypt!(row.cipher),key),row.id);last=row.id}}
   this.db.prepare('INSERT INTO settings(key,value_json) VALUES (?,?)').run(COMPANION_INDEX_SETTING,'true')
  })()
 }
 findCompanionHistory(value:string):CompanionStay[]{
  const parsed=z.string().trim().max(100).parse(value);return parsed?this.findCompanionHistoryPage({identity:parsed}).rows:[]
 }
 findCompanionHistoryPage(input:CompanionHistoryInput):CompanionHistoryPage{
  const {identity,cursor}=companionHistoryPageSchema.parse(input),key=this.initialize()
  try{
   this.ensureCompanionIndex(key)
   const rows=this.db.prepare(`SELECT b.id AS bookingId,c.id AS companionId,c.full_name AS companionName,b.booking_reference AS reference,g.full_name AS primaryGuest,b.arrival_date AS arrival,b.departure_date AS departure,b.status FROM additional_guests c JOIN bookings b ON b.id=c.booking_id JOIN guests g ON g.id=b.guest_id WHERE c.deleted_at IS NULL AND b.deleted_at IS NULL AND c.id_passport_ciphertext IS NOT NULL AND c.id_passport_lookup=@lookup AND (@arrival IS NULL OR b.arrival_date<@arrival OR (b.arrival_date=@arrival AND b.id<@bookingId) OR (b.arrival_date=@arrival AND b.id=@bookingId AND c.id<@companionId)) ORDER BY b.arrival_date DESC,b.id DESC,c.id DESC LIMIT 21`).all({lookup:this.digest(identity,key),arrival:cursor?.arrival??null,bookingId:cursor?.bookingId??null,companionId:cursor?.companionId??null}) as CompanionStay[]
   const page=rows.slice(0,20),last=page.at(-1)
   return {rows:page,nextCursor:rows.length>20&&last?{arrival:last.arrival,bookingId:last.bookingId,companionId:last.companionId}:null}
  }finally{key.fill(0)}
 }

 find(value:string){
  const parsed=z.string().trim().max(100).parse(value);if(!parsed)return []
  const key=this.initialize();try{return this.db.prepare(`SELECT id,full_name AS fullName,COALESCE(mobile_whatsapp,'') AS phone,nationality,email,date_of_birth AS dateOfBirth,country,home_address AS address,notes,(id_passport_ciphertext IS NOT NULL) AS hasPrimaryId FROM guests WHERE deleted_at IS NULL AND id_passport_lookup=? ORDER BY id LIMIT 20`).all(this.digest(parsed,key))}finally{key.fill(0)}
 }
}
