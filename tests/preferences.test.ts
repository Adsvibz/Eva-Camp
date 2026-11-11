import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {createVerifiedBackup} from '../src/main/backup'
import {stageRestore} from '../src/main/restore'
import {createPortableArchive,stagePortableRestore} from '../src/main/portable'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('appearance and language preferences',()=>{
 let db:Database.Database,repo:CampRepository
 beforeEach(()=>{db=new Database(':memory:');for(const file of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',file),'utf8'));repo=new CampRepository(db)})
 afterEach(()=>db.close())
 it('defaults to English and light appearance for existing databases',()=>{
  expect(repo.getPreferences()).toEqual({language:'en',theme:'light'})
 })
 it('persists validated preferences and audits changes exactly once',()=>{
  repo.savePreferences({language:'ar',theme:'dark'})
  expect(new CampRepository(db).getPreferences()).toEqual({language:'ar',theme:'dark'})
  expect(db.prepare("SELECT count(*) n FROM audit_log WHERE action='preferences-update'").get()).toEqual({n:1})
  repo.savePreferences({language:'ar',theme:'dark'})
  expect(db.prepare("SELECT count(*) n FROM audit_log WHERE action='preferences-update'").get()).toEqual({n:1})
 })
 it('rejects unknown settings without altering stored values or audit history',()=>{
  repo.savePreferences({language:'en',theme:'system'})
  expect(()=>repo.savePreferences({language:'ar',theme:'sepia'} as never)).toThrow()
  expect(()=>repo.savePreferences({language:'ar',theme:'light',printer:'other'} as never)).toThrow()
  expect(repo.getPreferences()).toEqual({language:'en',theme:'system'})
  expect(db.prepare("SELECT count(*) n FROM audit_log WHERE action='preferences-update'").get()).toEqual({n:1})
 })
 it('falls back safely if a saved preference is damaged',()=>{
  db.prepare("INSERT INTO settings(key,value_json) VALUES ('ui:preferences',?)").run('{invalid')
  expect(repo.getPreferences()).toEqual({language:'en',theme:'light'})
  repo.savePreferences({language:'ar',theme:'dark'})
  expect(repo.getPreferences()).toEqual({language:'ar',theme:'dark'})
 })
 it('keeps preferences distinct from closing records',()=>{
  repo.closeDay('2026-11-11');repo.savePreferences({language:'ar',theme:'system'})
  expect(repo.dailyReport('2026-11-11').closed).toBe(true)
 })
 it('preserves preferences through both backup formats',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'eva-preferences-'))
  try{
   repo.savePreferences({language:'ar',theme:'dark'})
   const backup=await createVerifiedBackup(db,dir,new Date(2026,10,11)),local=join(dir,'local.sqlite'),portable=join(dir,'portable.sqlite')
   await stageRestore(backup,local,()=>true)
   stagePortableRestore(createPortableArchive(db,'Secure-password-123',()=>''),'Secure-password-123',portable,()=>Buffer.alloc(0),()=>'')
   for(const file of [local,portable]){const restored=new Database(file,{readonly:true});try{expect(new CampRepository(restored).getPreferences()).toEqual({language:'ar',theme:'dark'})}finally{restored.close()}}
  }finally{rmSync(dir,{recursive:true,force:true})}
 })

})
