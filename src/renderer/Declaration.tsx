import React,{useEffect,useRef,useState} from 'react'
import type {BookingDetail} from '../shared/contracts'
import {confirmation,signaturePaths,type DeclarationRecord,type Signature} from '../shared/declaration'
import {SignaturePad} from './SignaturePad'
const copy={en:{title:'Declaration and signature',received:'Received by',date:'Signing date',confirm:'The guest has reviewed and confirmed the registration details.',save:'Save declaration',edit:'Review and replace declaration',cancel:'Cancel editing',undo:'Undo declaration change',saved:'Declaration saved.',undone:'Declaration change undone.',stale:'Registration details changed. Review them with the guest and record a new declaration. The previous signature will not be printed.',pending:'No declaration recorded yet.',current:'Declaration recorded for the current registration details.',signature:'Saved guest signature',blank:'Signature left blank for signing on paper.',failed:'Could not update the declaration. Reopen this booking and try again.',changed:'Registration details changed while this form was open. Reopen the booking and review them before signing.',future:'The signing date cannot be in the future.',refresh:'The change was saved, but the screen could not refresh. Reopen this booking.',loading:'Loading declaration…'},ar:{title:'الإقرار والتوقيع',received:'موظف الاستقبال',date:'تاريخ التوقيع',confirm:'راجع العميل بيانات استمارة التسجيل وأقر بصحتها.',save:'حفظ الإقرار',edit:'مراجعة الإقرار واستبداله',cancel:'إلغاء التعديل',undo:'التراجع عن تعديل الإقرار',saved:'تم حفظ الإقرار.',undone:'تم التراجع عن تعديل الإقرار.',stale:'تغيّرت بيانات الاستمارة. راجعها مع العميل وسجّل إقرارًا جديدًا. لن يُطبع التوقيع السابق.',pending:'لم يُسجّل إقرار بعد.',current:'تم تسجيل الإقرار لبيانات الاستمارة الحالية.',signature:'توقيع العميل المحفوظ',blank:'تُرك التوقيع فارغًا للتوقيع على الورق.',failed:'تعذر تعديل الإقرار. أعد فتح الحجز وحاول مرة أخرى.',changed:'تغيّرت بيانات الاستمارة أثناء فتح النموذج. أعد فتح الحجز وراجعها قبل التوقيع.',future:'لا يمكن أن يكون تاريخ التوقيع في المستقبل.',refresh:'تم حفظ التغيير، لكن تعذر تحديث الشاشة. أعد فتح الحجز.',loading:'جارٍ تحميل الإقرار…'}} as const
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function Declaration({detail,lang}:{detail:BookingDetail;lang:'en'|'ar'}){
 const t=copy[lang],[record,setRecord]=useState<DeclarationRecord|null>(null),recordRef=useRef<DeclarationRecord|null>(null)
 const [received,setReceived]=useState(''),[signedDate,setSignedDate]=useState(today),[signature,setSignature]=useState<Signature>([]),[confirmed,setConfirmed]=useState(false),[editing,setEditing]=useState(false)
 const [busy,setBusy]=useState(false),[drawing,setDrawing]=useState(false),[blocked,setBlocked]=useState(false),[undo,setUndo]=useState<number|null>(null)
 const [error,setError]=useState<'failed'|'changed'|'future'|'refresh'|null>(null),[notice,setNotice]=useState<'saved'|'undone'|null>(null)
 const editable=detail.status==='reserved'||detail.status==='checked-in'
 function install(next:DeclarationRecord){
  if(recordRef.current?.revision===next.revision)return
  recordRef.current=next;setRecord(next);setNotice(null);if(!next.isCurrent)setUndo(null);setReceived(next.receivedBy);setSignedDate(next.isCurrent?next.signedDate:today());setSignature([]);setConfirmed(false);setEditing(!next.isCurrent);setDrawing(false)
 }
 useEffect(()=>{let active=true;window.eva.getDeclaration(detail.id).then(next=>{if(active)install(next)}).catch(()=>{if(active){setError('failed');setBlocked(true)}});return()=>{active=false}},[detail])
 async function update(undoing=false){
  if(!record||busy||drawing||blocked)return
  setBusy(true);setError(null);setNotice(null)
  try{
   if(undoing&&undo!==null){await window.eva.undoDeclaration({bookingId:detail.id,changeId:undo});setUndo(null)}
   else{const change=await window.eva.saveDeclaration({bookingId:detail.id,expectedRevision:record.revision,receivedBy:received,signedDate,confirmed:true,signature:signature.length?signature:null});setUndo(change)}
  }catch(reason){const message=String(reason);const code=message.includes('DECLARATION_CHANGED')?'changed':message.includes('DECLARATION_FUTURE_DATE')?'future':'failed';setError(code);if(code==='changed')setBlocked(true);setBusy(false);return}
  try{install(await window.eva.getDeclaration(detail.id));setNotice(undoing?'undone':'saved')}
  catch{setError('refresh');setBlocked(true)}finally{setBusy(false)}
 }
 return <section className="guest-records declaration-editor"><h3>{t.title}</h3>{!record?<p>{t.loading}</p>:<>
  <p className="calendar-hint">{record.isCurrent?t.current:record.hasPrevious?t.stale:t.pending}</p>
  <blockquote>{confirmation[lang]}</blockquote>
  {!editing&&<><div className="declaration-summary"><span>{t.received}: <strong dir="auto">{record.receivedBy}</strong></span><span>{t.date}: <b>{record.signedDate.split('-').reverse().join('/')}</b></span></div>{record.signature?<svg className="signature-preview" viewBox="0 0 600 180" role="img" aria-label={t.signature}>{signaturePaths(record.signature).map((d,i)=><path key={i} d={d} fill="none" stroke="#171b19" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>:<p className="calendar-hint">{t.blank}</p>}</>}
  {editable&&(editing?<form onSubmit={e=>{e.preventDefault();if(confirmed)void update()}}><div className="fields"><label><span>{t.received}</span><input aria-label={t.received} value={received} onChange={e=>setReceived(e.target.value)} maxLength={100} required disabled={busy||blocked}/></label><label><span>{t.date}</span><input aria-label={t.date} type="date" max={today()} value={signedDate} onChange={e=>setSignedDate(e.target.value)} required disabled={busy||blocked}/></label></div><SignaturePad key={record.revision} value={signature} onChange={setSignature} lang={lang} disabled={busy||blocked} onDrawing={setDrawing}/><label className="declaration-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy||blocked} required/><span>{t.confirm}</span></label><div className="form-actions"><button className="primary" type="submit" disabled={busy||blocked||drawing||!confirmed}>{t.save}</button>{record.isCurrent&&<button type="button" className="language" disabled={busy||drawing} onClick={()=>{setEditing(false);setSignature([]);setConfirmed(false)}}>{t.cancel}</button>}</div></form>:<button type="button" className="language" disabled={busy||blocked} onClick={()=>{setSignature([]);setConfirmed(false);setSignedDate(today());setEditing(true);setNotice(null)}}>{t.edit}</button>)}
  {editable&&undo!==null&&<button type="button" className="text-button guest-undo" disabled={busy||blocked||drawing} onClick={()=>void update(true)}>{t.undo}</button>}
 </>}{error&&<p role="alert" className="error">{t[error]}</p>}{notice&&<p role="status" className="calendar-hint">{t[notice]}</p>}</section>
}
