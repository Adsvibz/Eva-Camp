import Database from 'better-sqlite3'
import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto'
import {openSync,writeFileSync,closeSync,fsyncSync,rmSync} from 'node:fs'

const MAGIC=Buffer.from('EVACAMP1','ascii'), MARKER='__eva_portable_identity_v1'
const passwordKey=(password:string,salt:Buffer)=>{if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Password must have 12 to 256 characters');return scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024})}
function verify(db:Database.Database){
 if(db.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Database integrity check failed')
 if((db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Database foreign keys are invalid')
 const version=db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number}
 if(version.version!==1)throw new Error('Unsupported database version')
}
function convertIdentities(db:Database.Database,convert:(value:Buffer)=>Buffer){
 for(const table of ['guests','additional_guests'] as const){
  const rows=db.prepare(`SELECT id,id_passport_ciphertext AS cipher FROM ${table} WHERE id_passport_ciphertext IS NOT NULL`).all() as {id:number;cipher:Buffer}[]
  const update=db.prepare(`UPDATE ${table} SET id_passport_ciphertext=?,id_passport_lookup=NULL WHERE id=?`)
  for(const row of rows)update.run(convert(row.cipher),row.id)
 }
 const changes=db.prepare("SELECT id,detail_json AS detail FROM audit_log WHERE action='identity-change'").all() as {id:number;detail:string}[]
 const update=db.prepare('UPDATE audit_log SET detail_json=? WHERE id=?')
 for(const change of changes){const value=JSON.parse(change.detail) as {before:string|null;after:string|null};for(const field of ['before','after'] as const)if(value[field])value[field]=convert(Buffer.from(value[field]!,'base64')).toString('base64');update.run(JSON.stringify(value),change.id)}
}
/** The only plaintext copy is held in memory; the resulting archive is encrypted and authenticated. */
export function createPortableArchive(live:Database.Database,password:string,decrypt:(value:Buffer)=>string):Buffer {
 const salt=randomBytes(16),iv=randomBytes(12),key=passwordKey(password,salt),snapshot=new Database(live.serialize())
 let plain:Buffer|undefined
 try{
  snapshot.pragma('temp_store = MEMORY');snapshot.pragma('journal_mode = MEMORY');snapshot.pragma('secure_delete = ON');snapshot.pragma('foreign_keys = ON');verify(snapshot)
  if(snapshot.prepare('SELECT key FROM settings WHERE key=?').get(MARKER))throw new Error('Unexpected portable database marker')
  snapshot.transaction(()=>{convertIdentities(snapshot,value=>Buffer.from(decrypt(value),'utf8'));snapshot.prepare('INSERT INTO settings(key,value_json) VALUES (?,?)').run(MARKER,JSON.stringify(true))})()
  snapshot.exec('VACUUM');plain=snapshot.serialize()
  const cipher=createCipheriv('aes-256-gcm',key,iv);const header=Buffer.concat([MAGIC,salt,iv]);cipher.setAAD(header)
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);return Buffer.concat([header,encrypted,cipher.getAuthTag()])
 }finally{plain?.fill(0);key.fill(0);snapshot.close()}
}
/** Writes only the locally re-encrypted database to a new staging file, never plaintext IDs. */
export function stagePortableRestore(archive:Buffer,password:string,pending:string,encrypt:(value:string)=>Buffer,decrypt:(value:Buffer)=>string):void {
 if(archive.length<8+16+12+16||!archive.subarray(0,8).equals(MAGIC))throw new Error('Invalid portable backup')
 const header=archive.subarray(0,36),salt=archive.subarray(8,24),iv=archive.subarray(24,36),tag=archive.subarray(archive.length-16),key=passwordKey(password,salt)
 let plain:Buffer|undefined,finalData:Buffer|undefined,snapshot:Database.Database|undefined,created=false,fd:number|undefined
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(header);decipher.setAuthTag(tag);plain=Buffer.concat([decipher.update(archive.subarray(36,-16)),decipher.final()]);snapshot=new Database(plain)
  snapshot.pragma('temp_store = MEMORY');snapshot.pragma('journal_mode = MEMORY');snapshot.pragma('secure_delete = ON');snapshot.pragma('foreign_keys = ON');verify(snapshot)
  if(!snapshot.prepare('SELECT key FROM settings WHERE key=?').get(MARKER))throw new Error('Invalid portable backup marker')
  const decoder=new TextDecoder('utf-8',{fatal:true})
  snapshot.transaction(()=>{convertIdentities(snapshot!,value=>{const original=decoder.decode(value);const cipher=encrypt(original);if(decrypt(cipher)!==original)throw new Error('Identity encryption verification failed');return cipher});snapshot!.prepare('DELETE FROM settings WHERE key=?').run(MARKER)})()
  snapshot.exec('VACUUM');verify(snapshot);finalData=snapshot.serialize()
  fd=openSync(pending,'wx',0o600);created=true;writeFileSync(fd,finalData);fsyncSync(fd);closeSync(fd);fd=undefined
 }catch(error){if(fd!==undefined)closeSync(fd);if(created)rmSync(pending,{force:true});throw error}
 finally{snapshot?.close();plain?.fill(0);finalData?.fill(0);key.fill(0)}
}
