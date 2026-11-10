import {it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {mkdtempSync,readFileSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createVerifiedBackup} from '../src/main/backup'
it('takes a consistent SQLite backup and keeps the newest thirty daily files',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-backup-'));const db=new Database(':memory:')
 try{db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('عميل')
 const result=await createVerifiedBackup(db,dir,new Date('2026-11-10T12:00:00Z'))
 const restored=new Database(result,{readonly:true});expect(restored.prepare('select full_name from guests').get()).toEqual({full_name:'عميل'});restored.close()
 for(let day=1;day<=31;day++) await createVerifiedBackup(db,dir,new Date(Date.UTC(2026,11,day,12)))
 expect(readdirSync(dir).filter(x=>x.endsWith('.sqlite'))).toHaveLength(30)
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})
it('captures uncheckpointed WAL data from a file-backed database',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-wal-'));const db=new Database(join(dir,'live.sqlite'));db.pragma('journal_mode = WAL');db.pragma('wal_autocheckpoint = 0')
 try {db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Test WAL guest')
  const file=await createVerifiedBackup(db,join(dir,'snapshots'),new Date(2026,10,10,12));const snapshot=new Database(file,{readonly:true});expect(snapshot.prepare('SELECT full_name FROM guests').get()).toEqual({full_name:'Test WAL guest'});snapshot.close()
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})
it('exports a fresh manual backup when a daily backup already exists',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-manual-'));const db=new Database(':memory:')
 try{db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));await createVerifiedBackup(db,dir,new Date(2026,10,10,12));db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Later guest')
  const {createManualBackup}=await import('../src/main/backup');const target=join(dir,'manual.sqlite');await createManualBackup(db,target);const snapshot=new Database(target,{readonly:true});expect(snapshot.prepare('SELECT full_name FROM guests').get()).toEqual({full_name:'Later guest'});snapshot.close()
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})
it('refreshes the same-day automatic backup with later committed changes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-daily-'));const db=new Database(':memory:')
 try{db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));const time=new Date(2026,10,10,12);const path=await createVerifiedBackup(db,dir,time);db.prepare('INSERT INTO guests(full_name) VALUES (?)').run('Later guest');await createVerifiedBackup(db,dir,time);const snapshot=new Database(path,{readonly:true});expect(snapshot.prepare('SELECT full_name FROM guests').get()).toEqual({full_name:'Later guest'});snapshot.close()}
 finally{db.close();rmSync(dir,{recursive:true,force:true})}
})
