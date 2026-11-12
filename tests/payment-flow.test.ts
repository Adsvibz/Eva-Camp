import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'
import {receiptHtml} from '../src/main/print'
describe('payment ledger',()=>{
 let db:Database.Database,repo:CampRepository,id:number
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',f),'utf8'));repo=new CampRepository(db);const unitId=repo.createUnit({name:'A',type:'room',capacity:2,pricePiasters:0});id=repo.createBooking({fullName:'Guest',phone:'',unitId,arrival:'2026-11-10',departure:'2026-11-12',adults:1,children:0,totalPiasters:100000,source:'phone'}).id})
 afterEach(()=>db.close())
 it('records payment notes and returns them in the correct booking history and receipt',()=>{
  const paymentId=repo.addPayment({bookingId:id,amountPiasters:25025,method:'card',date:'2026-11-10',note:' Deposit <script> '})
  const refundId=repo.addPayment({bookingId:id,amountPiasters:-5000,method:'cash',date:'2026-11-11',note:'Partial refund'})
  expect(repo.listPayments({bookingId:id,offset:0})).toMatchObject({hasMore:false,rows:[{id:refundId,amountPiasters:-5000,note:'Partial refund'},{id:paymentId,amountPiasters:25025,note:'Deposit <script>',method:'card'}]})
  const receipt=repo.receiptData(paymentId);expect(receipt.note).toBe('Deposit <script>');const html=receiptHtml(receipt);expect(html).toContain('Deposit &lt;script&gt;');expect(html).not.toContain('<script>')
  expect(receiptHtml(repo.receiptData(refundId))).toContain('REFUND RECEIPT');expect(repo.getBooking(id)).toMatchObject({paidPiasters:20025,balancePiasters:79975})
 })
 it('rejects amounts that would make the running balance unsafe without recording a payment or consuming a receipt number',()=>{
  repo.addPayment({bookingId:id,amountPiasters:Number.MAX_SAFE_INTEGER,method:'cash',date:'2026-11-10'})
  expect(()=>repo.addPayment({bookingId:id,amountPiasters:1,method:'cash',date:'2026-11-10'})).toThrow('PAYMENT_AMOUNT_TOO_LARGE')
  expect(db.prepare('SELECT count(*) AS n FROM payments').get()).toEqual({n:1})
  repo.addPayment({bookingId:id,amountPiasters:-1,method:'cash',date:'2026-11-10'})
  expect(repo.listPayments({bookingId:id,offset:0}).rows[0].receiptNo).toBe('R-2026-0002')
 })
 it('validates notes and paginates only the selected booking',()=>{
  expect(()=>repo.addPayment({bookingId:id,amountPiasters:1,method:'cash',date:'2026-11-10',note:'x'.repeat(501)})).toThrow()
  for(let i=0;i<55;i++)repo.addPayment({bookingId:id,amountPiasters:1,method:'cash',date:'2026-11-10'})
  const first=repo.listPayments({bookingId:id,offset:0}),second=repo.listPayments({bookingId:id,offset:50});expect(first.rows).toHaveLength(50);expect(first.hasMore).toBe(true);expect(second.rows).toHaveLength(5);expect(second.hasMore).toBe(false)
  expect(()=>repo.listPayments({bookingId:999,offset:0})).toThrow();expect(()=>repo.listPayments({bookingId:id,offset:-1})).toThrow()
 })
 it('records an overpayment as guest credit and supports a separate refund',()=>{
  repo.addPayment({bookingId:id,amountPiasters:125000,method:'cash',date:'2026-11-10'})
  expect(repo.getBooking(id)).toMatchObject({paidPiasters:125000,balancePiasters:-25000})
  repo.addPayment({bookingId:id,amountPiasters:-25000,method:'cash',date:'2026-11-11'})
  expect(repo.getBooking(id)).toMatchObject({paidPiasters:100000,balancePiasters:0})
 })
 it('rejects payment on a closed day and excessive refunds without changing history',()=>{
  repo.addPayment({bookingId:id,amountPiasters:100,method:'cash',date:'2026-11-10'})
  expect(()=>repo.addPayment({bookingId:id,amountPiasters:-101,method:'cash',date:'2026-11-11'})).toThrow('Refund exceeds')
  repo.closeDay('2026-11-10');expect(()=>repo.addPayment({bookingId:id,amountPiasters:1,method:'cash',date:'2026-11-10'})).toThrow('closed')
  expect(repo.listPayments({bookingId:id,offset:0}).rows).toHaveLength(1)
 })
})
