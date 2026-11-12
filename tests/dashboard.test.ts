import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('front desk overview',()=>{
 let db:Database.Database,repo:CampRepository
 const day='2026-11-11'
 beforeEach(()=>{db=new Database(':memory:');for(const file of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',file),'utf8'));repo=new CampRepository(db)})
 afterEach(()=>db.close())
 const unit=(name:string)=>repo.createUnit({name,type:'room',capacity:4,pricePiasters:0})
 const booking=(id:number,arrival:string,departure:string,name:string,totalPiasters=10000)=>repo.createBooking({fullName:name,phone:'',unitId:id,arrival,departure,adults:1,children:0,totalPiasters,source:'phone'})
 it('reports zero counts safely for an empty camp',()=>{
  expect(repo.dashboard(day)).toMatchObject({day,totalUnits:0,occupiedUnits:0,occupancyPercent:0,inHouseBookings:0,inHouseGuests:0,arrivalsCount:0,departuresCount:0,todayCollectionsPiasters:0,monthCollectionsPiasters:0,outstandingPiasters:0,unitStatuses:{available:0,reserved:0,occupied:0,cleaning:0,maintenance:0},arrivals:[],departures:[]})
 })
 it('uses dated unit segments, scheduled actions, net collections and current balances',()=>{
  const a=unit('A'),b=unit('B'),c=unit('C'),d=unit('D'),e=unit('E'),f=unit('F')
  const stay=repo.createBooking({fullName:'In house',phone:'',unitId:a,arrival:'2026-11-10',departure:'2026-11-12',adults:2,children:1,totalPiasters:10000,source:'phone'})
  repo.changeStatus(stay.id,'checked-in');repo.transferUnit({bookingId:stay.id,unitId:b,date:day})
  const arrival=booking(a,day,'2026-11-13','Arriving',20000),departure=booking(f,'2026-11-10',day,'Leaving',30000)
  db.prepare("UPDATE units SET housekeeping_status='cleaning' WHERE id=?").run(c);db.prepare("UPDATE units SET housekeeping_status='maintenance' WHERE id=?").run(d)
  repo.addPayment({bookingId:stay.id,amountPiasters:5000,method:'cash',date:day});repo.addPayment({bookingId:stay.id,amountPiasters:-2000,method:'cash',date:day});repo.addPayment({bookingId:arrival.id,amountPiasters:1000,method:'card',date:'2026-11-01'});repo.addPayment({bookingId:arrival.id,amountPiasters:500,method:'card',date:'2026-11-20'})
  const result=repo.dashboard(day)
  expect(result).toMatchObject({day,totalUnits:6,occupiedUnits:1,occupancyPercent:16.7,inHouseBookings:1,inHouseGuests:3,arrivalsCount:1,departuresCount:1,todayCollectionsPiasters:3000,monthCollectionsPiasters:4000,outstandingPiasters:55500,unitStatuses:{available:2,reserved:1,occupied:1,cleaning:1,maintenance:1}})
  expect(result.arrivals).toMatchObject([{id:arrival.id,fullName:'Arriving',unitName:'A'}]);expect(result.departures).toMatchObject([{id:departure.id,fullName:'Leaving',unitName:'F'}]);expect(e).toBeGreaterThan(0)
 })
 it('treats early check-ins and overdue check-outs as occupied',()=>{
  const a=unit('A'),b=unit('B')
  const early=booking(a,'2026-11-12','2026-11-14','Early'),overdue=booking(b,'2026-11-09',day,'Overdue')
  repo.changeStatus(early.id,'checked-in');repo.changeStatus(overdue.id,'checked-in')
  expect(repo.dashboard(day)).toMatchObject({inHouseBookings:2,inHouseGuests:2,occupiedUnits:2,occupancyPercent:100,unitStatuses:{occupied:2,available:0},departuresCount:1})
 })
 it('excludes cancelled bookings from amounts and action lists while retaining their payments',()=>{
  const a=unit('A'),b=booking(a,day,'2026-11-12','Cancelled')
  repo.addPayment({bookingId:b.id,amountPiasters:3000,method:'cash',date:day});repo.changeStatus(b.id,'cancelled')
  const result=repo.dashboard(day);expect(result).toMatchObject({arrivalsCount:0,outstandingPiasters:0,todayCollectionsPiasters:3000,unitStatuses:{available:1}})
 })
 it('counts bookings and outstanding balances beyond the most recent 500 rows',()=>{
  const a=unit('A'),first=booking(a,day,'2026-11-12','Old',12345)
  const guest=(db.prepare('SELECT guest_id FROM bookings WHERE id=?').get(first.id) as {guest_id:number}).guest_id
  const insert=db.prepare("INSERT INTO bookings(booking_reference,guest_id,unit_id,arrival_date,departure_date,adults_count,total_piasters,status,source) VALUES (?,?,?,'2027-01-01','2027-01-02',1,0,'cancelled','phone')")
  db.transaction(()=>{for(let i=0;i<501;i++)insert.run(`LATER-${i}`,guest,a)})()
  expect(repo.listBookings().some(row=>row.id===first.id)).toBe(false)
  expect(repo.dashboard(day)).toMatchObject({arrivalsCount:1,outstandingPiasters:12345})
 })
 it('limits action rows without truncating their counts',()=>{
  for(let i=0;i<15;i++)booking(unit(`unit-${i}`),day,'2026-11-12',`Guest ${i}`)
  const result=repo.dashboard(day);expect(result.arrivalsCount).toBe(15);expect(result.arrivals).toHaveLength(10)
 })
 it('validates dates instead of silently returning misleading totals',()=>{
  expect(()=>repo.dashboard('2026-02-30')).toThrow('Invalid date');expect(()=>repo.dashboard('today')).toThrow('Invalid date')
 })
})
