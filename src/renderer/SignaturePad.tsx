import React,{useRef,useState} from 'react'
import {signaturePaths,type Signature} from '../shared/declaration'
const copy={en:{label:'Signature drawing area',hint:'Draw with a mouse or touch. A signature is optional; leave this blank to sign on paper.',undo:'Undo last stroke',clear:'Clear drawing',restore:'Restore drawing',limit:'Drawing limit reached. Undo a stroke or clear the drawing.'},ar:{label:'مساحة رسم التوقيع',hint:'وقّع بالماوس أو اللمس. التوقيع اختياري؛ اترك المساحة فارغة للتوقيع على الورق.',undo:'التراجع عن آخر خط',clear:'مسح الرسم',restore:'استعادة الرسم',limit:'وصلت للحد الأقصى للرسم. تراجع عن خط أو امسح الرسم.'}} as const
export function SignaturePad({value,onChange,lang,disabled,onDrawing}:{value:Signature;onChange:(value:Signature)=>void;lang:'en'|'ar';disabled:boolean;onDrawing:(drawing:boolean)=>void}){
 const t=copy[lang],active=useRef<{id:number;points:[number,number][]}|null>(null)
 const [current,setCurrent]=useState<[number,number][]>([]),[cleared,setCleared]=useState<Signature|null>(null),[limit,setLimit]=useState(false)
 function point(e:React.PointerEvent<SVGSVGElement>):[number,number]{const r=e.currentTarget.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*10000)/10000,Math.round(Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))*10000)/10000]}
 function start(e:React.PointerEvent<SVGSVGElement>){
  if(disabled||e.button!==0||active.current)return
  if(value.length>=50||value.reduce((n,s)=>n+s.length,0)>=3999){setLimit(true);return}
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
  const points=[point(e)];active.current={id:e.pointerId,points};setCurrent(points);setCleared(null);onDrawing(true)
 }
 function move(e:React.PointerEvent<SVGSVGElement>){
  const stroke=active.current;if(!stroke||stroke.id!==e.pointerId)return
  if(stroke.points.length>=400||value.reduce((n,s)=>n+s.length,0)+stroke.points.length>=4000){setLimit(true);return}
  const p=point(e),last=stroke.points[stroke.points.length-1]
  if(Math.abs(last[0]-p[0])+Math.abs(last[1]-p[1])<0.002)return
  stroke.points=[...stroke.points,p];setCurrent(stroke.points)
 }
 function end(e:React.PointerEvent<SVGSVGElement>,cancel=false){
  const stroke=active.current;if(!stroke||stroke.id!==e.pointerId)return
  if(!cancel&&stroke.points.length>=2)onChange([...value,stroke.points])
  active.current=null;setCurrent([]);onDrawing(false)
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
 }
 return <div className="signature-control"><p className="calendar-hint" id="signature-hint">{t.hint}</p><svg role="img" aria-label={t.label} aria-describedby="signature-hint" className="signature-pad" viewBox="0 0 600 180" preserveAspectRatio="none" onPointerDown={start} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)}>{signaturePaths([...value,...(current.length?[current]:[])]).map((d,i)=><path key={i} d={d} fill="none" stroke="#171b19" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}</svg><div className="signature-actions"><button type="button" className="text-button" disabled={disabled||!!active.current||!value.length} onClick={()=>{onChange(value.slice(0,-1));setLimit(false)}}>{t.undo}</button><button type="button" className="text-button" disabled={disabled||!!active.current||!value.length} onClick={()=>{setCleared(value);onChange([]);setLimit(false)}}>{t.clear}</button>{cleared&&<button type="button" className="text-button" disabled={disabled||!!active.current} onClick={()=>{onChange(cleared);setCleared(null)}}>{t.restore}</button>}</div>{limit&&<p role="status" className="calendar-hint">{t.limit}</p>}</div>
}
