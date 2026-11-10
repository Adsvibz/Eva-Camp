import {it,expect} from 'vitest'
import {reportCsv,managementReportHtml} from '../src/main/reports'
import type {ManagementReport} from '../src/shared/contracts'
const report:ManagementReport={start:'2026-11-01',end:'2026-11-03',bookingCount:1,bookingValuePiasters:100000,collectionsPiasters:35000,refundsPiasters:5000,scheduledNights:3,availableNights:6,outstandingPiasters:55000,nationalities:[{nationality:'=1+1',stays:1},{nationality:'Egyptian',stays:2}]}
it('exports UTF-8 CSV safely for spreadsheet applications',()=>{const csv=reportCsv(report);expect(csv.startsWith('\ufeff')).toBe(true);expect(csv).toContain('1000.00');expect(csv).toContain("'=1+1");expect(csv).toContain('Egyptian')})
it('escapes user supplied report values in the bilingual PDF template',()=>{const html=managementReportHtml({...report,nationalities:[{nationality:'<script>x</script>',stays:1}]});expect(html).toContain('MANAGEMENT REPORT');expect(html).toContain('تقرير الإدارة');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>x</script>')})
