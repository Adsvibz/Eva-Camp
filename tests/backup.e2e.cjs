// Runs against the real Electron main process and Windows safeStorage with disposable data.
const {_electron:electron}=require('playwright')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'eva-backup-e2e-'))
const data=path.join(dir,'profile'),portable=path.join(dir,'portable.evabackup'),local=path.join(dir,'manual.sqlite')
const password='Strong-test-password-2026'
let app,page
async function launch(){app=await electron.launch({args:[path.join(root,'electron-test-bootstrap.cjs')],env:{...process.env,EVA_TEST_DATA_DIR:data},timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);await page.getByRole('button',{name:'New booking',exact:true}).waitFor()}
async function dialogs(target){await app.evaluate(({dialog,app},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});app.relaunch=()=>{}},target)}
async function restartAfter(operation){const closed=app.waitForEvent('close',{timeout:30000});await page.evaluate(operation).catch(()=>{});await closed;app=null;await launch()}
async function identityOnPrint(id){const opened=app.waitForEvent('window',{timeout:15000});await page.evaluate(id=>window.eva.previewRegistration(id),id);const win=await opened;await win.waitForLoadState('domcontentloaded');const text=await win.locator('body').innerText();assert.equal(await win.locator('svg.guest-signature').count(),1);await win.close();return text}
async function archivedOnPrint(bookingId){const list=await page.evaluate(id=>window.eva.listDeclarationArchives({bookingId:id,offset:0}),bookingId);assert.equal(list.rows.length,1);const opened=app.waitForEvent('window',{timeout:15000});await page.evaluate(id=>window.eva.previewArchivedDeclaration(id),list.rows[0].id);const win=await opened;await win.waitForLoadState('domcontentloaded');assert.equal(await win.locator('svg.guest-signature').count(),1);assert.match(await win.locator('body').innerText(),/TEST-ID-PRINT-7821/);await win.close()}
;(async()=>{
 fs.mkdirSync(data);await launch()
 const first=await page.evaluate(async()=>{const unit=await window.eva.createUnit({name:'Backup A',type:'room',capacity:2,pricePiasters:0});return window.eva.createBooking({fullName:'Backup guest',phone:'',unitId:unit,arrival:'2026-11-10',departure:'2026-11-12',adults:1,children:0,totalPiasters:12000,source:'phone',idNumber:'TEST-ID-PRINT-7821',companions:[{fullName:'Backup companion',idNumber:'COMP-ID-7821'}]})})
 await page.evaluate(async id=>{const d=await window.eva.getDeclaration(id),now=new Date(),day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;await window.eva.saveDeclaration({bookingId:id,expectedRevision:d.revision,receivedBy:'Backup receptionist',signedDate:day,confirmed:true,signature:[[[0.1,0.7],[0.4,0.2],[0.8,0.6]]]})},first.id)
 await dialogs(portable);assert.equal(await page.evaluate(p=>window.eva.portableExport(p),password),true);assert.ok(fs.existsSync(portable));assert.equal(fs.readFileSync(portable).includes(Buffer.from('TEST-ID-PRINT-7821')),false)
 await dialogs(local);assert.equal(await page.evaluate(()=>window.eva.manualBackup()),true);assert.ok(fs.existsSync(local));assert.equal(fs.readFileSync(local).includes(Buffer.from('TEST-ID-PRINT-7821')),false)
 await page.evaluate(()=>window.eva.createUnit({name:'After backup',type:'room',capacity:2,pricePiasters:0}))
 await dialogs(portable);const wrong=await page.evaluate(async()=>{try{await window.eva.portableImport('Wrong-test-password-2026');return false}catch{return true}});assert.equal(wrong,true);assert.equal((await page.evaluate(()=>window.eva.listUnits())).length,2);assert.equal(fs.existsSync(path.join(data,'restore-pending.sqlite')),false)
 await restartAfter(()=>window.eva.portableImport('Strong-test-password-2026'));assert.equal((await page.evaluate(()=>window.eva.listUnits())).length,1);const declaration=await page.evaluate(id=>window.eva.getDeclaration(id),first.id);assert.equal(declaration.isCurrent,true);assert.equal(declaration.receivedBy,'Backup receptionist');assert.ok(declaration.signature);assert.match(await identityOnPrint(first.id),/TEST-ID-PRINT-7821/);await archivedOnPrint(first.id)
 await page.evaluate(()=>window.eva.createUnit({name:'After portable restore',type:'room',capacity:2,pricePiasters:0}));await dialogs(local)
 await restartAfter(()=>window.eva.restoreBackup());assert.equal((await page.evaluate(()=>window.eva.listUnits())).length,1);assert.ok((await page.evaluate(id=>window.eva.getDeclaration(id),first.id)).signature);assert.match(await identityOnPrint(first.id),/TEST-ID-PRINT-7821/);await archivedOnPrint(first.id)
 const recoveries=fs.readdirSync(data).filter(x=>x.startsWith('pre-restore-')&&x.endsWith('.sqlite'));assert.ok(recoveries.length>=2,'Each restore must keep a pre-restore recovery copy')
 console.log('PASS: real Windows Electron manual and password-protected backup, rejected wrong password without data loss, restored both snapshots after restart, retained recovery copies, and decrypted the test identity in the registration preview.')
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(app)await app.close().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200})})
