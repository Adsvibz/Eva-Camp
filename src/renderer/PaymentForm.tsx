import React,{useRef,useState} from 'react'
import type {BookingDetail,PaymentInput} from '../shared/contracts'
import {egpInputSchema,formatEgp} from '../shared/money-input'
const copy={
 en:{guest:'Guest',unit:'Unit',balance:'Current balance',paid:'Net paid',credit:'Credit owed to guest',type:'Transaction',payment:'Payment',refund:'Refund',amount:'Amount (EGP)',date:'Date',selectedDate:'Selected date',dateFormat:'DD/MM/YYYY',method:'Method',cash:'Cash',card:'Card',transfer:'Transfer',note:'Note (optional)',noteHint:'The note appears on the receipt.',save:'Save and open receipt',saving:'Saving…',cancel:'Cancel',back:'Back to booking',invalid:'Enter an amount greater than zero with up to two decimal places.',refundLimit:'The refund cannot exceed the net amount paid.',closed:'This day is closed. Reopen it in Daily closing before recording this transaction.',unavailable:'This booking is unavailable for this transaction.',large:'The running paid amount would be too large.',failed:'Could not save the transaction. Check the details and try again.',over:'This exceeds the outstanding balance and will create a credit for the guest.',signature:'A payment changes the registration form. Any current declaration must be reviewed again.',cancelled:'Cancelled bookings accept refunds only.'},
 ar:{guest:'العميل',unit:'الوحدة',balance:'المتبقي الحالي',paid:'صافي المدفوع',credit:'رصيد لصالح العميل',type:'نوع العملية',payment:'دفعة',refund:'استرداد',amount:'المبلغ (ج.م)',date:'التاريخ',selectedDate:'التاريخ المختار',dateFormat:'يوم/شهر/سنة',method:'طريقة الدفع',cash:'نقدي',card:'بطاقة',transfer:'تحويل',note:'ملاحظة (اختياري)',noteHint:'الملاحظة بتظهر على الإيصال.',save:'حفظ وفتح الإيصال',saving:'جارٍ الحفظ…',cancel:'إلغاء',back:'العودة للحجز',invalid:'أدخل مبلغًا أكبر من صفر، بحد أقصى رقمين بعد الفاصلة.',refundLimit:'لا يمكن استرداد أكثر من صافي المبلغ المدفوع.',closed:'اليوم ده مغلق. أعد فتحه من إغلاق اليوم قبل تسجيل العملية.',unavailable:'الحجز غير متاح لهذه العملية.',large:'إجمالي المدفوع أكبر من الحد المسموح.',failed:'تعذر حفظ العملية. راجع البيانات وحاول مرة أخرى.',over:'المبلغ أكبر من المتبقي، وسيظهر الفرق رصيدًا لصالح العميل.',signature:'الدفعة بتغيّر بيانات الاستمارة، وأي إقرار حالي يحتاج مراجعة من جديد.',cancelled:'الحجز الملغي يقبل الاسترداد فقط.'}
} as const
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function PaymentForm({detail,lang,fromDetails,onCancel,onBusy,onDirty,onSaved}:{detail:BookingDetail;lang:'en'|'ar';fromDetails:boolean;onCancel:()=>void;onBusy:(busy:boolean)=>void;onDirty:(dirty:boolean)=>void;onSaved:(receiptId:number)=>void}){
 const t=copy[lang],busyRef=useRef(false),cancelled=detail.status==='cancelled'
 const [kind,setKind]=useState<'payment'|'refund'>(cancelled?'refund':'payment'),[amount,setAmount]=useState(''),[day,setDay]=useState(today),[method,setMethod]=useState<PaymentInput['method']>('cash'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<keyof typeof copy.en|null>(null)
 const parsed=egpInputSchema.safeParse(amount),over=kind==='payment'&&parsed.success&&parsed.data>Math.max(0,detail.balancePiasters)
 function changed(){onDirty(true);setError(null)}
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busyRef.current)return
  if(!parsed.success||parsed.data===0){setError('invalid');return}
  if(kind==='refund'&&parsed.data>detail.paidPiasters){setError('refundLimit');return}
  busyRef.current=true;setBusy(true);onBusy(true);setError(null)
  let committed=false
  try{
   const receipt=await window.eva.addPayment({bookingId:detail.id,amountPiasters:kind==='refund'?-parsed.data:parsed.data,method,date:day,note})
   committed=true;onDirty(false);onSaved(receipt)
  }catch(reason){const msg=String(reason);setError(msg.includes('Day is closed')?'closed':msg.includes('Refund exceeds')?'refundLimit':msg.includes('PAYMENT_AMOUNT_TOO_LARGE')?'large':msg.includes('Booking unavailable')?'unavailable':'failed')}
  finally{if(!committed){busyRef.current=false;setBusy(false);onBusy(false)}}
 }
 return <form className="payment-form" onSubmit={submit}>
  <div className="payment-context"><div><span>{t.guest}</span><strong dir="auto">{detail.fullName}</strong><small dir="ltr">{detail.reference} · {detail.unitName}</small></div><div className="payment-balance"><span>{detail.balancePiasters<0?t.credit:t.balance}</span><strong dir="ltr">{formatEgp(Math.abs(detail.balancePiasters),lang)}</strong><small>{t.paid}: <b dir="ltr">{formatEgp(detail.paidPiasters,lang)}</b></small></div></div>
  {cancelled&&<p className="calendar-hint">{t.cancelled}</p>}
  <div className="fields"><label><span>{t.type}</span><select aria-label={t.type} name="transactionType" value={kind} disabled={busy} onChange={e=>{setKind(e.target.value as 'payment'|'refund');changed()}}>{!cancelled&&<option value="payment">{t.payment}</option>}<option value="refund">{t.refund}</option></select></label><label><span>{t.amount}</span><input aria-label={t.amount} name="amount" autoFocus inputMode="decimal" type="text" maxLength={32} required value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);changed()}}/></label><label className="payment-date"><span>{t.date}</span><input aria-label={t.date} name="date" type="date" lang="en-GB" required value={day} disabled={busy} onChange={e=>{setDay(e.target.value);changed()}}/>{day&&<small>{t.selectedDate}: <b dir="ltr">{day.split('-').reverse().join('/')}</b> ({t.dateFormat})</small>}</label><label><span>{t.method}</span><select aria-label={t.method} name="method" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as PaymentInput['method']);changed()}}><option value="cash">{t.cash}</option><option value="card">{t.card}</option><option value="transfer">{t.transfer}</option></select></label><label className="payment-note"><span>{t.note}</span><input aria-label={t.note} name="note" maxLength={500} value={note} disabled={busy} onChange={e=>{setNote(e.target.value);changed()}}/><small>{t.noteHint}</small></label></div>
  {over&&<p className="payment-hint" role="status">{t.over}</p>}<p className="calendar-hint">{t.signature}</p>
  {error&&<p role="alert" className="error">{t[error]}</p>}
  <div className="form-actions"><button type="button" className="language" disabled={busy} onClick={onCancel}>{fromDetails?t.back:t.cancel}</button><button className="primary" type="submit" disabled={busy}>{busy?t.saving:t.save}</button></div>
 </form>
}
