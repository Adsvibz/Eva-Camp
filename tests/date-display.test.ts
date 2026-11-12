import {describe,it,expect} from 'vitest'
import {displayDate} from '../src/shared/date-display'
describe('unambiguous date display',()=>{
 it('shows the day before the month, independent of system locale',()=>{expect(displayDate('2026-11-12')).toBe('12/11/2026');expect(displayDate('2027-02-01')).toBe('01/02/2027')})
 it('does not present invalid or incomplete dates as valid',()=>{expect(displayDate('')).toBe('');expect(displayDate('2026-02-30')).toBe('');expect(displayDate('2026-1-01')).toBe('')})
})
