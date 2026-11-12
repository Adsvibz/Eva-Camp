import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {CampRepository} from '../src/main/repository'

describe('same-booking identity conflicts',()=>{
 let db:Database.Database,repo:CampRepository,unit:number
 const input=()=>({fullName:'Primary',phone:'',unitId:unit,arrival:'2026-11-01',departure:'2026-11-03',adults:1,children:0,totalPiasters:0,source:'phone' as const,idNumber:'P-123'})
 beforeEach(()=>{db=new Database(':memory:');for(const f of ['0001_initial.sql','0002_unit_segments.sql','0003_guest_lookup.sql','0004_declarations.sql','0005_declaration_archives.sql'])db.exec(readFileSync(join(process.cwd(),'db/migrations',f),'utf8'));repo=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>b.toString().slice(7));unit=repo.createUnit({name:'A',type:'room',capacity:4,pricePiasters:0})})
 afterEach(()=>db.close())
 it('rolls back a new booking with a repeated identity unless explicitly confirmed',()=>{
  const before=repo.countAudit(),data={...input(),companions:[{fullName:'Companion',idNumber:'p-١٢٣'}]}
  expect(()=>repo.createBooking(data)).toThrow('COMPANION_IDENTITY_CONFLICT');expect(repo.countAudit()).toBe(before);expect(repo.listBookings()).toHaveLength(0)
  const booking=repo.createBooking({...data,companions:[{...data.companions[0],allowDuplicateIdentity:true}]});expect(repo.registrationData(booking.id).companions).toHaveLength(1)
  const audit=db.prepare("SELECT * FROM audit_log WHERE action='companion-identity-confirmed'").all();expect(audit).toHaveLength(1);expect(JSON.stringify(audit)).not.toContain('P-123')
 })
 it('checks adding, changing, undoing, deleting and restoring companions',()=>{
  const booking=repo.createBooking(input());expect(()=>repo.addCompanion({bookingId:booking.id,fullName:'Same',idNumber:'P-123'})).toThrow('COMPANION_IDENTITY_CONFLICT')
  const companion=repo.addCompanion({bookingId:booking.id,fullName:'Guest',idNumber:'C-1'})
  expect(()=>repo.replaceIdentity({bookingId:booking.id,kind:'companion',companionId:companion,idNumber:'p-123'})).toThrow('COMPANION_IDENTITY_CONFLICT')
  const change=repo.replaceIdentity({bookingId:booking.id,kind:'companion',companionId:companion,idNumber:'C-2'})
  repo.addCompanion({bookingId:booking.id,fullName:'Other',idNumber:'C-1'})
  expect(()=>repo.undoIdentity(change)).toThrow('UNDO_DUPLICATE_IDENTITY');repo.undoIdentity(change,true)
  repo.removeCompanion(booking.id,companion);expect(()=>repo.restoreCompanion(booking.id,companion)).toThrow('COMPANION_IDENTITY_CONFLICT');repo.restoreCompanion(booking.id,companion,true)
 })
 it('checks a primary identity change and its undo against active companions',()=>{
  const booking=repo.createBooking(input());const change=repo.replaceIdentity({bookingId:booking.id,kind:'primary',idNumber:'P-456'})
  repo.addCompanion({bookingId:booking.id,fullName:'Other',idNumber:'P-123'})
  expect(()=>repo.undoIdentity(change)).toThrow('UNDO_DUPLICATE_IDENTITY');repo.undoIdentity(change,true)
  expect(()=>repo.replaceIdentity({bookingId:booking.id,kind:'primary',idNumber:'p-123'})).toThrow('DUPLICATE_IDENTITY')
 })
 it('does not mistake records in another booking for a same-booking duplicate',()=>{
  repo.createBooking(input())
  const next=repo.createBooking({...input(),idNumber:'OTHER',arrival:'2026-11-03',departure:'2026-11-05',companions:[{fullName:'Returning guest',idNumber:'P-123'}]})
  expect(repo.registrationData(next.id).companions).toHaveLength(1)
 })
 it('does not add a companion when an existing identity cannot be decrypted',()=>{
  const booking=repo.createBooking(input());db.prepare('UPDATE guests SET id_passport_ciphertext=?').run(Buffer.from('bad'))
  const broken=new CampRepository(db,s=>Buffer.from('cipher:'+s),b=>{if(b.toString()==='bad')throw new Error('decrypt failed');return b.toString().slice(7)})
  const audit=repo.countAudit();expect(()=>broken.addCompanion({bookingId:booking.id,fullName:'Other',idNumber:'C-1'})).toThrow('decrypt failed')
  expect(repo.countAudit()).toBe(audit);expect(repo.getBooking(booking.id)?.companions).toHaveLength(0)
 })

})
