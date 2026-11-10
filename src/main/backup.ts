import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** SQLite online backup includes committed WAL changes. Previous backups are pruned only after verification. */
export async function createVerifiedBackup(db:Database.Database,directory:string,when=new Date()):Promise<string> {
 if(Number.isNaN(when.valueOf()))throw new Error('Invalid backup date')
 mkdirSync(directory,{recursive:true})
 const date=`${when.getFullYear()}-${String(when.getMonth()+1).padStart(2,'0')}-${String(when.getDate()).padStart(2,'0')}`
 const destination=join(directory,`eva-camp-${date}.sqlite`)

 const temporary=join(directory,`.eva-camp-${randomUUID()}.tmp`)
 try {
  await db.backup(temporary)
  const snapshot=new Database(temporary,{readonly:true,fileMustExist:true})
  try {if(snapshot.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity check failed');const version=snapshot.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number};if(![1,2,3].includes(version.version))throw new Error('Unsupported backup schema')}
  finally{snapshot.close()}
  renameSync(temporary,destination)
  const files=readdirSync(directory).filter(name=>/^eva-camp-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).sort().reverse()
  for(const name of files.slice(30))rmSync(join(directory,name))
  return destination
 } finally {rmSync(temporary,{force:true})}
}

/** Manual snapshots require a new destination, so an existing database is never replaced. */
export async function createManualBackup(db:Database.Database,destination:string):Promise<string> {
 if(existsSync(destination))throw new Error('Choose a new backup filename')
 const temporary=destination+'.'+randomUUID()+'.tmp'
 try {
  await db.backup(temporary)
  const snapshot=new Database(temporary,{readonly:true,fileMustExist:true})
  try{if(snapshot.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity check failed');const version=snapshot.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number};if(![1,2,3].includes(version.version))throw new Error('Unsupported backup schema')}
  finally{snapshot.close()}
  if(existsSync(destination))throw new Error('Backup destination already exists')
  renameSync(temporary,destination)
  return destination
 } finally {rmSync(temporary,{force:true})}
}
