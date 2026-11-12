import {displayDate} from '../shared/date-display'
import {useEffect,useState} from 'react'
import {unitAvailabilitySchema,type UnitAvailability,type UnitRow} from '../shared/contracts'

const copy={
 en:{room:'Unit',choose:'Choose a unit',arrival:'Arrival date',departure:'Departure date',adults:'Adults',children:'Children',booked:'Booked for these dates',capacity:'Capacity too small',cleaning:'Cleaning',maintenance:'Maintenance',checking:'Checking availability…',chooseDates:'Enter the stay dates and guest count to check availability.',ready:'Available for the selected dates.',selectedUnavailable:'The selected unit is unavailable for these dates or guest count. Choose another unit.',failed:'Could not check availability. Try again.',retry:'Retry',dateSelected:'Selected date',dateFormat:'DD/MM/YYYY',invalidDates:'Departure must be after arrival.',note:'Based on scheduled stays. Check-in also requires the unit to be vacant.'},
 ar:{room:'الوحدة',choose:'اختر وحدة',arrival:'تاريخ الوصول',departure:'تاريخ المغادرة',adults:'البالغون',children:'الأطفال',booked:'محجوزة في هذه التواريخ',capacity:'السعة غير كافية',cleaning:'تنظيف',maintenance:'صيانة',checking:'جارٍ التحقق من التوافر…',chooseDates:'أدخل تواريخ الإقامة وعدد الضيوف للتحقق من التوافر.',ready:'متاحة للتواريخ المختارة.',selectedUnavailable:'الوحدة المختارة غير متاحة لهذه التواريخ أو لعدد الضيوف. اختر وحدة أخرى.',failed:'تعذر التحقق من التوافر. حاول مرة أخرى.',retry:'إعادة المحاولة',dateSelected:'التاريخ المختار',dateFormat:'يوم/شهر/سنة',invalidDates:'لازم تاريخ المغادرة يكون بعد تاريخ الوصول.',note:'التوافر حسب الحجوزات المجدولة. يشترط خلو الوحدة عند تسجيل الوصول.'}
} as const
export function BookingDetailsFields({units,lang,onReadyChange}:{units:UnitRow[];lang:'en'|'ar';onReadyChange:(ready:boolean)=>void}){
 const t=copy[lang], [unit,setUnit]=useState(''),[arrival,setArrival]=useState(''),[departure,setDeparture]=useState(''),[adults,setAdults]=useState('1'),[children,setChildren]=useState('0'),[availability,setAvailability]=useState<UnitAvailability[]|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[notice,setNotice]=useState(false),[retry,setRetry]=useState(0)
 const invalidate=()=>{onReadyChange(false);setAvailability(null);setFailed(false);setNotice(false)}
 useEffect(()=>{
  let active=true
  const parsed=unitAvailabilitySchema.safeParse({arrival,departure,adults:Number(adults),children:Number(children)})
  if(!adults||!children||!parsed.success){setLoading(false);return ()=>{active=false}}
  setLoading(true);setFailed(false)
  window.eva.unitAvailability(parsed.data).then(result=>{if(!active)return;setAvailability(result);setLoading(false)}).catch(()=>{if(active){setLoading(false);setFailed(true)}})
  return ()=>{active=false}
 },[arrival,departure,adults,children,retry])
 useEffect(()=>{
  const selected=availability?.find(x=>String(x.unitId)===unit)
  if(unit&&availability&&(!selected||selected.state!=='available')){setUnit('');setNotice(true);onReadyChange(false);return}
  onReadyChange(Boolean(unit&&selected?.state==='available'&&!loading&&!failed))
 },[unit,availability,loading,failed,onReadyChange])
 return <>
  <label><span>{t.room}</span><select name="unit" required value={unit} onChange={e=>{onReadyChange(false);setNotice(false);setUnit(e.target.value)}}><option value="" disabled>{t.choose}</option>{units.map(u=>{const state=availability?.find(x=>x.unitId===u.id)?.state??u.housekeepingStatus;return <option key={u.id} value={u.id} disabled={state!=='available'}>{u.name}{state!=='available'?` · ${t[state]}`:''}</option>})}</select></label>
  <label><span>{t.arrival}</span><input name="arrival" type="date" required value={arrival} onChange={e=>{invalidate();setArrival(e.target.value)}}/>{displayDate(arrival)&&<small className="booking-date-confirmation">{t.dateSelected}: <b dir="ltr">{displayDate(arrival)}</b> ({t.dateFormat})</small>}</label>
  <label><span>{t.departure}</span><input name="departure" type="date" required value={departure} onChange={e=>{invalidate();setDeparture(e.target.value)}}/>{displayDate(departure)&&<small className="booking-date-confirmation">{t.dateSelected}: <b dir="ltr">{displayDate(departure)}</b> ({t.dateFormat})</small>}</label>
  <label><span>{t.adults}</span><input name="adults" type="number" min="1" max="100" required value={adults} onChange={e=>{invalidate();setAdults(e.target.value)}}/></label>
  <label><span>{t.children}</span><input name="children" type="number" min="0" max="100" required value={children} onChange={e=>{invalidate();setChildren(e.target.value)}}/></label>
  <div className="availability-message" aria-live="polite"><span>{failed?t.failed:arrival&&departure&&arrival>=departure?t.invalidDates:notice?t.selectedUnavailable:loading?t.checking:availability&&unit?t.ready:t.chooseDates}</span>{failed&&<button type="button" className="text-button" onClick={()=>{invalidate();setRetry(n=>n+1)}}>{t.retry}</button>}<small>{t.note}</small></div>
 </>
}
