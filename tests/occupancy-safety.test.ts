import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('physical occupancy safety',()=>{
 let db:Database.Database,repo:CampRepository,a:number,b:number
 const day='2026-11-11'
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',f),'utf8'));repo=new CampRepository(db,undefined,undefined,()=>day);a=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});b=repo.createUnit({name:'B',type:'room',capacity:2,pricePiasters:0})})
 afterEach(()=>db.close())
 const booking=(unitId:number,arrival:string,departure:string)=>repo.createBooking({fullName:'Test guest',phone:'',unitId,arrival,departure,adults:1,children:0,totalPiasters:0,source:'phone'}).id
 it('does not check in the next guest while the previous guest is overdue',()=>{
  const overdue=booking(a,'2026-11-09',day),next=booking(a,day,'2026-11-13');repo.changeStatus(overdue,'checked-in');const audits=repo.countAudit()
  expect(()=>repo.changeStatus(next,'checked-in')).toThrow('UNIT_OCCUPIED');expect(repo.getBooking(next)?.status).toBe('reserved');expect(repo.countAudit()).toBe(audits)
  repo.changeStatus(overdue,'checked-out');expect(()=>repo.changeStatus(next,'checked-in')).not.toThrow()
 })
 it('does not allow an early check-in into a room still occupied today',()=>{
  const current=booking(a,'2026-11-10','2026-11-12'),early=booking(a,'2026-11-12','2026-11-14');repo.changeStatus(current,'checked-in');expect(()=>repo.changeStatus(early,'checked-in')).toThrow('UNIT_OCCUPIED')
 })
 it('uses dated room segments rather than the latest scheduled transfer',()=>{
  const stay=booking(a,'2026-11-10','2026-11-15');repo.changeStatus(stay,'checked-in');repo.transferUnit({bookingId:stay,unitId:b,date:'2026-11-13'})
  const early=booking(a,'2026-11-13','2026-11-15');expect(()=>repo.changeStatus(early,'checked-in')).toThrow('UNIT_OCCUPIED')
  const bStay=booking(b,'2026-11-10','2026-11-13');expect(()=>repo.changeStatus(bStay,'checked-in')).not.toThrow()
 })
 it('does not transfer into a unit occupied by an overdue guest',()=>{
  const old=booking(b,'2026-11-09',day),moving=booking(a,'2026-11-10','2026-11-13');repo.changeStatus(old,'checked-in');repo.changeStatus(moving,'checked-in');const history=repo.unitHistory(moving)
  expect(()=>repo.transferUnit({bookingId:moving,unitId:b,date:day})).toThrow('UNIT_OCCUPIED');expect(repo.unitHistory(moving)).toEqual(history)
 })
 it('does not check a guest into a unit marked for maintenance or cleaning',()=>{
  const stay=booking(a,day,'2026-11-13');db.prepare("UPDATE units SET housekeeping_status='cleaning' WHERE id=?").run(a);expect(()=>repo.changeStatus(stay,'checked-in')).toThrow('UNIT_UNAVAILABLE');expect(repo.getBooking(stay)?.status).toBe('reserved')
 })
})
