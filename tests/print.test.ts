import { describe, expect, it } from 'vitest'
import { registrationHtml, type RegistrationData } from '../src/main/print'
const item:RegistrationData={reference:'EVA-2026-0001',fullName:'محمد <script>alert(1)</script>',nationality:'Egyptian',dateOfBirth:'1990-01-20',phone:'0100',email:'',idNumber:'A123',country:'Egypt',address:'Cairo',unitName:'1',unitType:'room',arrival:'2026-12-01',departure:'2026-12-03',adults:1,children:0,totalPiasters:100000,paidPiasters:30000,balancePiasters:70000,companions:[{fullName:'علي',idNumber:'B123'}]}
describe('registration print template',()=>{
 it('escapes guest values and preserves bilingual form sections',()=>{
  const html=registrationHtml(item)
  expect(html).toContain('PRIMARY GUEST DETAILS'); expect(html).toContain('بيانات العميل'); expect(html).toContain('العملاء المرافقون');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>alert(1)</script>');expect(html).toContain('700.00');expect(html).toContain('01/12/2026')
 })
 it('provides blank manual fields and at least three companion lines',()=>{
  const html=registrationHtml(null)
  expect(html).toContain('GUEST REGISTRATION FORM');expect(html).toContain('استمارة تسجيل عميل');expect((html.match(/class="companion-line"/g)||[]).length).toBe(3)
 })
 it('includes all companions beyond three as a continuation',()=>{
  const html=registrationHtml({...item,companions:Array.from({length:5},(_,i)=>({fullName:`Guest ${i}`,idNumber:''}))})
  expect((html.match(/class="companion-line"/g)||[]).length).toBe(5);expect(html).toContain('Guest 4');expect(html).toContain('page-break-before:always')
 })
})
it('renders a bilingual receipt with an escaped guest name and payment amount',async()=>{
 const {receiptHtml}=await import('../src/main/print')
 const html=receiptHtml({receiptNo:'R-2026-0001',guestName:'<script>x</script>',reference:'EVA-2026-0001',amountPiasters:25000,method:'cash',date:'2026-11-10'})
 expect(html).toContain('PAYMENT RECEIPT');expect(html).toContain('إيصال دفع');expect(html).toContain('250.00');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>x</script>')
})
it('renders the daily closing report with refunds and net collections',async()=>{
 const {closingHtml}=await import('../src/main/print');const html=closingHtml({date:'2026-11-10',cash:25000,card:40000,transfer:0,gross:70000,refunds:5000,net:65000,count:3,closed:true})
 expect(html).toContain('DAILY CLOSING REPORT');expect(html).toContain('تقرير إغلاق اليوم');expect(html).toContain('650.00');expect(html).toContain('50.00')
})
