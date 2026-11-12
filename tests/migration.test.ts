import {normalizePhone} from '../src/shared/phone'
import {it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createVerifiedBackup} from '../src/main/backup'
import {CampRepository} from '../src/main/repository'
import {stageRestore} from '../src/main/restore'
import {createPortableArchive,stagePortableRestore} from '../src/main/portable'
const sql=(name:string)=>readFileSync(join(process.cwd(),'db/migrations',name),'utf8')
it('upgrades a version-one booking to an equivalent unit segment',()=>{const db=new Database(':memory:');db.exec(sql('0001_initial.sql'));db.exec("INSERT INTO guests(full_name) VALUES ('Old guest');INSERT INTO units(name,type,capacity) VALUES ('1','room',1);INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,total_piasters,status,source) VALUES ('EVA-2026-1',1,1,'2026-11-01','2026-11-03',1,10000,'reserved','phone')");db.exec(sql('0002_unit_segments.sql'));expect(db.prepare('SELECT booking_id,unit_id,start_date,end_date FROM booking_unit_segments').get()).toEqual({booking_id:1,unit_id:1,start_date:'2026-11-01',end_date:'2026-11-03'});expect(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toEqual({v:2});db.close()})
it('backs up and restores a version-three database without dropping its segments',async()=>{const dir=mkdtempSync(join(tmpdir(),'eva-v2-'));const db=new Database(':memory:');try{db.exec(sql('0001_initial.sql'));db.exec(sql('0002_unit_segments.sql'));db.exec(sql('0003_guest_lookup.sql'));const repo=new CampRepository(db);const a=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0}),b=repo.createUnit({name:'B',type:'room',capacity:2,pricePiasters:0});const id=repo.createBooking({fullName:'Backup guest',phone:'',unitId:a,arrival:'2026-11-01',departure:'2026-11-05',adults:1,children:0,totalPiasters:0,source:'phone'}).id;repo.changeStatus(id,'checked-in');repo.transferUnit({bookingId:id,unitId:b,date:'2026-11-03'});const history=repo.unitHistory(id);const backup=await createVerifiedBackup(db,dir,new Date(2026,10,10));const staged=join(dir,'staged.sqlite');await stageRestore(backup,staged,()=>true);const check=new Database(staged,{readonly:true});expect(check.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toEqual({v:3});expect(new CampRepository(check).unitHistory(id)).toEqual(history);check.close();const portable=createPortableArchive(db,'Secure-password-123',()=>{throw new Error('unexpected')});const next=join(dir,'portable.sqlite');stagePortableRestore(portable,'Secure-password-123',next,()=>Buffer.alloc(0),()=>{throw new Error('unexpected')});const portableDb=new Database(next,{readonly:true});expect(portableDb.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toEqual({v:3});expect(new CampRepository(portableDb).unitHistory(id)).toEqual(history);portableDb.close()}finally{db.close();rmSync(dir,{recursive:true,force:true})}})

it('backfills legacy phone formats without changing display numbers or encrypted IDs',()=>{
 const db=new Database(':memory:')
 try{
  db.exec(sql('0001_initial.sql'));db.exec(sql('0002_unit_segments.sql'))
  const numbers=['01220755755','+20 122 075 5755','00201220755755','٠١٢٢٠٧٥٥٧٥٥','۰۱۲۲۰۷۵۵۷۵۵','+44 (20) 7946-0958','',' 00 1.555.123.4567 ']
  for(const phone of numbers)db.prepare('INSERT INTO guests(full_name,mobile_whatsapp,id_passport_ciphertext) VALUES (?,?,?)').run('Legacy guest',phone,Buffer.from('opaque-cipher'))
  db.exec(sql('0003_guest_lookup.sql'))
  const rows=db.prepare('SELECT mobile_whatsapp AS phone,normalized_phone AS normalized,id_passport_ciphertext AS cipher FROM guests ORDER BY id').all() as {phone:string;normalized:string;cipher:Buffer}[]
  expect(rows.map(row=>row.phone)).toEqual(numbers)
  expect(rows.map(row=>row.normalized)).toEqual(numbers.map(normalizePhone))
  expect(rows.every(row=>row.cipher.equals(Buffer.from('opaque-cipher')))).toBe(true)
  expect(new CampRepository(db).findGuests('+201220755755')).toHaveLength(5)
 }finally{db.close()}
})
it('restores a schema-two snapshot then upgrades phone lookup and linked stay history',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eva-legacy-v2-')),db=new Database(':memory:')
 try{
  db.exec(sql('0001_initial.sql'));db.exec(sql('0002_unit_segments.sql'))
  db.exec("INSERT INTO guests(full_name,mobile_whatsapp) VALUES ('Legacy guest','٠١٢٢٠٧٥٥٧٥٥');INSERT INTO units(name,type,capacity) VALUES ('A','room',2);INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,total_piasters,status,source) VALUES ('EVA-2026-OLD',1,1,'2026-11-01','2026-11-03',1,10000,'reserved','phone')")
  const local=await createVerifiedBackup(db,dir,new Date(2026,10,10)),staged=join(dir,'local.sqlite'),portable=join(dir,'portable.sqlite')
  await stageRestore(local,staged,()=>true)
  stagePortableRestore(createPortableArchive(db,'Secure-password-123',()=>''),'Secure-password-123',portable,()=>Buffer.alloc(0),()=>'')
  for(const file of [staged,portable]){
   const restored=new Database(file)
   try{restored.exec(sql('0003_guest_lookup.sql'));const repo=new CampRepository(restored);expect(repo.findGuests('+20 122 075 5755')).toMatchObject([{id:1,fullName:'Legacy guest'}]);expect(repo.guestHistory({guestId:1}).rows).toMatchObject([{reference:'EVA-2026-OLD'}])}finally{restored.close()}
  }
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})

it('upgrades existing bookings and keeps legacy declaration paths untrusted',()=>{
 const db=new Database(':memory:')
 try{
  for(const file of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql'])db.exec(sql(file))
  db.exec("INSERT INTO guests(full_name) VALUES ('Legacy');INSERT INTO units(name,type,capacity) VALUES ('A','room',2);INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,total_piasters,status,source) VALUES ('OLD',1,1,'2026-11-01','2026-11-03',1,10000,'reserved','phone');INSERT INTO declarations(booking_id,confirmation_text,signature_path,received_by,signed_date) VALUES (1,'Old confirmation','C:/signature.png','Staff','2026-11-01')")
  db.exec(sql('0004_declarations.sql'))
  expect(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toEqual({v:4})
  expect(new CampRepository(db).getDeclaration(1)).toMatchObject({isCurrent:false,signature:null,hasPrevious:true,receivedBy:'Staff'})
  expect(new CampRepository(db).registrationData(1).fullName).toBe('Legacy')
 }finally{db.close()}
})
