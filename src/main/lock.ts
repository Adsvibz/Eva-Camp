import type Database from 'better-sqlite3'
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto'

type LockRecord={version:1;salt:string;hash:string;failures:number;lockedUntil:number}
export type LockStatus={enabled:boolean;locked:boolean;retryAfterMs:number}
const key='security:lock'
function validPin(pin:unknown):asserts pin is string {if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin))throw new Error('INVALID_PIN_FORMAT')}
function derive(pin:string,salt:Buffer){return scryptSync(pin,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024})}
export class AppLock{
 private locked:boolean
 constructor(private db:Database.Database,private now:()=>number=Date.now){this.locked=!!this.read()}
 private read():LockRecord|null{
  const row=this.db.prepare('SELECT value_json AS value FROM settings WHERE key=?').get(key) as {value:string}|undefined
  if(!row)return null
  try{const v=JSON.parse(row.value) as LockRecord;if(v.version!==1||! /^[a-f0-9]{32}$/.test(v.salt)||! /^[a-f0-9]{64}$/.test(v.hash)||!Number.isSafeInteger(v.failures)||v.failures<0||!Number.isSafeInteger(v.lockedUntil)||v.lockedUntil<0)throw new Error();return v}catch{throw new Error('LOCK_CONFIGURATION_INVALID')}
 }
 private write(record:LockRecord){this.db.prepare('INSERT INTO settings(key,value_json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key,JSON.stringify(record))}
 private audit(action:string){this.db.prepare('INSERT INTO audit_log(actor,action,entity_type,entity_id) VALUES (?,?,?,?)').run('operator',action,'security','lock')}
 status():LockStatus{const record=this.read();return {enabled:!!record,locked:this.locked,retryAfterMs:record?Math.max(0,record.lockedUntil-this.now()):0}}
 assertUnlocked():void{if(this.locked)throw new Error('APP_LOCKED')}
 private verify(pin:unknown):void{
  const record=this.read();if(!record)throw new Error('LOCK_NOT_ENABLED');if(record.lockedUntil>this.now())throw new Error('LOCKOUT')
  validPin(pin);const actual=derive(pin,Buffer.from(record.salt,'hex')),expected=Buffer.from(record.hash,'hex');const match=timingSafeEqual(actual,expected);actual.fill(0);expected.fill(0)
  if(!match){record.failures++;if(record.failures>=5){record.failures=0;record.lockedUntil=this.now()+30000}this.write(record);throw new Error('INVALID_PIN')}
  if(record.failures||record.lockedUntil){record.failures=0;record.lockedUntil=0;this.write(record)}
 }
 setPin(pin:unknown,current?:unknown):void{
  this.assertUnlocked();validPin(pin);if(this.read())this.verify(current)
  const salt=randomBytes(16),hash=derive(pin,salt)
  try{this.db.transaction(()=>{this.write({version:1,salt:salt.toString('hex'),hash:hash.toString('hex'),failures:0,lockedUntil:0});this.audit('pin-set')})()}finally{hash.fill(0);salt.fill(0)}
 }
 disable(current:unknown):void{this.assertUnlocked();this.verify(current);this.db.transaction(()=>{this.db.prepare('DELETE FROM settings WHERE key=?').run(key);this.audit('pin-disabled')})();this.locked=false}
 lock():void{this.assertUnlocked();if(!this.read())throw new Error('LOCK_NOT_ENABLED');this.locked=true}
 unlock(pin:unknown):void{if(!this.locked)throw new Error('APP_NOT_LOCKED');this.verify(pin);this.locked=false}
}
