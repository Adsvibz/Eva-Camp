import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import Database from 'better-sqlite3'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {AppLock} from '../src/main/lock'

describe('optional application lock',()=>{
 let db:Database.Database,lock:AppLock,now:number
 beforeEach(()=>{db=new Database(':memory:');db.exec(readFileSync(join(process.cwd(),'db/migrations/0001_initial.sql'),'utf8'));now=1000000;lock=new AppLock(db,()=>now)})
 afterEach(()=>db.close())
 it('starts unlocked until enabled and never stores the PIN in plaintext',()=>{expect(lock.status()).toMatchObject({enabled:false,locked:false});lock.setPin('123456');const value=String((db.prepare("SELECT value_json FROM settings WHERE key='security:lock'").get() as {value_json:string}).value_json);expect(value).not.toContain('123456');expect(lock.status()).toMatchObject({enabled:true,locked:false});expect(new AppLock(db,()=>now).status()).toMatchObject({enabled:true,locked:true})})
 it('requires the current PIN to change or disable it',()=>{lock.setPin('123456');expect(()=>lock.setPin('654321','111111')).toThrow('INVALID_PIN');expect(()=>lock.disable('111111')).toThrow('INVALID_PIN');lock.setPin('654321','123456');lock.lock();expect(()=>lock.unlock('123456')).toThrow('INVALID_PIN');lock.unlock('654321');lock.disable('654321');expect(lock.status()).toMatchObject({enabled:false,locked:false})})
 it('locks protected operations and rate-limits failures across application restarts',()=>{lock.setPin('123456');lock.lock();expect(()=>lock.assertUnlocked()).toThrow('APP_LOCKED');for(let i=0;i<5;i++)expect(()=>lock.unlock('000000')).toThrow('INVALID_PIN');expect(lock.status().retryAfterMs).toBeGreaterThan(0);lock=new AppLock(db,()=>now);expect(()=>lock.unlock('123456')).toThrow('LOCKOUT');now+=30001;lock.unlock('123456');expect(lock.status()).toMatchObject({locked:false,retryAfterMs:0})})
 it('does not allow changing or removing the PIN while locked',()=>{lock.setPin('123456');lock.lock();expect(()=>lock.setPin('654321','123456')).toThrow('APP_LOCKED');expect(()=>lock.disable('123456')).toThrow('APP_LOCKED')})
 it('rejects weak or malformed PINs and fails closed for damaged lock settings',()=>{expect(()=>lock.setPin('1234')).toThrow();expect(()=>lock.setPin('abcdef')).toThrow();db.prepare("INSERT INTO settings(key,value_json) VALUES ('security:lock','broken')").run();expect(()=>new AppLock(db,()=>now)).toThrow('LOCK_CONFIGURATION_INVALID')})
})
