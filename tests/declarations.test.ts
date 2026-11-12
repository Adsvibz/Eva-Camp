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
const strokes=[[[0.1,0.7],[0.4,0.2],[0.8,0.6]]] as [number,number][][]
describe('guest declaration',()=>{
 let db:Database.Database,repo:CampRepository,id:number,unitId:number
 beforeEach(()=>{
  db=new Database(':memory:')
  for(const file of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',file),'utf8'))
  repo=new CampRepository(db,s=>Buffer.from('old:'+s),b=>b.toString().slice(4),()=>'2026-11-12')
  unitId=repo.createUnit({name:'A',type:'room',capacity:3,pricePiasters:0})
  id=repo.createBooking({fullName:'Guest',phone:'',idNumber:'PRIVATE-ID',unitId,arrival:'2026-11-10',departure:'2026-11-14',adults:1,children:0,totalPiasters:100000,source:'phone'}).id
 })
 afterEach(()=>db.close())
 function save(signature:[number,number][][]|null=strokes){return repo.saveDeclaration({bookingId:id,expectedRevision:repo.getDeclaration(id).revision,receivedBy:'أحمد <script>',signedDate:'2026-11-12',confirmed:true,signature})}
 it('saves confirmation and optional ink with escaped staff name and date on the form',()=>{
  save()
  expect(repo.getDeclaration(id)).toMatchObject({isCurrent:true,receivedBy:'أحمد <script>',signedDate:'2026-11-12',signature:strokes})
  const html=registrationHtml(repo.registrationData(id))
  expect(html).toContain('12/11/2026');expect(html).toContain('أحمد &lt;script&gt;');expect(html).toContain('class="guest-signature"');expect(html).not.toContain('<script>')
  expect(registrationHtml(null)).not.toContain('class="guest-signature"')
 })
 it('supports a confirmed declaration with a blank signature line',()=>{save(null);expect(repo.getDeclaration(id)).toMatchObject({isCurrent:true,signature:null});expect(registrationHtml(repo.registrationData(id))).not.toContain('class="guest-signature"')})
 it.each(['guest','identity','companion','booking','payment','extra','unit'] as const)('invalidates the old signature after a %s change',kind=>{
  save()
  const revision=repo.getDeclaration(id).revision
  if(kind==='guest')db.prepare('UPDATE guests SET full_name=? WHERE id=(SELECT guest_id FROM bookings WHERE id=?)').run('Changed',id)
  if(kind==='identity')repo.replaceIdentity({bookingId:id,kind:'primary',idNumber:'NEW-ID'})
  if(kind==='companion')repo.addCompanion({bookingId:id,fullName:'Companion'})
  if(kind==='booking')repo.setDiscount({bookingId:id,discountPiasters:100,expectedDiscountPiasters:0})
  if(kind==='payment')repo.addPayment({bookingId:id,amountPiasters:100,method:'cash',date:'2026-11-12'})
  if(kind==='extra')repo.addExtra({bookingId:id,description:'Meal',quantity:1,unitPricePiasters:100})
  if(kind==='unit')db.prepare('UPDATE units SET name=? WHERE id=?').run('B',unitId)
  expect(repo.getDeclaration(id)).toMatchObject({isCurrent:false,signature:null})
  expect(repo.getDeclaration(id).revision).toBeGreaterThan(revision)
  expect(registrationHtml(repo.registrationData(id))).not.toContain('class="guest-signature"')
  expect(()=>repo.saveDeclaration({bookingId:id,expectedRevision:revision,receivedBy:'Staff',signedDate:'2026-11-12',confirmed:true,signature:strokes})).toThrow('DECLARATION_CHANGED')
 })
 it('does not invalidate another guest or a housekeeping-only change',()=>{save();db.prepare("INSERT INTO guests(full_name) VALUES ('Other')").run();db.prepare("UPDATE units SET housekeeping_status='cleaning' WHERE id=?").run(unitId);expect(repo.getDeclaration(id).isCurrent).toBe(true)})
 it('undoes replacement without permitting an old signature after a form change',()=>{
  save();const change=save(null)
  repo.undoDeclaration({bookingId:id,changeId:change})
  expect(repo.getDeclaration(id).signature).toEqual(strokes)
  expect(()=>repo.undoDeclaration({bookingId:id,changeId:change})).toThrow('DECLARATION_CHANGED')
  const next=save(null);repo.addPayment({bookingId:id,amountPiasters:100,method:'cash',date:'2026-11-12'})
  expect(()=>repo.undoDeclaration({bookingId:id,changeId:next})).toThrow('DECLARATION_CHANGED')
  expect(repo.getDeclaration(id).isCurrent).toBe(false)
 })
 it('rejects missing confirmation, bad dates, unsafe ink and archived bookings',()=>{
  const base={bookingId:id,expectedRevision:0,receivedBy:'Staff',signedDate:'2026-11-12',confirmed:true,signature:strokes}
  for(const patch of [{confirmed:false},{receivedBy:' '},{signedDate:'2026-02-30'},{signedDate:'2026-11-13'},{signature:[]},{signature:[[[0,0],[2,1]]]},{signature:'<svg onload=evil()>'}])expect(()=>repo.saveDeclaration({...base,...patch} as any)).toThrow()
  expect(repo.getDeclaration(id).isCurrent).toBe(false)
  repo.changeStatus(id,'cancelled');expect(()=>save()).toThrow('Booking unavailable')
 })
 it('rolls back a save if audit insertion fails',()=>{db.exec("CREATE TRIGGER fail_declaration BEFORE INSERT ON audit_log WHEN NEW.action='declaration-save' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");expect(()=>save()).toThrow('audit unavailable');expect(repo.getDeclaration(id).isCurrent).toBe(false)})
 it('preserves current and stale declarations across local and re-encrypted portable backups',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'eva-signatures-'))
  try{
   save()
   const backup=await createVerifiedBackup(db,dir),local=join(dir,'local.sqlite'),portable=join(dir,'portable.sqlite')
   await stageRestore(backup,local,()=>true)
   stagePortableRestore(createPortableArchive(db,'Long-password-2026',b=>b.toString().slice(4)),'Long-password-2026',portable,s=>Buffer.from('new:'+s),b=>b.toString().slice(4))
   for(const path of [local,portable]){const restored=new Database(path);try{const copy=new CampRepository(restored,undefined,b=>b.toString().slice(4));expect(copy.getDeclaration(id)).toMatchObject({isCurrent:true,signature:strokes});expect(copy.registrationData(id).idNumber).toBe('PRIVATE-ID')}finally{restored.close()}}
   repo.replaceIdentity({bookingId:id,kind:'primary',idNumber:'CHANGED'})
   const stale=join(dir,'stale.sqlite');stagePortableRestore(createPortableArchive(db,'Long-password-2026',b=>b.toString().slice(4)),'Long-password-2026',stale,s=>Buffer.from('new:'+s),b=>b.toString().slice(4))
   const restored=new Database(stale);try{expect(new CampRepository(restored).getDeclaration(id).isCurrent).toBe(false)}finally{restored.close()}
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
})
