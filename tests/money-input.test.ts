import {describe,it,expect} from 'vitest'
import {egpInputSchema,piastersToInput} from '../src/shared/money-input'
describe('exact EGP input',()=>{
 it.each([['0',0],['0.29',29],['150.25',15025],[' ١٥٠٫٢٥ ',15025],['۱۲.۵',1250],['90071992547409.91',Number.MAX_SAFE_INTEGER]])('converts %s without floating point rounding',(input,expected)=>expect(egpInputSchema.parse(input)).toBe(expected))
 it.each(['','-1','1.001','1e2','1,500','90071992547409.92','Infinity','.','1.2.3'])('rejects ambiguous or unsafe input %s',input=>expect(egpInputSchema.safeParse(input).success).toBe(false))
 it('formats the largest supported amount without rounding a piaster',()=>{expect(piastersToInput(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');expect(piastersToInput(29)).toBe('0.29')})
})

it('formats positive and negative EGP amounts without losing piasters',async()=>{
 const {formatEgp}=await import('../src/shared/money-input')
 expect(piastersToInput(-29)).toBe('-0.29')
 expect(piastersToInput(-Number.MAX_SAFE_INTEGER)).toBe('-90071992547409.91')
 expect(formatEgp(Number.MAX_SAFE_INTEGER,'en')).toBe('90,071,992,547,409.91 EGP')
 expect(formatEgp(-29,'en')).toBe('-0.29 EGP')
 expect(formatEgp(25025,'ar')).toBe('٢٥٠٫٢٥ EGP')
})
