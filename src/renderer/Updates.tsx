import React,{useEffect,useState} from 'react'
import {ArrowDownToLine,RefreshCw} from 'lucide-react'
import type {UpdateState} from '../shared/updates'
const words={
 en:{title:'Software update',hint:'Updates are downloaded from Eva Camp on GitHub.',current:'Installed version',newVersion:'Available version',check:'Check for updates',download:'Download update',install:'Restart and install',cancel:'Cancel download',notes:'What’s new',idle:'Check for a newer version.',checking:'Checking for updates…',latest:'You’re up to date.',available:'A new version is available.',downloading:'Downloading update…',ready:'Ready to install. Your data will be backed up before restarting.',installing:'Preparing to restart…',unsupported:'Updates are available in the installed Windows version.',network:'Could not connect. You can keep working offline and try again later.',limit:'GitHub is busy. Please try again later.',release:'This release is not ready for installation yet.',integrity:'The download could not be verified. Please download it again.',storage:'Could not save the update. Check free disk space and try again.',backup:'The backup could not be completed. The update was not installed.',update:'Update available',loaded:'Update ready',failed:'Could not complete the update action. Please try again.'},
 ar:{title:'تحديث البرنامج',hint:'تُنزل التحديثات من مستودع إيفا كامب على GitHub.',current:'الإصدار المثبت',newVersion:'الإصدار المتاح',check:'البحث عن تحديث',download:'تنزيل التحديث',install:'إعادة التشغيل والتثبيت',cancel:'إلغاء التنزيل',notes:'الجديد في الإصدار',idle:'ابحث عن إصدار أحدث.',checking:'جارٍ البحث عن تحديث…',latest:'أنت تستخدم أحدث إصدار.',available:'يوجد إصدار جديد متاح.',downloading:'جارٍ تنزيل التحديث…',ready:'التحديث جاهز. سنحفظ نسخة احتياطية من بياناتك قبل إعادة التشغيل.',installing:'جارٍ التجهيز لإعادة التشغيل…',unsupported:'التحديث متاح في نسخة ويندوز المثبتة.',network:'تعذر الاتصال. يمكنك متابعة العمل دون إنترنت والمحاولة لاحقًا.',limit:'GitHub مشغول حاليًا. حاول لاحقًا.',release:'هذا الإصدار غير جاهز للتثبيت بعد.',integrity:'تعذر التحقق من سلامة الملف. نزّل التحديث مرة أخرى.',storage:'تعذر حفظ التحديث. راجع مساحة القرص وحاول مجددًا.',backup:'تعذر إكمال النسخة الاحتياطية. لم يُثبت التحديث.',update:'تحديث متاح',loaded:'التحديث جاهز',failed:'تعذر إكمال عملية التحديث. حاول مجددًا.'}
} as const
function useUpdateStatus(interval:number){
 const [state,setState]=useState<UpdateState|null>(null)
 useEffect(()=>{let active=true;const refresh=()=>window.eva.updateStatus().then(v=>{if(active)setState(v)}).catch(()=>{});void refresh();const timer=setInterval(refresh,interval);return()=>{active=false;clearInterval(timer)}},[interval])
 return {state,setState}
}
export function UpdateIndicator({lang,onOpen}:{lang:'en'|'ar';onOpen:()=>void}){
 const {state}=useUpdateStatus(5000),t=words[lang]
 if(!state||!['available','ready'].includes(state.phase))return null
 return <button type="button" className="utility-button update-indicator" onClick={onOpen}><ArrowDownToLine size={16}/><span>{state.phase==='ready'?t.loaded:t.update}<small dir="ltr">v{state.version}</small></span></button>
}
export function UpdateSettings({lang}:{lang:'en'|'ar'}){
 const {state,setState}=useUpdateStatus(1000),[pending,setPending]=useState(false),[error,setError]=useState(false),t=words[lang]
 const action=async(fn:()=>Promise<unknown>)=>{setPending(true);setError(false);try{await fn();setState(await window.eva.updateStatus())}catch{setError(true)}finally{setPending(false)}}
 const phase=state?.phase||'idle',busy=['checking','downloading','installing'].includes(phase)
 const message=phase==='up-to-date'?t.latest:phase==='error'?null:t[phase as 'idle'|'checking'|'available'|'downloading'|'ready'|'installing'|'unsupported']
 const failure=state?.error==='rate-limit'?t.limit:state?.error?t[state.error]:null
 return <div className="preference-group update-settings">
  <div className="preference-heading"><span className="preference-icon"><RefreshCw size={17}/></span><div><h3>{t.title}</h3><p>{t.hint}</p></div></div>
  <div className="update-versions"><span>{t.current}<b dir="ltr">{state?.currentVersion||'—'}</b></span>{state?.version&&<span>{t.newVersion}<b dir="ltr">{state.version}</b></span>}</div>
  <p className="update-status" role="status" aria-live="polite">{message}</p>
  {(failure||error)&&<p className="error" role="alert">{failure||t.failed}</p>}
  {phase==='downloading'&&<div className="update-progress"><progress max={100} value={state?.progress||0} aria-label={t.downloading}/><span>{state?.progress||0}%</span></div>}
  {state?.notes&&<details className="update-notes"><summary>{t.notes}</summary><p>{state.notes}</p></details>}
  <div className="actions update-actions">
   {phase!=='ready'&&<button type="button" className="language" disabled={!state||pending||busy||phase==='unsupported'} onClick={()=>void action(()=>window.eva.checkForUpdate())}>{t.check}</button>}
   {(phase==='available'||phase==='error'&&state?.version)&&<button type="button" className="primary" disabled={pending} onClick={()=>void action(()=>window.eva.downloadUpdate())}>{t.download}</button>}
   {phase==='downloading'&&<button type="button" className="language" onClick={()=>void window.eva.cancelUpdate().catch(()=>setError(true))}>{t.cancel}</button>}
   {phase==='ready'&&<button type="button" className="primary" disabled={pending} onClick={()=>void action(()=>window.eva.installUpdate())}>{t.install}</button>}
  </div>
 </div>
}
