import React,{useEffect,useState} from 'react'
import type {BookingDetail} from '../shared/contracts'
import {egpInputSchema,piastersToInput} from '../shared/money-input'

const copy={
 en:{label:'Accommodation discount (EGP)',hint:'Enter a fixed amount, up to the accommodation price. Enter 0 to remove the discount.',save:'Save discount',undo:'Undo discount change',saved:'Discount saved.',undone:'Discount change undone.',invalid:'Enter a valid amount with no more than two decimal places.',limit:'The discount cannot exceed the accommodation amount.',changed:'The discount has changed. Reopen the booking to review the latest amount.',failed:'Could not save the discount. Reopen the booking and try again.',refresh:'The discount was saved, but the screen could not refresh. Reopen this booking.',credit:'The guest has a credit balance. Record any actual refund separately.'},
 ar:{label:'خصم الإقامة (ج.م)',hint:'أدخل مبلغًا ثابتًا لا يتجاوز قيمة الإقامة. أدخل صفرًا لإلغاء الخصم.',save:'حفظ الخصم',undo:'التراجع عن تعديل الخصم',saved:'تم حفظ الخصم.',undone:'تم التراجع عن تعديل الخصم.',invalid:'أدخل مبلغًا صحيحًا بحد أقصى رقمين بعد الفاصلة العشرية.',limit:'الخصم لا يمكن أن يتجاوز قيمة الإقامة.',changed:'تم تغيير الخصم. أعد فتح الحجز لمراجعة المبلغ الحالي.',failed:'تعذر حفظ الخصم. أعد فتح الحجز وحاول مرة أخرى.',refresh:'تم حفظ الخصم، لكن تعذر تحديث الشاشة. أعد فتح الحجز.',credit:'يوجد رصيد لصالح العميل. سجّل أي مبلغ ترده فعليًا كاسترداد منفصل.'}
} as const

export function Discount({detail,lang,onChanged}:{detail:BookingDetail;lang:'en'|'ar';onChanged:()=>Promise<void>}) {
 const t=copy[lang]
 const [value,setValue]=useState(piastersToInput(detail.discountPiasters))
 const [busy,setBusy]=useState(false),[stale,setStale]=useState(false)
 const [error,setError]=useState<keyof typeof copy.en|null>(null)
 const [notice,setNotice]=useState<'saved'|'undone'|null>(null)
 const [undo,setUndo]=useState<{before:number;after:number}|null>(null)
 useEffect(()=>{setValue(piastersToInput(detail.discountPiasters))},[detail.discountPiasters])
 const editable=detail.status==='reserved'||detail.status==='checked-in'
 async function save(amount:number,expected:number,undoing=false) {
  if(busy||stale)return
  setBusy(true);setError(null);setNotice(null)
  try {await window.eva.setDiscount({bookingId:detail.id,discountPiasters:amount,expectedDiscountPiasters:expected})}
  catch(reason){const message=String(reason);setError(message.includes('DISCOUNT_TOO_LARGE')?'limit':message.includes('DISCOUNT_CHANGED')?'changed':'failed');if(message.includes('DISCOUNT_CHANGED'))setStale(true);setBusy(false);return}
  setUndo(undoing||amount===expected?null:{before:expected,after:amount})
  setValue(piastersToInput(amount))
  try{await onChanged();setNotice(undoing?'undone':'saved')}
  catch{setError('refresh');setStale(true)}
  finally{setBusy(false)}
 }
 function submit(event:React.FormEvent){
  event.preventDefault();setNotice(null)
  const parsed=egpInputSchema.safeParse(value)
  if(!parsed.success){setError('invalid');return}
  if(parsed.data>detail.totalPiasters){setError('limit');return}
  void save(parsed.data,detail.discountPiasters)
 }
 return <div className="discount-editor">
  {detail.balancePiasters<0&&<p className="calendar-hint">{t.credit}</p>}
  {editable&&<form onSubmit={submit}>
   <div className="fields"><label><span>{t.label}</span><input aria-label={t.label} aria-describedby="discount-hint" aria-invalid={error==='invalid'||error==='limit'} type="text" inputMode="decimal" maxLength={32} value={value} disabled={busy||stale} onChange={e=>{setValue(e.target.value);setError(null);setNotice(null)}} required/></label></div>
   <p id="discount-hint" className="calendar-hint">{t.hint}</p>
   <div className="form-actions"><button className="language" type="submit" disabled={busy||stale}>{t.save}</button>{undo&&undo.after===detail.discountPiasters&&<button className="text-button" type="button" disabled={busy||stale} onClick={()=>void save(undo.before,undo.after,true)}>{t.undo}</button>}</div>
  </form>}
  {error&&<p role="alert" className="error">{t[error]}</p>}
  {notice&&<p role="status" className="calendar-hint">{t[notice]}</p>}
 </div>
}
