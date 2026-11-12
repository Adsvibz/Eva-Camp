import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('returning guests',()=>{
 let db:Database.Database,repo:CampRepository,unitId:number
 const input=()=>({fullName:'مريم أحمد',phone:'01220755755',unitId,arrival:'2026-11-01',departure:'2026-11-02',adults:1,children:0,totalPiasters:10000,source:'phone' as const,nationality:'Egyptian',email:'guest@example.com',idNumber:'SECRET-ID'})
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql']){const p=join(process.cwd(),'db/migrations',f);db.exec(readFileSync(p,'utf8'))}repo=new CampRepository(db,v=>Buffer.from('encrypted:'+v),v=>v.toString().replace('encrypted:',''));unitId=repo.createUnit({name:'A',type:'room',capacity:3,pricePiasters:10000})})
 afterEach(()=>db.close())
 it('requires an explicit choice before creating another profile with the same normalized phone',()=>{
  repo.createBooking(input())
  expect(()=>repo.createBooking({...input(),arrival:'2026-11-03',departure:'2026-11-04',phone:'+20 122 075 5755'})).toThrow('DUPLICATE_GUEST')
  expect(db.prepare('SELECT count(*) AS n FROM guests').get()).toEqual({n:1})
 })
 it('reuses the selected profile without overwriting its details or encrypted identity',()=>{
  repo.createBooking(input());const guestId=(db.prepare('SELECT id FROM guests').get() as {id:number}).id
  const next=repo.createBooking({...input(),guestId,fullName:'Untrusted changed name',idNumber:'REPLACEMENT',arrival:'2026-11-03',departure:'2026-11-04'})
  expect(db.prepare('SELECT count(*) AS n FROM guests').get()).toEqual({n:1})
  expect(repo.registrationData(next.id)).toMatchObject({fullName:'مريم أحمد',idNumber:'SECRET-ID'})
  expect(repo.guestHistory({guestId,offset:0}).rows).toHaveLength(2)
 })
 it('allows an explicitly acknowledged shared phone without merging different guests',()=>{
  repo.createBooking(input());repo.createBooking({...input(),fullName:'Family member',allowSharedPhone:true,arrival:'2026-11-03',departure:'2026-11-04'})
  expect(db.prepare('SELECT count(*) AS n FROM guests').get()).toEqual({n:2})
  expect(repo.findGuests('٠١٢٢٠٧٥٥٧٥٥')).toHaveLength(2)
 })
 it('finds Arabic names and equivalent phone formats without leaking encrypted IDs',()=>{
  repo.createBooking(input())
  for(const query of ['مريم','+20 122 075 5755','00201220755755','٠١٢٢٠٧٥٥٧٥٥']){
   const found=repo.findGuests(query);expect(found).toHaveLength(1);expect(found[0]).toMatchObject({fullName:'مريم أحمد',hasPrimaryId:1});expect(JSON.stringify(found)).not.toContain('SECRET-ID');expect(JSON.stringify(found)).not.toContain('encrypted:')
  }
  expect(repo.findGuests('%')).toEqual([]);expect(repo.findGuests('')).toEqual([])
 })
 it('rejects deleted returning guests and rolls back conflicting bookings',()=>{
  const first=repo.createBooking(input());const guestId=(db.prepare('SELECT id FROM guests').get() as {id:number}).id
  expect(()=>repo.createBooking({...input(),guestId})).toThrow('overlaps')
  expect(repo.guestHistory({guestId,offset:0}).rows.map(b=>b.id)).toEqual([first.id])
  db.prepare('UPDATE guests SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(guestId)
  expect(()=>repo.createBooking({...input(),guestId,arrival:'2026-11-03',departure:'2026-11-04'})).toThrow('Guest unavailable')
  expect(repo.findGuests('مريم')).toEqual([])
 })
 it('paginates history without omitting or repeating stays',()=>{
  const first=repo.createBooking(input());const guestId=(db.prepare('SELECT id FROM guests').get() as {id:number}).id;repo.changeStatus(first.id,'cancelled')
  for(let i=0;i<51;i++){const b=repo.createBooking({...input(),guestId});repo.changeStatus(b.id,'cancelled')}
  const one=repo.guestHistory({guestId,offset:0}),two=repo.guestHistory({guestId,offset:50})
  expect(one.rows).toHaveLength(50);expect(one.hasMore).toBe(true);expect(two.rows).toHaveLength(2);expect(two.hasMore).toBe(false);expect(new Set([...one.rows,...two.rows].map(b=>b.id)).size).toBe(52)
 })
 it('keeps the phone lookup in sync when a linked guest profile is edited',()=>{
  const first=repo.createBooking(input());const guestId=(db.prepare('SELECT id FROM guests').get() as {id:number}).id
  const second=repo.createBooking({...input(),guestId,arrival:'2026-11-03',departure:'2026-11-04'})
  repo.updateBookingDetails({bookingId:second.id,fullName:'Updated guest',phone:'+20 100 000 0000',adults:1,children:0,totalPiasters:12000,source:'phone'})
  expect(repo.findGuests('01220755755')).toEqual([])
  expect(repo.findGuests('٠١٠٠٠٠٠٠٠٠٠')).toMatchObject([{id:guestId,fullName:'Updated guest'}])
  expect(repo.getBooking(first.id)?.fullName).toBe('Updated guest')
  expect(repo.getBooking(first.id)?.totalPiasters).toBe(10000)
 })
 it('does not consume a booking reference or add audit entries when a duplicate is blocked',()=>{
  repo.createBooking(input());const audits=repo.countAudit()
  expect(()=>repo.createBooking({...input(),arrival:'2026-11-03',departure:'2026-11-04'})).toThrow('DUPLICATE_GUEST')
  expect(repo.countAudit()).toBe(audits)
  const next=repo.createBooking({...input(),phone:'',arrival:'2026-11-03',departure:'2026-11-04'})
  expect(next.reference).toBe('EVA-2026-0002')
 })
 it('keeps shared-phone approval in the audit trail without storing phone or identity values there',()=>{
  repo.createBooking(input());repo.createBooking({...input(),allowSharedPhone:true,arrival:'2026-11-03',departure:'2026-11-04'})
  const audit=db.prepare("SELECT * FROM audit_log WHERE action='create-shared-phone'").all()
  expect(audit).toHaveLength(1);expect(JSON.stringify(audit)).not.toContain('01220755755');expect(JSON.stringify(audit)).not.toContain('SECRET-ID')
 })

})
