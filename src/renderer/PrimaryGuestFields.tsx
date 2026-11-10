import React, {useEffect, useState} from 'react'
import type {GuestProfile} from '../shared/contracts'

const copy = {
 en: {lookup:'Find a returning guest',hint:'Search by the beginning of a name or a complete phone number.',empty:'No matching guests.',limit:'Showing up to 20 matches. Refine your search.',use:'Use this guest',newGuest:'Enter a new guest',selected:'Saved guest selected. These details and the saved ID will be reused.',name:'Full name',phone:'Phone / WhatsApp',nationality:'Nationality',email:'Email',dateOfBirth:'Date of birth',country:'Country',address:'Home address',notes:'Notes',id:'ID / passport number',duplicates:'This phone number is already on file. Select the returning guest, or confirm that this is a different person sharing the number.',shared:'This is a different person sharing this phone number.',error:'Guest lookup could not be completed. Try again before saving.',loading:'Searching…'},
 ar: {lookup:'البحث عن عميل سابق',hint:'ابحث ببداية الاسم أو رقم الهاتف كاملاً.',empty:'لا يوجد عملاء مطابقون.',limit:'تظهر حتى ٢٠ نتيجة. اكتب تفاصيل أكثر.',use:'استخدام بيانات العميل',newGuest:'إدخال عميل جديد',selected:'تم اختيار عميل سابق. سيُستخدم ملفه ورقم هويته المحفوظ دون تغيير.',name:'الاسم الكامل',phone:'الهاتف / واتساب',nationality:'الجنسية',email:'البريد الإلكتروني',dateOfBirth:'تاريخ الميلاد',country:'البلد',address:'عنوان الإقامة',notes:'ملاحظات',id:'رقم الهوية / جواز السفر',duplicates:'رقم الهاتف مسجل من قبل. اختر العميل السابق، أو أكد أن هذا شخص مختلف يستخدم الرقم نفسه.',shared:'هذا شخص مختلف يستخدم رقم الهاتف نفسه.',error:'تعذر البحث عن العميل. حاول مرة أخرى قبل الحفظ.',loading:'جارٍ البحث…'}
} as const

export function PrimaryGuestFields({lang}:{lang:'en'|'ar'}) {
 const t=copy[lang]
 const [query,setQuery]=useState(''),[results,setResults]=useState<GuestProfile[]>([]),[selected,setSelected]=useState<GuestProfile|null>(null),[phone,setPhone]=useState(''),[duplicates,setDuplicates]=useState<GuestProfile[]>([]),[shared,setShared]=useState(false),[searchError,setSearchError]=useState(false),[phoneError,setPhoneError]=useState(false),[loading,setLoading]=useState(false)
 useEffect(()=>{
  let active=true
  setResults([]);setSearchError(false);setLoading(!!query.trim())
  if(!query.trim())return
  const timer=setTimeout(()=>{window.eva.findGuests(query).then(rows=>{if(active){setResults(rows);setLoading(false)}}).catch(()=>{if(active){setSearchError(true);setLoading(false)}})},180)
  return()=>{active=false;clearTimeout(timer)}
 },[query])
 useEffect(()=>{
  let active=true;setDuplicates([]);setShared(false);setPhoneError(false)
  if(selected||!phone.trim())return
  const timer=setTimeout(()=>{window.eva.duplicateGuests(phone).then(rows=>{if(active)setDuplicates(rows)}).catch(()=>{if(active)setPhoneError(true)})},180)
  return()=>{active=false;clearTimeout(timer)}
 },[phone,selected])
 function choose(guest:GuestProfile){setSelected(guest);setPhone(guest.phone);setQuery('');setResults([]);setDuplicates([]);setShared(false)}
 const matches=(rows:GuestProfile[])=> <div className="search-results">{rows.map(guest=><button type="button" key={guest.id} onClick={()=>choose(guest)}><span><b>{guest.fullName}</b><small dir="ltr">{guest.phone}</small><small>{guest.nationality}</small></span><span>{t.use}</span></button>)}</div>
 const field=(label:string,name:string,value:string|null|undefined,type='text',required=false)=> <label key={name}><span>{label}</span><input name={name} type={type} defaultValue={value??''} required={required} readOnly={!!selected}/></label>
 return <section className="primary-guest-fields">
  {selected?<div className="selected-guest"><strong>{selected.fullName}</strong><p>{t.selected}</p><button className="language" type="button" onClick={()=>{setSelected(null);setPhone('')}}>{t.newGuest}</button></div>:<div className="guest-lookup"><label><span>{t.lookup}</span><input value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} autoComplete="off"/></label><p className="calendar-hint">{t.hint}</p>{loading&&<p role="status">{t.loading}</p>}{query.trim()&&!loading&&!searchError&&results.length===0&&<p>{t.empty}</p>}{matches(results)}{results.length===20&&<p>{t.limit}</p>}</div>}
  <input type="hidden" name="guestId" value={selected?.id??''}/>
  <div className="fields" key={selected?.id??'new'}>
   {field(t.name,'name',selected?.fullName,'text',true)}
   <label><span>{t.phone}</span><input name="phone" value={phone} maxLength={50} readOnly={!!selected} onChange={event=>{setPhone(event.target.value);setShared(false)}}/></label>
   {field(t.nationality,'nationality',selected?.nationality)}{field(t.email,'email',selected?.email,'email')}{field(t.dateOfBirth,'dateOfBirth',selected?.dateOfBirth,'date')}{field(t.country,'country',selected?.country)}{field(t.address,'address',selected?.address)}{field(t.notes,'notes',selected?.notes)}
   {!selected&&field(t.id,'idNumber','','text')}
  </div>
  {!selected&&duplicates.length>0&&<div className="duplicate-guests"><p role="status">{t.duplicates}</p>{matches(duplicates)}<label className="shared-phone"><input type="checkbox" name="allowSharedPhone" checked={shared} onChange={event=>setShared(event.target.checked)}/><span>{t.shared}</span></label></div>}
  {(searchError||phoneError)&&<p role="alert" className="error">{t.error}</p>}
 </section>
}
