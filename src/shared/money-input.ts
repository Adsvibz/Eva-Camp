import {z} from 'zod'

// Decimal text -> integer piasters: never multiply a floating-point EGP value.
export const egpInputSchema=z.string().trim().max(32)
 .transform(value=>value.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0))).replace(/٫/g,'.'))
 .pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/))
 .transform(value=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))})
 .refine(value=>value<=BigInt(Number.MAX_SAFE_INTEGER),'Amount is too large')
 .transform(Number)

export function piastersToInput(value:number):string {
 const amount=BigInt(value),magnitude=amount<0n?-amount:amount
 return `${amount<0n?'-':''}${magnitude/100n}.${String(magnitude%100n).padStart(2,'0')}`
}
const currencyFormats={
 en:{integer:new Intl.NumberFormat('en-EG',{maximumFractionDigits:0}),fraction:new Intl.NumberFormat('en-EG',{minimumIntegerDigits:2,useGrouping:false})},
 ar:{integer:new Intl.NumberFormat('ar-EG',{maximumFractionDigits:0}),fraction:new Intl.NumberFormat('ar-EG',{minimumIntegerDigits:2,useGrouping:false})}
}
export function formatEgp(value:number,lang:'en'|'ar'):string {
 const amount=BigInt(value),magnitude=amount<0n?-amount:amount,format=currencyFormats[lang]
 return `${amount<0n?'-':''}${format.integer.format(magnitude/100n)}${lang==='ar'?'٫':'.'}${format.fraction.format(magnitude%100n)} EGP`
}
