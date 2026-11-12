import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('protected companion stay lookup',()=>{
 let db:Database.Database,repo:CampRepository,unit:number
 const base=()=>({fullName:'Primary',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone' as const})
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',f),'utf8'));repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));unit=repo.createUnit({name:'A',type:'room',capacity:3,pricePiasters:0})})
 afterEach(()=>db.close())
 it('finds exact identities across stays without returning the number or ciphertext',()=>{
  const a=repo.createBooking({...base(),companions:[{fullName:'علي',idNumber:'P-123'}]})
  const b=repo.createBooking({...base(),fullName:'Other',arrival:'2026-11-03',departure:'2026-11-05',companions:[{fullName:'Ali',idNumber:'p-١٢٣'}]})
  const results=repo.findCompanionHistoryByIdentity('p-123');expect(results.map(x=>x.bookingId)).toEqual([b.id,a.id]);expect(JSON.stringify(results)).not.toContain('P-123');expect(JSON.stringify(results)).not.toContain('cipher:')
  expect(repo.findCompanionHistoryByIdentity('P-12')).toEqual([])
  const lookup=db.prepare('SELECT id_passport_lookup AS lookup FROM additional_guests ORDER BY id').all() as {lookup:string}[]
  expect(lookup[0].lookup).toMatch(/^[a-f0-9]{64}$/);expect(lookup[0].lookup).toBe(lookup[1].lookup)
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id FROM additional_guests WHERE deleted_at IS NULL AND id_passport_lookup=?').all(lookup[0].lookup);expect(JSON.stringify(plan)).toContain('companions_identity_lookup_idx')
 })
 it('keeps search accurate after identity edits, undo, removal, restoration and later additions',()=>{
  const a=repo.createBooking({...base(),companions:[{fullName:'First',idNumber:'P-1'}]});const companion=repo.getBooking(a.id)!.companions[0].id
  expect(repo.findCompanionHistoryByIdentity('p-1')).toHaveLength(1)
  const edit=repo.replaceIdentity({bookingId:a.id,kind:'companion',companionId:companion,idNumber:'P-2'})
  expect(repo.findCompanionHistoryByIdentity('p-1')).toEqual([]);expect(repo.findCompanionHistoryByIdentity('p-2')).toHaveLength(1)
  repo.undoIdentity(edit);expect(repo.findCompanionHistoryByIdentity('p-1')).toHaveLength(1)
  repo.removeCompanion(a.id,companion);expect(repo.findCompanionHistoryByIdentity('p-1')).toEqual([])
  repo.restoreCompanion(a.id,companion);expect(repo.findCompanionHistoryByIdentity('p-1')).toHaveLength(1)
  repo.addCompanion({bookingId:a.id,fullName:'Another',idNumber:'P-3'});expect(repo.findCompanionHistoryByIdentity('p-3')).toHaveLength(1)
 })
 it('excludes deleted bookings while retaining checked-out history',()=>{
  const a=repo.createBooking({...base(),companions:[{fullName:'Guest',idNumber:'P-1'}]});repo.changeStatus(a.id,'checked-in');repo.changeStatus(a.id,'checked-out')
  expect(repo.findCompanionHistoryByIdentity('P-1')).toHaveLength(1);db.prepare('UPDATE bookings SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(a.id);expect(repo.findCompanionHistoryByIdentity('P-1')).toEqual([])
 })
 it('rolls back companion indexing if an existing encrypted record cannot be opened',()=>{
  const a=repo.createBooking({...base(),companions:[{fullName:'First',idNumber:'P-1'}]});repo.findGuestsByIdentity('init')
  db.prepare('INSERT INTO additional_guests(booking_id,full_name,id_passport_ciphertext) VALUES (?,?,?)').run(a.id,'Broken',Buffer.from('bad'))
  const broken=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>{if(b.toString()==='bad')throw new Error('decrypt failed');return b.toString().slice(7)})
  expect(()=>broken.findCompanionHistoryByIdentity('P-1')).toThrow('decrypt failed')
  expect(db.prepare("SELECT key FROM settings WHERE key='security:companion-identity-index-v1'").get()).toBeUndefined()
  expect(db.prepare('SELECT count(*) AS n FROM additional_guests WHERE id_passport_lookup IS NOT NULL').get()).toEqual({n:0})
 })

 it('paginates every matching stay without omissions or repeats, including equal dates and bookings',()=>{
  for(let i=0;i<45;i++){const companions=[{fullName:`Companion ${i}`,idNumber:'REPEAT'},...(i===0?[{fullName:'Second on same booking',idNumber:'REPEAT',allowDuplicateIdentity:true}]:[])];const booking=repo.createBooking({...base(),fullName:`Guest ${i}`,companions});repo.changeStatus(booking.id,'cancelled')}
  const all:number[]=[];let cursor:undefined|{arrival:string;bookingId:number;companionId:number}
  for(let i=0;i<4;i++){const page=repo.findCompanionHistoryPage({identity:'repeat',cursor});all.push(...page.rows.map(x=>x.companionId));if(!page.nextCursor)break;cursor=page.nextCursor}
  expect(all).toHaveLength(46);expect(new Set(all).size).toBe(46);expect(all).toEqual([...all].sort((a,b)=>b-a))
 })
 it('validates pagination cursors and provides a cursor only when another page exists',()=>{
  repo.createBooking({...base(),companions:[{fullName:'One',idNumber:'ID-1'}]})
  const page=repo.findCompanionHistoryPage({identity:'ID-1'});expect(page.rows).toHaveLength(1);expect(page.nextCursor).toBeNull()
  expect(()=>repo.findCompanionHistoryPage({identity:'ID-1',cursor:{arrival:'2026-02-30',bookingId:1,companionId:1}})).toThrow()
  expect(()=>repo.findCompanionHistoryPage({identity:'ID-1',cursor:{arrival:'2026-11-01',bookingId:0,companionId:1}})).toThrow()
 })

})
