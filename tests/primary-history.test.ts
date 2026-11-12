import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('primary guest stays by protected identity',()=>{
 let db:Database.Database,repo:CampRepository,unit:number
 const input=()=>({fullName:'Guest',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone' as const,idNumber:'ID-123'})
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',f),'utf8'));repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));unit=repo.createUnit({name:'A',type:'room',capacity:3,pricePiasters:0})})
 afterEach(()=>db.close())
 it('returns every matching stay across pages, including explicitly confirmed matching IDs',()=>{
  const first=repo.createBooking(input());const guestId=repo.getBooking(first.id)!.guestId;repo.changeStatus(first.id,'cancelled')
  for(let i=0;i<24;i++){const booking=repo.createBooking({...input(),guestId});repo.changeStatus(booking.id,'cancelled')}
  const other=repo.createBooking({...input(),fullName:'Other',allowDuplicateIdentity:true});repo.changeStatus(other.id,'cancelled')
  const all:number[]=[];let cursor:undefined|{arrival:string;bookingId:number}
  for(let i=0;i<3;i++){const page=repo.findPrimaryHistoryPage({identity:'id-١٢٣',cursor});all.push(...page.rows.map(row=>row.bookingId));expect(JSON.stringify(page)).not.toContain('ID-123');expect(JSON.stringify(page)).not.toContain('cipher:');if(!page.nextCursor)break;cursor=page.nextCursor}
  expect(all).toHaveLength(26);expect(new Set(all).size).toBe(26);expect(all).toEqual([...all].sort((a,b)=>b-a))
 })
 it('keeps identity edits and deletes in sync and validates cursors',()=>{
  const booking=repo.createBooking(input());expect(repo.findPrimaryHistoryPage({identity:'id-123'}).rows).toHaveLength(1)
  const change=repo.replaceIdentity({bookingId:booking.id,kind:'primary',idNumber:'NEW-ID'});expect(repo.findPrimaryHistoryPage({identity:'ID-123'}).rows).toEqual([]);repo.undoIdentity(change);expect(repo.findPrimaryHistoryPage({identity:'ID-123'}).rows).toHaveLength(1)
  expect(()=>repo.findPrimaryHistoryPage({identity:'ID-123',cursor:{arrival:'2026-02-30',bookingId:1}})).toThrow()
  db.prepare('UPDATE bookings SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(booking.id);expect(repo.findPrimaryHistoryPage({identity:'ID-123'}).rows).toEqual([])
 })
})
