import {describe,it,expect,beforeEach,afterEach} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('planned unit availability',()=>{
 let db:Database.Database,repo:CampRepository,a:number,b:number,small:number,id:number
 const request={arrival:'2026-11-02',departure:'2026-11-03',adults:2,children:0}
 beforeEach(()=>{db=new Database(':memory:');for(const file of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',file),'utf8'));repo=new CampRepository(db);a=repo.createUnit({name:'A',type:'room',capacity:3,pricePiasters:0});b=repo.createUnit({name:'B',type:'room',capacity:3,pricePiasters:0});small=repo.createUnit({name:'Small',type:'tent',capacity:1,pricePiasters:0});id=repo.createBooking({fullName:'Guest',phone:'',unitId:a,arrival:'2026-11-01',departure:'2026-11-05',adults:2,children:0,totalPiasters:0,source:'phone'}).id})
 afterEach(()=>db.close())
 it('classifies overlap, capacity and turnover boundaries without changing records',()=>{const before=db.prepare('SELECT total_changes() AS n').get();expect(repo.unitAvailability(request)).toEqual([{unitId:a,state:'booked'},{unitId:b,state:'available'},{unitId:small,state:'capacity'}]);expect(repo.unitAvailability({...request,arrival:'2026-11-05',departure:'2026-11-06'})[0].state).toBe('available');expect(db.prepare('SELECT total_changes() AS n').get()).toEqual(before)})
 it('uses individual transfer segments and ignores cancelled stays',()=>{repo.changeStatus(id,'checked-in');repo.transferUnit({bookingId:id,unitId:b,date:'2026-11-03'});expect(repo.unitAvailability({...request,arrival:'2026-11-03',departure:'2026-11-04'}).slice(0,2)).toEqual([{unitId:a,state:'available'},{unitId:b,state:'booked'}]);repo.changeStatus(id,'checked-out');expect(repo.unitAvailability(request)[0].state).toBe('available')})
 it('shows housekeeping restrictions and excludes deleted units',()=>{db.prepare("UPDATE units SET housekeeping_status='cleaning' WHERE id=?").run(b);db.prepare("UPDATE units SET deleted_at='2026-11-01' WHERE id=?").run(small);expect(repo.unitAvailability(request)).toEqual([{unitId:a,state:'booked'},{unitId:b,state:'cleaning'}]);repo.changeStatus(id,'cancelled');expect(repo.unitAvailability(request)[0].state).toBe('available')})
 it('rejects invalid dates and counts',()=>{for(const invalid of [{...request,departure:request.arrival},{...request,arrival:'2026-02-30'},{...request,adults:0},{...request,children:-1}])expect(()=>repo.unitAvailability(invalid)).toThrow()})
})
