import {z} from 'zod'

// Decimal text -> integer piasters: never multiply a floating-point EGP value.
export const egpInputSchema=z.string().trim().max(32)
 .transform(value=>value.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0))).replace(/٫/g,'.'))
 .pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/))
 .transform(value=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))})
 .refine(value=>value<=BigInt(Number.MAX_SAFE_INTEGER),'Amount is too large')
 .transform(Number)

export function piastersToInput(value:number):string {
 const amount=BigInt(value)
 return `${amount/100n}.${String(amount%100n).padStart(2,'0')}`
}
