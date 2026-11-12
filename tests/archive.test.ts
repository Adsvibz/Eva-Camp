import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {CampRepository} from '../src/main/repository'
import {registrationHtml} from '../src/main/print'
import {createVerifiedBackup} from '../src/main/backup'
import {stageRestore} from '../src/main/restore'
import {createPortableArchive,stagePortableRestore} from '../src/main/portable'
const seal=(s:string)=>Buffer.from(s.split('').reverse().join(''),'utf8')
const open=(b:Buffer)=>b.toString('utf8').split('').reverse().join('')
const fonts={serif:'YWJj',serifBold:'ZGVm',arabic:'Z2hp',arabicBold:'amts'}
const ink=[[[0.1,0.7],[0.4,0.2],[0.8,0.6]]] as [number,number][][]
describe('frozen declaration archives',()=>{
 let db:Database.Database,repo:CampRepository,id:number
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',f),'utf8'));repo=new CampRepository(db,seal,open,()=>'2026-11-12',data=>({html:registrationHtml(data,fonts),fonts}));const u=repo.createUnit({name:'Room A',type:'room',capacity:2,pricePiasters:0});id=repo.createBooking({fullName:'Original guest',phone:'',idNumber:'PRIVATE-ID-1234',unitId:u,arrival:'2026-11-10',departure:'2026-11-14',adults:1,children:0,totalPiasters:100000,source:'phone'}).id})
 afterEach(()=>db.close())
 function sign(signature:[number,number][][]|null=ink){return repo.saveDeclaration({bookingId:id,expectedRevision:repo.getDeclaration(id).revision,receivedBy:'Staff',signedDate:'2026-11-12',confirmed:true,signature})}
 it('preserves the original signed registration after guest and payment changes',()=>{
  sign();const [entry]=repo.listDeclarationArchives(id,0).rows;const before=repo.declarationArchiveHtml(entry.id)
  expect(before).toContain('Original guest');expect(before).toContain('PRIVATE-ID-1234');expect(before).toContain('class="guest-signature"');expect(entry.hasSignature).toBe(true)
  repo.addPayment({bookingId:id,amountPiasters:25000,method:'cash',date:'2026-11-12'});db.prepare("UPDATE guests SET full_name='Changed' WHERE id=(SELECT guest_id FROM bookings WHERE id=?)").run(id)
  expect(repo.getDeclaration(id).isCurrent).toBe(false);expect(registrationHtml(repo.registrationData(id))).not.toContain('class="guest-signature"')
  expect(repo.declarationArchiveHtml(entry.id)).toBe(before)
 })
 it('freezes the actual bundled fonts and logo along with the registration layout',()=>{
  const actualFonts={serif:readFileSync(join(process.cwd(),'assets/fonts/NotoSerif-Regular.ttf')).toString('base64'),serifBold:readFileSync(join(process.cwd(),'assets/fonts/NotoSerif-Bold.ttf')).toString('base64'),arabic:readFileSync(join(process.cwd(),'assets/fonts/NotoNaskhArabic-Regular.ttf')).toString('base64'),arabicBold:readFileSync(join(process.cwd(),'assets/fonts/NotoNaskhArabic-Bold.ttf')).toString('base64')}
  const logo='data:image/png;base64,YWJj',snapshotRepo=new CampRepository(db,seal,open,()=>'2026-11-12',data=>({html:registrationHtml(data,actualFonts,logo),fonts:actualFonts}))
  snapshotRepo.saveDeclaration({bookingId:id,expectedRevision:repo.getDeclaration(id).revision,receivedBy:'Staff',signedDate:'2026-11-12',confirmed:true,signature:ink})
  const entry=snapshotRepo.listDeclarationArchives(id,0).rows[0],original=registrationHtml(snapshotRepo.registrationData(id),actualFonts,logo)
  expect(snapshotRepo.declarationArchiveHtml(entry.id)).toBe(original)
  db.prepare("UPDATE units SET name='Different' WHERE id=(SELECT unit_id FROM bookings WHERE id=?)").run(id)
  expect(snapshotRepo.declarationArchiveHtml(entry.id)).toBe(original)
 })
 it('keeps previous declarations and identifies an undone save without deleting it',()=>{sign();const change=sign(null);let list=repo.listDeclarationArchives(id,0).rows;expect(list).toHaveLength(2);expect(list[0]).toMatchObject({hasSignature:false,undone:false});repo.undoDeclaration({bookingId:id,changeId:change});list=repo.listDeclarationArchives(id,0).rows;expect(list).toHaveLength(2);expect(list[0].undone).toBe(true);expect(repo.declarationArchiveHtml(list[1].id)).toContain('class="guest-signature"')})
 it('rolls back confirmation if archive protection or audit fails',()=>{const broken=new CampRepository(db,()=>{throw new Error('Key unavailable')},open,()=>'2026-11-12',data=>({html:registrationHtml(data,fonts),fonts}));expect(()=>broken.saveDeclaration({bookingId:id,expectedRevision:repo.getDeclaration(id).revision,receivedBy:'Staff',signedDate:'2026-11-12',confirmed:true,signature:ink})).toThrow();expect(repo.getDeclaration(id).isCurrent).toBe(false);expect(repo.listDeclarationArchives(id,0).rows).toEqual([])})
 it('detects damaged archives and does not expose plaintext HTML or identity to SQLite',()=>{sign();const entry=repo.listDeclarationArchives(id,0).rows[0];expect(db.serialize().includes(Buffer.from('PRIVATE-ID-1234'))).toBe(false);db.prepare("UPDATE declaration_archives SET cipher_hash='bad' WHERE id=?").run(entry.id);expect(()=>repo.declarationArchiveHtml(entry.id)).toThrow('ARCHIVE_INTEGRITY')})
 it('rejects corrupted archive backups without replacing a previous valid backup',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'eva-archive-corrupt-'))
  try{sign();const day=new Date(2026,10,12),previous=await createVerifiedBackup(db,dir,day),valid=readFileSync(previous);db.prepare("UPDATE declaration_archives SET cipher_hash='corrupt'").run();await expect(createVerifiedBackup(db,dir,day)).rejects.toThrow('ARCHIVE_INTEGRITY');expect(readFileSync(previous)).toEqual(valid);expect(()=>createPortableArchive(db,'Long-password-2026',open)).toThrow('ARCHIVE_INTEGRITY');const damaged=join(dir,'damaged.sqlite');await db.backup(damaged);await expect(stageRestore(damaged,join(dir,'pending.sqlite'),()=>true)).rejects.toThrow('ARCHIVE_INTEGRITY')}
  finally{rmSync(dir,{recursive:true,force:true})}
 })
 it('restores encrypted archives in local and portable backups using a different key',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'eva-archive-'));try{sign();const entry=repo.listDeclarationArchives(id,0).rows[0],original=repo.declarationArchiveHtml(entry.id);const local=join(dir,'local.sqlite'),portable=join(dir,'portable.sqlite');await stageRestore(await createVerifiedBackup(db,dir),local,()=>true);const enc2=(s:string)=>Buffer.from('new:'+s),dec2=(b:Buffer)=>b.toString().slice(4);stagePortableRestore(createPortableArchive(db,'Long-password-2026',open),'Long-password-2026',portable,enc2,dec2);for(const [file,decrypt] of [[local,open],[portable,dec2]] as const){const restored=new Database(file);try{expect(new CampRepository(restored,undefined,decrypt).declarationArchiveHtml(entry.id)).toBe(original)}finally{restored.close()}}}finally{rmSync(dir,{recursive:true,force:true})}
 })
 it('paginates archive history and rejects invalid archive references',()=>{for(let i=0;i<55;i++)sign(null);const first=repo.listDeclarationArchives(id,0),second=repo.listDeclarationArchives(id,50);expect(first.rows).toHaveLength(50);expect(first.hasMore).toBe(true);expect(second.rows).toHaveLength(5);expect(second.hasMore).toBe(false);expect(()=>repo.declarationArchiveHtml(99999)).toThrow();expect(()=>repo.listDeclarationArchives(id,-1)).toThrow()})
})
