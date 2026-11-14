const {_electron:electron}=require('playwright')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'eva-lock-ui-'))
let app,page
async function launch(){app=await electron.launch({args:[path.join(root,'electron-test-bootstrap.cjs')],env:{...process.env,EVA_TEST_DATA_DIR:data},timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000)}
async function preferences(){await page.locator('nav').getByRole('button',{name:'Preferences',exact:true}).click()}
;(async()=>{
 await launch();await page.getByRole('button',{name:'New booking',exact:true}).waitFor();await preferences()
 await page.getByRole('button',{name:'Enable PIN',exact:true}).click();await page.getByLabel('New PIN',{exact:true}).fill('123456');await page.getByLabel('Confirm new PIN',{exact:true}).fill('123456');await page.getByRole('button',{name:'Save PIN',exact:true}).click();await page.getByText('PIN saved.',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Lock now',exact:true}).click();await page.getByRole('heading',{name:'Eva Camp is locked',exact:true}).waitFor()
 const updateBlocked=await page.evaluate(async()=>{try{await window.eva.installUpdate();return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(updateBlocked,true)
 const blocked=await page.evaluate(async()=>{try{await window.eva.listUnits();return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(blocked,true)
 const discountBlocked=await page.evaluate(async()=>{try{await window.eva.setDiscount({bookingId:1,discountPiasters:100,expectedDiscountPiasters:0});return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(discountBlocked,true)
 const declarationBlocked=await page.evaluate(async()=>{try{await window.eva.getDeclaration(1);return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(declarationBlocked,true)
 const primaryHistoryPageBlocked=await page.evaluate(async()=>{try{await window.eva.findPrimaryHistoryPage({identity:'TEST'});return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(primaryHistoryPageBlocked,true)
 const companionHistoryPageBlocked=await page.evaluate(async()=>{try{await window.eva.findCompanionHistoryPage({identity:'TEST'});return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(companionHistoryPageBlocked,true)
 const companionHistoryBlocked=await page.evaluate(async()=>{try{await window.eva.findCompanionHistoryByIdentity('TEST');return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(companionHistoryBlocked,true)
 const identityBlocked=await page.evaluate(async()=>{try{await window.eva.findGuestsByIdentity('TEST');return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(identityBlocked,true)
 const paymentHistoryBlocked=await page.evaluate(async()=>{try{await window.eva.listPayments({bookingId:1,offset:0});return false}catch(e){return String(e).includes('APP_LOCKED')}});assert.equal(paymentHistoryBlocked,true)
 await page.getByLabel('Current PIN',{exact:true}).fill('000000');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('alert').filter({hasText:'Incorrect PIN'}).waitFor()
 await app.close();app=null;await launch();await page.getByRole('heading',{name:'Eva Camp is locked',exact:true}).waitFor();await page.getByLabel('Current PIN',{exact:true}).fill('123456');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'New booking',exact:true}).waitFor()
 await preferences();await page.getByRole('button',{name:'Remove PIN',exact:true}).click();await page.getByLabel('Current PIN',{exact:true}).fill('123456');await page.locator('.security-form').getByRole('button',{name:'Remove PIN',exact:true}).click();await page.getByText('PIN removed.',{exact:true}).waitFor()
 await app.close();app=null;await launch();await page.getByRole('button',{name:'New booking',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.eva.lockStatus())).enabled,false)
 console.log('PASS: PIN setup, main-process data access denial, wrong PIN, restart lock, unlock, removal and restart without PIN.')
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(app)await app.close().catch(()=>{});fs.rmSync(data,{recursive:true,force:true,maxRetries:3,retryDelay:200})})

