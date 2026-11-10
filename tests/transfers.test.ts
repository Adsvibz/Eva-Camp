import {describe,it,expect,beforeEach,afterEach} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'
const sql=(name:string)=>readFileSync(join(process.cwd(),'db/migrations',name),'utf8')
describe('checked-in unit transfers',()=>{
 let db:Database.Database,repo:CampRepository,a:number,b:number,booking:number
 beforeEach(()=>{db=new Database(':memory:');db.exec(sql('0001_initial.sql'));db.exec(sql('0002_unit_segments.sql'));repo=new CampRepository(db);a=repo.createUnit({name:'A',type:'room',capacity:3,pricePiasters:0});b=repo.createUnit({name:'B',type:'room',capacity:3,pricePiasters:0});booking=repo.createBooking({fullName:'Guest',phone:'',unitId:a,arrival:'2026-11-01',departure:'2026-11-06',adults:2,children:0,totalPiasters:100000,source:'phone'}).id;repo.changeStatus(booking,'checked-in')})
 afterEach(()=>db.close())
 it('preserves room history and prevents conflicts only for the relevant room intervals',()=>{
  repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'});const calendar=repo.calendar('2026-11-01','2026-11-07');expect(calendar).toMatchObject([{id:booking,unitId:a,arrival:'2026-11-01',departure:'2026-11-03'},{id:booking,unitId:b,arrival:'2026-11-03',departure:'2026-11-06'}]);expect(repo.getBooking(booking)?.unitName).toBe('B')
  expect(()=>repo.createBooking({fullName:'Conflict',phone:'',unitId:b,arrival:'2026-11-04',departure:'2026-11-05',adults:1,children:0,totalPiasters:0,source:'phone'})).toThrow('overlaps')
  expect(()=>repo.createBooking({fullName:'Old room',phone:'',unitId:a,arrival:'2026-11-03',departure:'2026-11-05',adults:1,children:0,totalPiasters:0,source:'phone'})).not.toThrow();expect(repo.getBooking(booking)?.totalPiasters).toBe(100000)
 })
 it('rejects a conflicting transfer and rolls back the previous room segment',()=>{
  repo.createBooking({fullName:'Other',phone:'',unitId:b,arrival:'2026-11-04',departure:'2026-11-07',adults:1,children:0,totalPiasters:0,source:'phone'});expect(()=>repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'})).toThrow('overlaps');expect(repo.calendar('2026-11-01','2026-11-07')).toContainEqual(expect.objectContaining({id:booking,unitId:a,arrival:'2026-11-01',departure:'2026-11-06'}));expect(repo.getBooking(booking)?.unitName).toBe('A')
 })
 it('supports subsequent transfers and an extension without rewriting earlier segments',()=>{
  const c=repo.createUnit({name:'C',type:'room',capacity:3,pricePiasters:0});repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'});repo.transferUnit({bookingId:booking,unitId:c,date:'2026-11-04'});repo.reschedule({bookingId:booking,unitId:c,arrival:'2026-11-01',departure:'2026-11-07'});expect(repo.calendar('2026-11-01','2026-11-08')).toMatchObject([{unitId:a,arrival:'2026-11-01',departure:'2026-11-03'},{unitId:b,arrival:'2026-11-03',departure:'2026-11-04'},{unitId:c,arrival:'2026-11-04',departure:'2026-11-07'}])
 })
 it('rejects transfer dates outside the current segment and units with insufficient capacity',()=>{
  const small=repo.createUnit({name:'S',type:'tent',capacity:1,pricePiasters:0});expect(()=>repo.transferUnit({bookingId:booking,unitId:b,date:'2026-10-31'})).toThrow();expect(()=>repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-06'})).toThrow();expect(()=>repo.transferUnit({bookingId:booking,unitId:small,date:'2026-11-03'})).toThrow('capacity')
 })
 it('records same-day room changes without creating an invalid zero-night segment',()=>{
  repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-01'});expect(repo.calendar('2026-11-01','2026-11-07')).toMatchObject([{id:booking,unitId:b,arrival:'2026-11-01',departure:'2026-11-06'}]);expect(db.prepare("SELECT count(*) AS n FROM audit_log WHERE action='transfer'").get()).toEqual({n:1})
 })

 it('rejects undo when the previous room is booked again and preserves history',()=>{
  repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'})
  repo.createBooking({fullName:'New guest',phone:'',unitId:a,arrival:'2026-11-03',departure:'2026-11-06',adults:1,children:0,totalPiasters:0,source:'phone'})
  const history=repo.unitHistory(booking)
  expect(()=>repo.transferUnit({bookingId:booking,unitId:a,date:'2026-11-03'})).toThrow('overlaps')
  expect(repo.unitHistory(booking)).toEqual(history)
  expect(repo.getBooking(booking)?.unitId).toBe(b)
  expect(db.prepare("SELECT count(*) AS n FROM audit_log WHERE action='transfer'").get()).toEqual({n:1})
 })
 it('rejects extension into an occupied room without changing any segment',()=>{
  repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'})
  repo.createBooking({fullName:'Next guest',phone:'',unitId:b,arrival:'2026-11-06',departure:'2026-11-08',adults:1,children:0,totalPiasters:0,source:'phone'})
  const history=repo.unitHistory(booking)
  expect(()=>repo.reschedule({bookingId:booking,unitId:b,arrival:'2026-11-01',departure:'2026-11-07'})).toThrow('overlaps')
  expect(repo.unitHistory(booking)).toEqual(history)
  expect(repo.getBooking(booking)?.departure).toBe('2026-11-06')
 })
 it('rejects transfers for unavailable units or bookings that are no longer checked in',()=>{
  db.prepare("UPDATE units SET housekeeping_status='maintenance' WHERE id=?").run(b)
  expect(()=>repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'})).toThrow('unavailable')
  db.prepare("UPDATE units SET housekeeping_status='available' WHERE id=?").run(b)
  repo.changeStatus(booking,'checked-out')
  expect(()=>repo.transferUnit({bookingId:booking,unitId:b,date:'2026-11-03'})).toThrow('checked in')
 })

})
it('returns ordered room history and supports a safe immediate undo',()=>{
 const db=new Database(':memory:');db.exec(sql('0001_initial.sql'));db.exec(sql('0002_unit_segments.sql'));const repo=new CampRepository(db);const a=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0}),b=repo.createUnit({name:'B',type:'room',capacity:2,pricePiasters:0});const id=repo.createBooking({fullName:'Guest',phone:'',unitId:a,arrival:'2026-11-01',departure:'2026-11-05',adults:1,children:0,totalPiasters:0,source:'phone'}).id;repo.changeStatus(id,'checked-in');repo.transferUnit({bookingId:id,unitId:b,date:'2026-11-03'});expect(repo.unitHistory(id)).toMatchObject([{unitId:a,start:'2026-11-01',end:'2026-11-03'},{unitId:b,start:'2026-11-03',end:'2026-11-05'}]);repo.transferUnit({bookingId:id,unitId:a,date:'2026-11-03'});expect(repo.getBooking(id)?.unitId).toBe(a);db.close()
})
