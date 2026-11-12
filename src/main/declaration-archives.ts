import type Database from 'better-sqlite3'
import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {z} from 'zod'
import type {RegistrationData} from './print'
import type {DeclarationArchivePage} from '../shared/declaration'

const fontSchema=z.object({serif:z.string(),serifBold:z.string(),arabic:z.string(),arabicBold:z.string()}).strict()
type Fonts=z.infer<typeof fontSchema>
export type ArchiveFactory=(data:RegistrationData)=>{html:string;fonts:Fonts}
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
const keys=['serif','serifBold','arabic','arabicBold'] as const
const token=(key:string)=>`__EVA_ARCHIVE_FONT_${key}__`
const prefix='data:font/ttf;base64,'
export class DeclarationArchives {
 constructor(private db:Database.Database,private encrypt?:(value:string)=>Buffer,private decrypt?:(value:Buffer)=>string){}
 capture(bookingId:number,changeId:number,data:RegistrationData,factory?:ArchiveFactory):void {
  if(!this.encrypt||!factory)throw new Error('ARCHIVE_PROTECTION_UNAVAILABLE')
  const {html,fonts:raw}=factory(data),fonts=fontSchema.parse(raw),fontsJson=JSON.stringify(fonts)
  if(!data.declaration?.isCurrent)throw new Error('DECLARATION_CHANGED')
  let template=html
  for(const key of keys){
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(fonts[key]))throw new Error('ARCHIVE_FONT_INVALID')
   const needle=prefix+fonts[key];if(template.split(needle).length!==2)throw new Error('ARCHIVE_FONT_INVALID')
   template=template.replace(needle,prefix+token(key))
  }
  const compressed=gzipSync(Buffer.from(template,'utf8'))
  if(compressed.length>10*1024*1024)throw new Error('ARCHIVE_TOO_LARGE')
  const ciphertext=this.encrypt(compressed.toString('base64')),fontHash=hash(fontsJson)
  if(!Buffer.isBuffer(ciphertext)||!ciphertext.length)throw new Error('ARCHIVE_PROTECTION_UNAVAILABLE')
  this.db.prepare('INSERT OR IGNORE INTO declaration_archive_fonts(bundle_hash,fonts_json) VALUES (?,?)').run(fontHash,fontsJson)
  this.db.prepare('INSERT INTO declaration_archives(booking_id,change_id,signed_date,received_by,has_signature,document_ciphertext,cipher_hash,fonts_hash) VALUES (?,?,?,?,?,?,?,?)').run(bookingId,changeId,data.declaration.signedDate,data.declaration.receivedBy,data.declaration.signature?1:0,ciphertext,hash(ciphertext),fontHash)
 }
 list(bookingId:number,offset:number):DeclarationArchivePage {
  z.number().int().positive().safe().parse(bookingId);z.number().int().min(0).max(1000000).parse(offset)
  if(!this.db.prepare('SELECT id FROM bookings WHERE id=? AND deleted_at IS NULL').get(bookingId))throw new Error('Booking unavailable')
  const rows=this.db.prepare(`SELECT a.id,a.created_at AS createdAt,a.signed_date AS signedDate,a.received_by AS receivedBy,a.has_signature AS hasSignature,
   EXISTS(SELECT 1 FROM audit_log l WHERE l.action='declaration-undo' AND l.entity_type='booking' AND l.entity_id=CAST(a.booking_id AS TEXT) AND json_extract(l.detail_json,'$.changeId')=a.change_id) AS undone
   FROM declaration_archives a WHERE a.booking_id=? ORDER BY a.id DESC LIMIT 51 OFFSET ?`).all(bookingId,offset) as {id:number;createdAt:string;signedDate:string;receivedBy:string;hasSignature:number;undone:number}[]
  return {rows:rows.slice(0,50).map(r=>({...r,hasSignature:!!r.hasSignature,undone:!!r.undone})),hasMore:rows.length>50}
 }
 html(id:number):string {
  z.number().int().positive().safe().parse(id)
  if(!this.decrypt)throw new Error('ARCHIVE_PROTECTION_UNAVAILABLE')
  const row=this.db.prepare(`SELECT a.document_ciphertext AS cipher,a.cipher_hash AS cipherHash,a.fonts_hash AS fontHash,f.fonts_json AS fontsJson FROM declaration_archives a JOIN declaration_archive_fonts f ON f.bundle_hash=a.fonts_hash JOIN bookings b ON b.id=a.booking_id WHERE a.id=? AND b.deleted_at IS NULL`).get(id) as {cipher:Buffer;cipherHash:string;fontHash:string;fontsJson:string}|undefined
  if(!row||hash(row.cipher)!==row.cipherHash||hash(row.fontsJson)!==row.fontHash)throw new Error('ARCHIVE_INTEGRITY')
  const fonts=fontSchema.parse(JSON.parse(row.fontsJson)),base64=this.decrypt(row.cipher)
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('ARCHIVE_INTEGRITY')
  let html=gunzipSync(Buffer.from(base64,'base64'),{maxOutputLength:16*1024*1024}).toString('utf8')
  for(const key of keys){const needle=prefix+token(key);if(html.split(needle).length!==2||!/^[A-Za-z0-9+/]+={0,2}$/.test(fonts[key]))throw new Error('ARCHIVE_INTEGRITY');html=html.replace(needle,prefix+fonts[key])}
  return html
 }
}
