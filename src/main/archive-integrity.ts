import type Database from 'better-sqlite3'
import {createHash} from 'node:crypto'

// Detect damaged archive blobs and shared font bundles before backup/restore.
// These unkeyed hashes detect corruption; they do not authenticate a hostile DB.
export function assertArchiveIntegrity(db:Database.Database,version:number):void {
 if(version<5)return
 const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
 const fonts=db.prepare('SELECT bundle_hash AS hash,fonts_json AS json FROM declaration_archive_fonts').iterate() as Iterable<{hash:string;json:string}>
 for(const row of fonts)if(hash(row.json)!==row.hash)throw new Error('ARCHIVE_INTEGRITY')
 const archives=db.prepare('SELECT document_ciphertext AS value,cipher_hash AS hash FROM declaration_archives').iterate() as Iterable<{value:Buffer;hash:string}>
 for(const row of archives)if(hash(row.value)!==row.hash)throw new Error('ARCHIVE_INTEGRITY')
}
