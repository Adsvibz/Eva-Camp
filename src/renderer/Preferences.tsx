import React from 'react'
import {Languages,Monitor,Moon,Sun} from 'lucide-react'
import type {UiPreferences} from '../shared/contracts'

const copy={
 en:{intro:'Make the workspace comfortable for your shift.',appearance:'Appearance',appearanceHint:'Choose a theme or follow your Windows setting.',light:'Light',dark:'Dark',system:'System',language:'Language',languageHint:'Choose the language used throughout the workspace.',english:'English',arabic:'العربية',saved:'Your choices are saved on this computer.',busy:'Saving…',saveError:'Could not save your preferences. Please try again.',loadError:'Could not load your preferences.',retry:'Try again'},
 ar:{intro:'اضبط مساحة العمل لتناسبك أثناء الاستقبال.',appearance:'المظهر',appearanceHint:'اختر المظهر المناسب أو اتبع إعدادات ويندوز.',light:'فاتح',dark:'داكن',system:'حسب الجهاز',language:'اللغة',languageHint:'اختر لغة واجهة البرنامج.',english:'English',arabic:'العربية',saved:'تُحفظ اختياراتك على هذا الجهاز.',busy:'جارٍ الحفظ…',saveError:'تعذر حفظ الإعدادات. حاول مرة أخرى.',loadError:'تعذر تحميل الإعدادات.',retry:'إعادة المحاولة'}
} as const
export function Preferences({value,busy,disabled,error,onRetry,onChange}:{value:UiPreferences;busy:boolean;disabled:boolean;error:'load'|'save'|null;onRetry:()=>void;onChange:(patch:Partial<UiPreferences>)=>void}){
 const t=copy[value.language]
 return <section className="preferences"><p className="preferences-intro">{t.intro}</p>
  <div className="preference-group"><div className="preference-heading"><span className="preference-icon"><Sun size={17}/></span><div><h3>{t.appearance}</h3><p>{t.appearanceHint}</p></div></div><div className="preference-choices" role="group" aria-label={t.appearance}>
   {([['light',Sun,t.light],['dark',Moon,t.dark],['system',Monitor,t.system]] as const).map(([key,Icon,label])=><button key={key} type="button" className="preference-choice" aria-pressed={value.theme===key} disabled={disabled} onClick={()=>onChange({theme:key})}><Icon size={17}/><span>{label}</span></button>)}
  </div></div>
  <div className="preference-group"><div className="preference-heading"><span className="preference-icon"><Languages size={17}/></span><div><h3>{t.language}</h3><p>{t.languageHint}</p></div></div><div className="preference-choices preference-languages" role="group" aria-label={t.language}>
   {([['en',t.english],['ar',t.arabic]] as const).map(([key,label])=><button key={key} type="button" className="preference-choice" aria-pressed={value.language===key} disabled={disabled} onClick={()=>onChange({language:key})}>{label}</button>)}
  </div></div>
  {error?<div className="error" role="alert">{error==='load'?t.loadError:t.saveError}{error==='load'&&<button type="button" className="language" disabled={busy} onClick={onRetry}>{t.retry}</button>}</div>:<p className="preferences-saved" role="status">{busy?t.busy:t.saved}</p>}
 </section>
}
