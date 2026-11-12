import React,{useEffect,useRef,useState} from 'react'
import type {PrimaryHistoryCursor,PrimaryStay} from '../shared/contracts'
const copy={
 en:{title:'Find primary guest stays by ID',id:'Primary guest ID / passport number',hint:'Enter the complete number. Matching numbers may belong to different people; check the names.',search:'Search primary guest stays',empty:'No matching primary guest stays.',failed:'Could not search primary guest stays. Check that encrypted data is accessible.',more:'Load older guest stays',loading:'Searching…',moreLoading:'Loading…',moreFailed:'Could not load older stays. Try again.'},
 ar:{title:'البحث عن إقامات العميل برقم الهوية',id:'رقم هوية / جواز سفر العميل الأساسي',hint:'أدخل الرقم كاملًا. قد يتطابق الرقم لأشخاص مختلفين؛ راجع الأسماء.',search:'بحث عن إقامات العميل',empty:'لا توجد إقامات مطابقة للعميل.',failed:'تعذر البحث عن إقامات العميل. تأكد من إمكانية فتح البيانات المشفرة.',more:'عرض إقامات العميل الأقدم',loading:'جارٍ البحث…',moreLoading:'جارٍ التحميل…',moreFailed:'تعذر تحميل الإقامات الأقدم. حاول مرة أخرى.'}
} as const
export function PrimaryStaySearch({lang,onSelect,statusText}:{lang:'en'|'ar';onSelect:(id:number)=>void;statusText:(status:string)=>string}){
 const t=copy[lang],[identity,setIdentity]=useState(''),[stays,setStays]=useState<PrimaryStay[]>([]),[status,setStatus]=useState<'idle'|'loading'|'done'|'failed'>('idle'),[cursor,setCursor]=useState<PrimaryHistoryCursor|null>(null),[moreBusy,setMoreBusy]=useState(false),[moreFailed,setMoreFailed]=useState(false)
 const requestBusy=useRef(false),requestVersion=useRef(0)
 useEffect(()=>()=>{requestVersion.current++},[])
 async function search(append=false){
  if(!identity.trim()||requestBusy.current||(append&&!cursor))return
  requestBusy.current=true;const version=++requestVersion.current
  if(append){setMoreBusy(true);setMoreFailed(false)}else{setStatus('loading');setStays([]);setCursor(null);setMoreFailed(false)}
  try{const page=await window.eva.findPrimaryHistoryPage({identity,...(append&&cursor?{cursor}:{})});if(version!==requestVersion.current)return;setStays(previous=>{if(!append)return page.rows;const seen=new Set(previous.map(item=>item.bookingId));return [...previous,...page.rows.filter(row=>!seen.has(row.bookingId))]});setCursor(page.nextCursor);setStatus('done')}
  catch{if(version===requestVersion.current){if(append)setMoreFailed(true);else setStatus('failed')}}
  finally{requestBusy.current=false;if(version===requestVersion.current)setMoreBusy(false)}
 }
 return <details className="companion-search primary-stay-search"><summary>{t.title}</summary><label><span>{t.id}</span><input aria-label={t.id} maxLength={100} value={identity} disabled={status==='loading'||moreBusy} autoComplete="off" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search()}}} onChange={e=>{requestVersion.current++;setIdentity(e.target.value);setStays([]);setCursor(null);setMoreFailed(false);setStatus('idle')}}/></label><p className="search-hint">{t.hint}</p><button type="button" className="language" disabled={!identity.trim()||status==='loading'||moreBusy} onClick={()=>void search()}>{status==='loading'?t.loading:t.search}</button>{status==='failed'&&<p role="alert" className="error">{t.failed}</p>}{status==='done'&&stays.length===0&&<p role="status" className="search-hint">{t.empty}</p>}<div className="search-results">{stays.map(stay=><button key={stay.bookingId} type="button" onClick={()=>onSelect(stay.bookingId)}><span><b dir="auto">{stay.fullName}</b><small>{stay.reference} · {stay.unitName}</small></span><span><span dir="ltr">{stay.arrival.split('-').reverse().join('/')} – {stay.departure.split('-').reverse().join('/')}</span><small>{statusText(stay.status)}</small></span></button>)}</div>{moreFailed&&<p role="alert" className="error">{t.moreFailed}</p>}{cursor&&<button type="button" className="language" disabled={moreBusy} onClick={()=>void search(true)}>{moreBusy?t.moreLoading:t.more}</button>}</details>
}
