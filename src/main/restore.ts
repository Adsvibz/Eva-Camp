import Database from 'better-sqlite3'
import { existsSync, renameSync, rmSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

function validate(db:Database.Database,canDecrypt:(value:Buffer)=>boolean) {
 if(db.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity check failed')
 const version=db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number}
 if(![1,2,3].includes(version.version))throw new Error('Unsupported backup version')
 const fields=db.prepare(`SELECT id_passport_ciphertext AS value FROM guests WHERE id_passport_ciphertext IS NOT NULL UNION ALL SELECT id_passport_ciphertext AS value FROM additional_guests WHERE id_passport_ciphertext IS NOT NULL`).iterate() as Iterable<{value:Buffer}>
 const verify=(value:Buffer)=>{let ok=false;try{ok=canDecrypt(value)}catch{ok=false}if(!ok)throw new Error('Backup contains encrypted identities that cannot be decrypted on this computer')}
 for(const row of fields)verify(row.value)
 const history=db.prepare("SELECT detail_json AS detail FROM audit_log WHERE action='identity-change'").iterate() as Iterable<{detail:string}>
 for(const row of history){const details=JSON.parse(row.detail) as {before:string|null;after:string|null};for(const value of [details.before,details.after])if(value)verify(Buffer.from(value,'base64'))}

}
/** Copy a validated backup to a staging file without changing the live database. */
export async function stageRestore(source:string,pending:string,canDecrypt:(value:Buffer)=>boolean):Promise<void>{
 if(existsSync(pending))throw new Error('A restore is already pending')
 const sourceDb=new Database(source,{readonly:true,fileMustExist:true});const temporary=pending+'.'+randomUUID()+'.tmp'
 try{validate(sourceDb,canDecrypt);await sourceDb.backup(temporary);const staged=new Database(temporary,{readonly:true,fileMustExist:true});try{validate(staged,canDecrypt)}finally{staged.close()};renameSync(temporary,pending)}
 finally{sourceDb.close();rmSync(temporary,{force:true})}
}
/** Called only before opening the live database. Retains the previous file for recovery. */
export function applyStagedRestore(live:string,pending:string,previous:string):boolean {
 if(!existsSync(live)&&existsSync(previous))renameSync(previous,live)
 if(!existsSync(pending))return false
 for(const suffix of ['-wal','-shm']){const sidecar=live+suffix;if(existsSync(sidecar)&&statSync(sidecar).size>0)throw new Error('Database journal must be checkpointed before restore')}
 if(existsSync(previous))renameSync(previous,previous+'.'+randomUUID()+'.sqlite')
 let moved=false
 try{if(existsSync(live)){renameSync(live,previous);moved=true}renameSync(pending,live);return true}
 catch(error){if(moved&&!existsSync(live)&&existsSync(previous))renameSync(previous,live);throw error}
}
