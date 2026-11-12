import {createHmac,randomBytes} from 'node:crypto'
import type Database from 'better-sqlite3'
import {z} from 'zod'

export const IDENTITY_KEY_SETTING='security:identity-lookup-key-v1'
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
    this.db.prepare('INSERT INTO settings(key,value_json) VALUES (?,?)').run(IDENTITY_KEY_SETTING,JSON.stringify(protectedKey.toString('base64')))
   })()
   return key
  }catch(error){key.fill(0);throw error}
 }
 find(value:string){
  const parsed=z.string().trim().max(100).parse(value);if(!parsed)return []
  const key=this.initialize();try{return this.db.prepare(`SELECT id,full_name AS fullName,COALESCE(mobile_whatsapp,'') AS phone,nationality,email,date_of_birth AS dateOfBirth,country,home_address AS address,notes,(id_passport_ciphertext IS NOT NULL) AS hasPrimaryId FROM guests WHERE deleted_at IS NULL AND id_passport_lookup=? ORDER BY id LIMIT 20`).all(this.digest(parsed,key))}finally{key.fill(0)}
 }
}
