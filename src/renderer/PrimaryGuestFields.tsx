import React, {useEffect, useRef, useState} from 'react'
import type {GuestProfile} from '../shared/contracts'

const copy = {
 en: {lookup:'Find a returning guest',idLookup:'Find by ID / passport',idSearch:'Search ID',idHint:'Enter the complete ID or passport number.',idEmpty:'No matching identity found.',idFailure:'Identity lookup failed. Check that encrypted data is accessible.',idDuplicate:'This ID or passport number already belongs to a saved guest. Select that guest or confirm this is a different person.',idConfirm:'This is a different person with the same ID or passport number.',idChecking:'Checking ID…',hint:'Search by the beginning of a name or a complete phone number.',empty:'No matching guests.',limit:'Showing up to 20 matches. Refine your search.',use:'Use this guest',newGuest:'Enter a new guest',selected:'Saved guest selected. These details and the saved ID will be reused.',name:'Full name',phone:'Phone / WhatsApp',nationality:'Nationality',email:'Email',dateOfBirth:'Date of birth',country:'Country',address:'Home address',notes:'Notes',id:'ID / passport number',duplicates:'This phone number is already on file. Select the returning guest, or confirm that this is a different person sharing the number.',shared:'This is a different person sharing this phone number.',error:'Guest lookup could not be completed. Try again before saving.',loading:'Searching…'},
 ar: {lookup:'البحث عن عميل سابق',idLookup:'البحث برقم الهوية / جواز السفر',idSearch:'بحث بالهوية',idHint:'أدخل رقم الهوية أو جواز السفر كاملًا.',idEmpty:'لم يتم العثور على رقم مطابق.',idFailure:'تعذر البحث بالهوية. تأكد من إمكانية فتح البيانات المشفرة.',idDuplicate:'رقم الهوية أو جواز السفر مسجل لعميل آخر. اختر العميل المسجل أو أكد أنه شخص مختلف.',idConfirm:'هذا شخص مختلف يستخدم رقم الهوية أو جواز السفر نفسه.',idChecking:'جارٍ التحقق من الهوية…',hint:'ابحث ببداية الاسم أو رقم الهاتف كاملاً.',empty:'لا يوجد عملاء مطابقون.',limit:'تظهر حتى ٢٠ نتيجة. اكتب تفاصيل أكثر.',use:'استخدام بيانات العميل',newGuest:'إدخال عميل جديد',selected:'تم اختيار عميل سابق. سيُستخدم ملفه ورقم هويته المحفوظ دون تغيير.',name:'الاسم الكامل',phone:'الهاتف / واتساب',nationality:'الجنسية',email:'البريد الإلكتروني',dateOfBirth:'تاريخ الميلاد',country:'البلد',address:'عنوان الإقامة',notes:'ملاحظات',id:'رقم الهوية / جواز السفر',duplicates:'رقم الهاتف مسجل من قبل. اختر العميل السابق، أو أكد أن هذا شخص مختلف يستخدم الرقم نفسه.',shared:'هذا شخص مختلف يستخدم رقم الهاتف نفسه.',error:'تعذر البحث عن العميل. حاول مرة أخرى قبل الحفظ.',loading:'جارٍ البحث…'}
} as const

export function PrimaryGuestFields({lang}:{lang:'en'|'ar'}) {
 const t=copy[lang],identityCheck=useRef(0)
 const [query,setQuery]=useState(''),[results,setResults]=useState<GuestProfile[]>([]),[selected,setSelected]=useState<GuestProfile|null>(null),[phone,setPhone]=useState(''),[duplicates,setDuplicates]=useState<GuestProfile[]>([]),[shared,setShared]=useState(false),[searchError,setSearchError]=useState(false),[phoneError,setPhoneError]=useState(false),[loading,setLoading]=useState(false),[identity,setIdentity]=useState(''),[idResults,setIdResults]=useState<GuestProfile[]>([]),[idState,setIdState]=useState<'idle'|'loading'|'done'|'failed'>('idle'),[entryId,setEntryId]=useState(''),[entryMatches,setEntryMatches]=useState<GuestProfile[]>([]),[entryStatus,setEntryStatus]=useState<'idle'|'loading'|'failed'>('idle'),[identityConfirmed,setIdentityConfirmed]=useState(false)
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
 async function checkEntryIdentity(value:string){const sequence=++identityCheck.current;setEntryMatches([]);setIdentityConfirmed(false);if(!value.trim()){setEntryStatus('idle');return}setEntryStatus('loading');try{const rows=await window.eva.findGuestsByIdentity(value);if(identityCheck.current===sequence){setEntryMatches(rows);setEntryStatus('idle')}}catch{if(identityCheck.current===sequence)setEntryStatus('failed')}}
 async function searchIdentity(){if(!identity.trim()||idState==='loading')return;setIdState('loading');setIdResults([]);try{setIdResults(await window.eva.findGuestsByIdentity(identity));setIdState('done')}catch{setIdState('failed')}}
 function choose(guest:GuestProfile){identityCheck.current++;setEntryId('');setEntryMatches([]);setEntryStatus('idle');setIdentityConfirmed(false);setIdentity('');setIdResults([]);setIdState('idle');setSelected(guest);setPhone(guest.phone);setQuery('');setResults([]);setDuplicates([]);setShared(false)}
 const matches=(rows:GuestProfile[])=> <div className="search-results">{rows.map(guest=><button type="button" key={guest.id} onClick={()=>choose(guest)}><span><b>{guest.fullName}</b><small dir="ltr">{guest.phone}</small><small>{guest.nationality}</small></span><span>{t.use}</span></button>)}</div>
 const field=(label:string,name:string,value:string|null|undefined,type='text',required=false)=> <label key={name}><span>{label}</span><input name={name} type={type} defaultValue={value??''} required={required} readOnly={!!selected}/></label>
 return <section className="primary-guest-fields">
  {selected?<div className="selected-guest"><strong>{selected.fullName}</strong><p>{t.selected}</p><button className="language" type="button" onClick={()=>{setSelected(null);setPhone('')}}>{t.newGuest}</button></div>:<div className="guest-lookup"><label><span>{t.lookup}</span><input value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} autoComplete="off"/></label><p className="calendar-hint">{t.hint}</p>{loading&&<p role="status">{t.loading}</p>}{query.trim()&&!loading&&!searchError&&results.length===0&&<p>{t.empty}</p>}{matches(results)}{results.length===20&&<p>{t.limit}</p>}<div className="identity-lookup"><label><span>{t.idLookup}</span><input type="text" value={identity} maxLength={100} disabled={idState==='loading'} autoComplete="off" onChange={event=>{setIdentity(event.target.value);setIdState('idle');setIdResults([])}}/></label><p className="calendar-hint">{t.idHint}</p><button className="language" type="button" disabled={!identity.trim()||idState==='loading'} onClick={()=>void searchIdentity()}>{idState==='loading'?t.loading:t.idSearch}</button>{idState==='done'&&idResults.length===0&&<p role="status">{t.idEmpty}</p>}{idState==='failed'&&<p role="alert" className="error">{t.idFailure}</p>}{matches(idResults)}{idResults.length===20&&<p>{t.limit}</p>}</div></div>}
  <input type="hidden" name="guestId" value={selected?.id??''}/>
  <div className="fields" key={selected?.id??'new'}>
   {field(t.name,'name',selected?.fullName,'text',true)}
   <label><span>{t.phone}</span><input name="phone" value={phone} maxLength={50} readOnly={!!selected} onChange={event=>{setPhone(event.target.value);setShared(false)}}/></label>
   {field(t.nationality,'nationality',selected?.nationality)}{field(t.email,'email',selected?.email,'email')}{field(t.dateOfBirth,'dateOfBirth',selected?.dateOfBirth,'date')}{field(t.country,'country',selected?.country)}{field(t.address,'address',selected?.address)}{field(t.notes,'notes',selected?.notes)}
   {!selected&&<label><span>{t.id}</span><input name="idNumber" type="text" maxLength={100} value={entryId} autoComplete="off" onChange={event=>{identityCheck.current++;setEntryId(event.target.value);setEntryMatches([]);setEntryStatus('idle');setIdentityConfirmed(false)}} onBlur={event=>void checkEntryIdentity(event.target.value)}/></label>}
  </div>
  {!selected&&entryStatus==='loading'&&<p role="status" className="calendar-hint">{t.idChecking}</p>}
  {!selected&&entryStatus==='failed'&&<p role="alert" className="error">{t.idFailure}</p>}
  {!selected&&entryMatches.length>0&&<div className="duplicate-guests"><p role="status">{t.idDuplicate}</p>{matches(entryMatches)}<label className="shared-phone"><input type="checkbox" name="allowDuplicateIdentity" checked={identityConfirmed} onChange={event=>setIdentityConfirmed(event.target.checked)}/><span>{t.idConfirm}</span></label></div>}
  {!selected&&duplicates.length>0&&<div className="duplicate-guests"><p role="status">{t.duplicates}</p>{matches(duplicates)}<label className="shared-phone"><input type="checkbox" name="allowSharedPhone" checked={shared} onChange={event=>setShared(event.target.checked)}/><span>{t.shared}</span></label></div>}
  {(searchError||phoneError)&&<p role="alert" className="error">{t.error}</p>}
 </section>
}
