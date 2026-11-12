import {it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {stageRestore,applyStagedRestore} from '../src/main/restore'
const schema=readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8')
it('stages and restores a verified backup while retaining the previous database',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-restore-'));const live=join(dir,'live.sqlite'),source=join(dir,'backup.sqlite'),pending=join(dir,'pending.sqlite'),previous=join(dir,'previous.sqlite')
 try{let db=new Database(live);db.exec(schema);db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Current');db.close();db=new Database(source);db.exec(schema);db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Restored');db.close()
  await stageRestore(source,pending,()=>true);applyStagedRestore(live,pending,previous)
  let restored=new Database(live,{readonly:true});expect(restored.prepare('SELECT full_name FROM guests').get()).toEqual({full_name:'Restored'});restored.close()
  restored=new Database(previous,{readonly:true});expect(restored.prepare('SELECT full_name FROM guests').get()).toEqual({full_name:'Current'});restored.close()
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('refuses corrupt backups and inaccessible encrypted identities without modifying live data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-restore-'));const source=join(dir,'backup.sqlite'),pending=join(dir,'pending.sqlite')
 try{writeFileSync(source,'corrupt');await expect(stageRestore(source,pending,()=>true)).rejects.toThrow();expect(existsSync(pending)).toBe(false)
  rmSync(source);const db=new Database(source);db.exec(schema);db.prepare('INSERT INTO guests(full_name,id_passport_ciphertext) VALUES (?,?)').run('Guest',Buffer.from('encrypted'));db.close()
  await expect(stageRestore(source,pending,()=>false)).rejects.toThrow('encrypted identities');expect(existsSync(pending)).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('recovers the previous database when interrupted during the rename',()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-restore-'));const live=join(dir,'live.sqlite'),pending=join(dir,'pending.sqlite'),previous=join(dir,'previous.sqlite')
 try{const db=new Database(previous);db.exec(schema);db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Old');db.close();applyStagedRestore(live,pending,previous);const recovered=new Database(live,{readonly:true});expect(recovered.prepare('select full_name from guests').get()).toEqual({full_name:'Old'});recovered.close()}
 finally{rmSync(dir,{recursive:true,force:true})}
})
it('does not replace the live database if its write-ahead log remains active',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-restore-wal-'));const live=join(dir,'live.sqlite'),source=join(dir,'backup.sqlite'),pending=join(dir,'pending.sqlite'),previous=join(dir,'previous.sqlite')
 try{let db=new Database(live);db.exec(schema);db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Current');db.close();db=new Database(source);db.exec(schema);db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Replacement');db.close();await stageRestore(source,pending,()=>true);writeFileSync(live+'-wal','nonempty');expect(()=>applyStagedRestore(live,pending,previous)).toThrow('journal');rmSync(live+'-wal');const existing=new Database(live,{readonly:true});expect(existing.prepare('SELECT full_name FROM guests').get()).toEqual({full_name:'Current'});existing.close();expect(existsSync(pending)).toBe(true)}
 finally{rmSync(dir,{recursive:true,force:true})}
})
it('rejects a backup when encrypted identity history cannot be recovered on this account',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-history-'));const source=join(dir,'backup.sqlite'),pending=join(dir,'pending.sqlite')
 try{const db=new Database(source);db.exec(schema);db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?)').run('operator','identity-change','primary','1',JSON.stringify({before:Buffer.from('old-key').toString('base64'),after:null}));db.close();await expect(stageRestore(source,pending,()=>false)).rejects.toThrow('encrypted identities');expect(existsSync(pending)).toBe(false)}finally{rmSync(dir,{recursive:true,force:true})}
})
it('rejects a backup with broken foreign keys without leaving a staged file',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-restore-fk-'));const source=join(dir,'backup.sqlite'),pending=join(dir,'pending.sqlite')
 try{const db=new Database(source);db.exec(schema);db.pragma('foreign_keys = OFF');db.prepare('INSERT INTO additional_guests(booking_id,full_name) VALUES (?,?)').run(999,'Orphan');db.close();await expect(stageRestore(source,pending,()=>true)).rejects.toThrow('foreign keys');expect(existsSync(pending)).toBe(false)}finally{rmSync(dir,{recursive:true,force:true})}
})
it('rejects a backup whose protected identity lookup key cannot be opened',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-index-restore-'));const source=join(dir,'backup.sqlite'),pending=join(dir,'pending.sqlite')
 try{const db=new Database(source);db.exec(schema);db.prepare('INSERT INTO settings(key,value_json) VALUES (?,?)').run('security:identity-lookup-key-v1',JSON.stringify(Buffer.from('protected-key').toString('base64')));db.close();await expect(stageRestore(source,pending,()=>false)).rejects.toThrow('encrypted identities');expect(existsSync(pending)).toBe(false)}finally{rmSync(dir,{recursive:true,force:true})}
})
