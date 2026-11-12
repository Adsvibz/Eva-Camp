import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('booking discounts',()=>{
 let db:Database.Database,repo:CampRepository,id:number
 beforeEach(()=>{
  db=new Database(':memory:')
  for(const file of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',file),'utf8'))
  repo=new CampRepository(db)
  const unitId=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0})
  id=repo.createBooking({fullName:'Test guest',phone:'',unitId,arrival:'2026-11-10',departure:'2026-11-12',adults:1,children:0,totalPiasters:100000,source:'phone'}).id
 })
 afterEach(()=>db.close())
 const audit=(db:Database.Database)=>db.prepare("SELECT detail_json FROM audit_log WHERE action='discount-update' ORDER BY id").all() as {detail_json:string}[]
 it('updates every current total without changing payments or closed cash collections',()=>{
  repo.addExtra({bookingId:id,description:'Meal',quantity:2,unitPricePiasters:5000})
  repo.addPayment({bookingId:id,amountPiasters:30000,method:'cash',date:'2026-11-10'})
  const closing=repo.closeDay('2026-11-10')
  repo.setDiscount({bookingId:id,discountPiasters:15025,expectedDiscountPiasters:0})
  expect(repo.getBooking(id)).toMatchObject({discountPiasters:15025,totalDuePiasters:94975,paidPiasters:30000,balancePiasters:64975})
  expect(repo.registrationData(id)).toMatchObject({totalPiasters:94975,balancePiasters:64975})
  expect(repo.invoiceData(id)).toMatchObject({discountPiasters:15025,totalPiasters:94975,balancePiasters:64975})
  expect(repo.managementReport('2026-11-10','2026-11-10')).toMatchObject({bookingValuePiasters:94975,outstandingPiasters:64975})
  expect(repo.dashboard('2026-11-10').outstandingPiasters).toBe(64975)
  expect(repo.dailyReport('2026-11-10')).toEqual(closing)
  expect(JSON.parse(audit(db)[0].detail_json)).toEqual({beforePiasters:0,afterPiasters:15025})
 })
 it('undoes a discount and refuses a stale undo after another edit',()=>{
  repo.setDiscount({bookingId:id,discountPiasters:10000,expectedDiscountPiasters:0})
  repo.setDiscount({bookingId:id,discountPiasters:0,expectedDiscountPiasters:10000})
  expect(repo.getBooking(id)?.balancePiasters).toBe(100000)
  repo.setDiscount({bookingId:id,discountPiasters:20000,expectedDiscountPiasters:0})
  expect(()=>repo.setDiscount({bookingId:id,discountPiasters:0,expectedDiscountPiasters:10000})).toThrow('DISCOUNT_CHANGED')
  expect(repo.getBooking(id)?.discountPiasters).toBe(20000)
  expect(audit(db)).toHaveLength(3)
 })
 it('rejects invalid amounts, missing bookings and discounts larger than accommodation',()=>{
  for(const amount of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,100001])expect(()=>repo.setDiscount({bookingId:id,discountPiasters:amount,expectedDiscountPiasters:0})).toThrow()
  expect(()=>repo.setDiscount({bookingId:999,discountPiasters:0,expectedDiscountPiasters:0})).toThrow('Booking unavailable')
  expect(repo.getBooking(id)?.discountPiasters).toBe(0)
  expect(audit(db)).toHaveLength(0)
 })
 it.each(['cancelled','checked-out'] as const)('refuses changes to %s bookings',status=>{
  if(status==='checked-out')repo.changeStatus(id,'checked-in')
  repo.changeStatus(id,status)
  expect(()=>repo.setDiscount({bookingId:id,discountPiasters:100,expectedDiscountPiasters:0})).toThrow('Booking unavailable')
  expect(audit(db)).toHaveLength(0)
 })
 it('shows overpayment as credit without generating a refund',()=>{
  repo.addPayment({bookingId:id,amountPiasters:100000,method:'cash',date:'2026-11-10'})
  repo.setDiscount({bookingId:id,discountPiasters:100000,expectedDiscountPiasters:0})
  expect(repo.getBooking(id)).toMatchObject({totalDuePiasters:0,paidPiasters:100000,balancePiasters:-100000})
  expect(repo.invoiceData(id).payments).toHaveLength(1)
 })
 it('rolls back the amount if its audit write fails',()=>{
  db.exec("CREATE TRIGGER fail_discount_audit BEFORE INSERT ON audit_log WHEN NEW.action='discount-update' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END")
  expect(()=>repo.setDiscount({bookingId:id,discountPiasters:10000,expectedDiscountPiasters:0})).toThrow('audit unavailable')
  expect(repo.getBooking(id)?.discountPiasters).toBe(0)
 })
 it('refuses an undo that would overflow after services were added',()=>{
  db.prepare('UPDATE bookings SET total_piasters=? WHERE id=?').run(Number.MAX_SAFE_INTEGER,id)
  repo.setDiscount({bookingId:id,discountPiasters:10000,expectedDiscountPiasters:0})
  repo.addExtra({bookingId:id,description:'Meal',quantity:1,unitPricePiasters:5000})
  expect(()=>repo.setDiscount({bookingId:id,discountPiasters:0,expectedDiscountPiasters:10000})).toThrow('EXTRA_AMOUNT_TOO_LARGE')
  expect(repo.getBooking(id)?.discountPiasters).toBe(10000)
 })
 it('does not record a change for an unchanged value',()=>{
  repo.setDiscount({bookingId:id,discountPiasters:0,expectedDiscountPiasters:0})
  expect(audit(db)).toHaveLength(0)
 })
})
