import {unitAvailabilitySchema} from '../shared/contracts'
import {saveDeclarationSchema,undoDeclarationSchema,archivePageSchema} from '../shared/declaration'
import { app, BrowserWindow, ipcMain, dialog, safeStorage, Menu, protocol } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, statSync } from 'node:fs'
import Database from 'better-sqlite3'
import { CampRepository } from './repository'
import {paymentHistorySchema,discountSchema,addExtraSchema,extraRefSchema,updateUnitSchema} from '../shared/contracts'
import { AppLock } from './lock'
import {invoiceHtml} from './invoice'
import { registrationHtml, receiptHtml, closingHtml } from './print'
import { managementReportHtml, reportCsv } from './reports'
import { createVerifiedBackup, createManualBackup } from './backup'
import { stageRestore, applyStagedRestore } from './restore'
import { createPortableArchive, stagePortableRestore } from './portable'
import { bookingSchema, paymentSchema, unitSchema, statusSchema, date, calendarRangeSchema, rescheduleSchema, searchSchema, bookingDetailsSchema, reportRangeSchema, replaceIdentitySchema, addCompanionSchema, updateCompanionSchema, companionRefSchema, portablePasswordSchema, transferSchema, guestHistorySchema, uiPreferencesSchema } from '../shared/contracts'

protocol.registerSchemesAsPrivileged([{scheme:'evaprint',privileges:{standard:true,secure:true}}])
const printPages=new Map<string,string>()
let db:Database.Database
let shutdownStarted=false,shutdownFinished=false
const pendingFileJobs=new Set<Promise<unknown>>()
function track<T>(promise:Promise<T>):Promise<T>{pendingFileJobs.add(promise);promise.then(()=>pendingFileJobs.delete(promise),()=>pendingFileJobs.delete(promise));return promise}
if(!app.requestSingleInstanceLock())app.exit(0)
app.whenReady().then(()=>{
 try {
  const dataDir=app.getPath('userData');mkdirSync(dataDir,{recursive:true});const live=join(dataDir,'eva-camp.sqlite'),pending=join(dataDir,'restore-pending.sqlite'),previous=join(dataDir,'restore-previous.sqlite')
  applyStagedRestore(live,pending,previous)
  db=new Database(live)
  db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000')
  const result=db.pragma('quick_check',{simple:true}); if(result!=='ok') throw new Error('Database integrity check failed')
  const schema=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
  if(!schema) db.exec(readFileSync(join(app.getAppPath(),'db/migrations/0001_initial.sql'),'utf8'))
  let version=(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number}).version
  if(version===1){db.exec(readFileSync(join(app.getAppPath(),'db/migrations/0002_unit_segments.sql'),'utf8'));version=2}
  if(version===2){db.exec(readFileSync(join(app.getAppPath(),'db/migrations/0003_guest_lookup.sql'),'utf8'));version=3}
  if(version===3){db.exec(readFileSync(join(app.getAppPath(),'db/migrations/0004_declarations.sql'),'utf8'));version=4}
  if(version===4){db.exec(readFileSync(join(app.getAppPath(),'db/migrations/0005_declaration_archives.sql'),'utf8'));version=5}
  if(version!==5) throw new Error(`Unsupported database schema: ${version}`)
  let restoring=false
  let backupPending:Promise<unknown>=Promise.resolve()
  const backup=()=>{backupPending=track(backupPending.then(()=>createVerifiedBackup(db,join(dataDir,'backups'))).catch(error=>dialog.showErrorBox('Backup failed / تعذر النسخ الاحتياطي',String(error))));return backupPending}
  void backup()
  let backupTimer=setInterval(()=>{void backup()},60*60*1000)
  app.once('before-quit',()=>clearInterval(backupTimer))
  const repository=new CampRepository(db,(value)=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Identity encryption unavailable');return safeStorage.encryptString(value)},(value)=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Identity decryption unavailable');return safeStorage.decryptString(value)},undefined,data=>{const logoPath=join(app.getAppPath(),'assets/logo.png');const logo=existsSync(logoPath)?`data:image/png;base64,${readFileSync(logoPath).toString('base64')}`:undefined;return {html:registrationHtml(data,fonts,logo),fonts}})
  const security=new AppLock(db)
  let window:BrowserWindow
  const publicChannels=new Set(['security:status','security:unlock'])
  const handle=(channel:string,listener:(event:Electron.IpcMainInvokeEvent,...args:any[])=>unknown)=>ipcMain.handle(channel,(event,...args)=>{
   if(event.sender!==window.webContents)throw new Error('UNTRUSTED_SENDER')
   if(!publicChannels.has(channel))security.assertUnlocked()
   return listener(event,...args)
  })
  handle('security:status',()=>({...security.status(),preferences:repository.getPreferences()}))
  handle('security:unlock',(_event,pin:unknown)=>{security.unlock(pin);return security.status()})
  handle('security:set',(_event,pin:unknown,current:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');security.setPin(pin,current);return security.status()})
  handle('security:disable',(_event,current:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');security.disable(current);return security.status()})
  handle('security:lock',()=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');security.lock();for(const view of BrowserWindow.getAllWindows())if(view!==window)view.close();printPages.clear();return security.status()})
  protocol.handle('evaprint',request=>{const url=new URL(request.url);const key=url.pathname.slice(1);const html=url.hostname==='preview'&&request.method==='GET'?printPages.get(key):undefined;return html===undefined?new Response('Not found',{status:404}):new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"}})})
  const fontsDir=join(app.getAppPath(),'assets/fonts')
  const font=(name:string)=>readFileSync(join(fontsDir,name)).toString('base64')
  const fonts={serif:font('NotoSerif-Regular.ttf'),serifBold:font('NotoSerif-Bold.ttf'),arabic:font('NotoNaskhArabic-Regular.ttf'),arabicBold:font('NotoNaskhArabic-Bold.ttf')}
  const showPreview=async (html:string,filename:string)=>{
   const preview=new BrowserWindow({width:900,height:1000,title:'Eva Camp — Print preview',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
   preview.webContents.setWindowOpenHandler(()=>({action:'deny'}))
   preview.webContents.on('will-navigate',event=>event.preventDefault())
   const pdf=async()=>{const choice=await dialog.showSaveDialog(preview,{title:'Save PDF / حفظ PDF',defaultPath:filename,filters:[{name:'PDF',extensions:['pdf']}]});if(!choice.canceled&&choice.filePath){const bytes=await preview.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});writeFileSync(choice.filePath,bytes)}}
   preview.setMenu(Menu.buildFromTemplate([{label:'Print / طباعة',click:()=>preview.webContents.print({printBackground:true})},{label:'Save PDF / حفظ PDF',click:()=>{pdf().catch(error=>dialog.showErrorBox('PDF',String(error)))}}]))
   const key=randomUUID();printPages.set(key,html);preview.once('closed',()=>printPages.delete(key));try{await preview.loadURL(`evaprint://preview/${key}`)}catch(error){printPages.delete(key);preview.close();throw error}
  }
  handle('registration:preview',async (_event,id:unknown)=>{
   const bookingId=id===null?null:statusSchema.shape.bookingId.parse(id)
   const logoPath=join(app.getAppPath(),'assets/logo.png')
   const logo=existsSync(logoPath)?`data:image/png;base64,${readFileSync(logoPath).toString('base64')}`:undefined
   await showPreview(registrationHtml(bookingId===null?null:repository.registrationData(bookingId),fonts,logo),'Eva_Camp_Registration.pdf')
  })
  handle('invoice:preview',async (_event,id:unknown)=>{
   const bookingId=statusSchema.shape.bookingId.parse(id),now=new Date(),day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
   const logoPath=join(app.getAppPath(),'assets/logo.png'),logo=existsSync(logoPath)?`data:image/png;base64,${readFileSync(logoPath).toString('base64')}`:undefined
   await showPreview(invoiceHtml(repository.invoiceData(bookingId),day,fonts,logo),'Eva_Camp_Invoice.pdf')
  })
  handle('receipt:preview',async (_event,id:unknown)=>{const paymentId=statusSchema.shape.bookingId.parse(id);await showPreview(receiptHtml(repository.receiptData(paymentId),fonts),'Eva_Camp_Receipt.pdf')})
  const encryptIdentity=(value:string)=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Identity encryption unavailable');return safeStorage.encryptString(value)}
  const decryptIdentity=(value:Buffer)=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Identity decryption unavailable');return safeStorage.decryptString(value)}
  const finishRestore=async(window:BrowserWindow,stage:()=>Promise<void>)=>{
   if(restoring||shutdownStarted)throw new Error('Restore already in progress')
   const confirmation=await dialog.showMessageBox(window,{type:'warning',buttons:['Cancel / إلغاء','Restore and restart / استعادة وإعادة تشغيل'],defaultId:0,cancelId:0,message:'Replace current data with this backup? / هل تريد استبدال البيانات الحالية بالنسخة الاحتياطية؟',detail:'A copy of the current database will be kept. / سيتم الاحتفاظ بنسخة من البيانات الحالية.'})
   if(confirmation.response!==1)return false
   if(restoring||shutdownStarted)throw new Error('Restore already in progress')
   restoring=true;window.setEnabled(false);clearInterval(backupTimer);let staged=false
   try{await backupPending;await stage();staged=true;const recovery=join(dataDir,`pre-restore-${Date.now()}.sqlite`);await track(createManualBackup(db,recovery));const checkpoint=db.pragma('wal_checkpoint(TRUNCATE)') as {busy:number}[];if(checkpoint[0]?.busy)throw new Error('Database checkpoint is busy');app.relaunch();app.quit();return true}
   catch(error){if(staged)rmSync(pending,{force:true});restoring=false;backupTimer=setInterval(()=>{void backup()},60*60*1000);window.setEnabled(true);throw error}
  }
  handle('backup:restore',async (event)=>{
   if(restoring||shutdownStarted)throw new Error('Restore already in progress');const window=BrowserWindow.fromWebContents(event.sender);if(!window)throw new Error('Window unavailable')
   const choice=await dialog.showOpenDialog(window,{title:'Select backup / اختر النسخة الاحتياطية',properties:['openFile'],filters:[{name:'SQLite',extensions:['sqlite']}]});if(choice.canceled||!choice.filePaths[0])return false
   return finishRestore(window,()=>track(stageRestore(choice.filePaths[0],pending,value=>{decryptIdentity(value);return true})))
  })
  handle('backup:portable-export',async (_event,raw:unknown)=>{
   if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const password=portablePasswordSchema.parse(raw)
   const stamp=new Date().toISOString().replace(/[:.]/g,'-');const choice=await dialog.showSaveDialog({title:'Export encrypted backup / تصدير نسخة مشفرة',defaultPath:`Eva_Camp_Portable_${stamp}.evabackup`,filters:[{name:'Eva Camp backup',extensions:['evabackup']}]});if(choice.canceled||!choice.filePath)return false
   if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const archive=createPortableArchive(db,password,decryptIdentity);try{writeFileSync(choice.filePath,archive,{flag:'wx',mode:0o600})}finally{archive.fill(0)}return true
  })
  handle('backup:portable-import',async (event,raw:unknown)=>{
   if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const password=portablePasswordSchema.parse(raw);const window=BrowserWindow.fromWebContents(event.sender);if(!window)throw new Error('Window unavailable')
   const choice=await dialog.showOpenDialog(window,{title:'Select encrypted backup / اختر النسخة المشفرة',properties:['openFile'],filters:[{name:'Eva Camp backup',extensions:['evabackup']}]});if(choice.canceled||!choice.filePaths[0])return false
   return finishRestore(window,async()=>{if(statSync(choice.filePaths[0]).size>512*1024*1024)throw new Error('Backup is too large');const archive=readFileSync(choice.filePaths[0]);try{stagePortableRestore(archive,password,pending,encryptIdentity,decryptIdentity)}finally{archive.fill(0)}})
  })
  handle('dashboard:summary',(_event,day:unknown)=>repository.dashboard(date.parse(day)))
  handle('reports:summary',(_event,raw:unknown)=>{const r=reportRangeSchema.parse(raw);return repository.managementReport(r.start,r.end)})
  handle('reports:preview',async (_event,raw:unknown)=>{const r=reportRangeSchema.parse(raw);await showPreview(managementReportHtml(repository.managementReport(r.start,r.end),fonts),'Eva_Camp_Report.pdf')})
  handle('reports:csv',async (_event,raw:unknown)=>{const r=reportRangeSchema.parse(raw);const report=repository.managementReport(r.start,r.end);const choice=await dialog.showSaveDialog({title:'Export CSV / تصدير CSV',defaultPath:`Eva_Camp_Report_${r.start}_${r.end}.csv`,filters:[{name:'CSV',extensions:['csv']}]});if(choice.canceled||!choice.filePath)return false;writeFileSync(choice.filePath,reportCsv(report),'utf8');return true})
  handle('closing:report',(_event,day:unknown)=>repository.dailyReport(date.parse(day)))
  handle('closing:close',(_event,day:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.closeDay(date.parse(day))})
  handle('closing:reopen',(_event,day:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.reopenDay(date.parse(day));return repository.dailyReport(date.parse(day))})
  handle('closing:preview',async (_event,day:unknown)=>{const report=repository.dailyReport(date.parse(day));await showPreview(closingHtml(report,fonts),'Eva_Camp_Closing.pdf')})
  handle('backup:manual',async ()=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const date=new Date().toISOString().replace(/[:.]/g,'-');const choice=await dialog.showSaveDialog({title:'Save backup / حفظ نسخة احتياطية',defaultPath:`Eva_Camp_Backup_${date}.sqlite`,filters:[{name:'SQLite',extensions:['sqlite']}]});if(choice.canceled||!choice.filePath)return false;await track(createManualBackup(db,choice.filePath));return true})
  handle('units:list',()=>repository.listUnits())
  handle('units:availability',(_event,data:unknown)=>repository.unitAvailability(unitAvailabilitySchema.parse(data)))
  handle('units:update',(_event,data:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.updateUnit(updateUnitSchema.parse(data))})
  handle('units:create',(_event,data:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.createUnit(unitSchema.parse(data))})
  handle('identity:replace',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.replaceIdentity(replaceIdentitySchema.parse(raw))})
  handle('identity:undo',(_event,id:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.undoIdentity(statusSchema.shape.bookingId.parse(id))})
  handle('bookings:discount',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.setDiscount(discountSchema.parse(raw))})
  handle('declaration:archives',(_event,raw:unknown)=>{const d=archivePageSchema.parse(raw);return repository.listDeclarationArchives(d.bookingId,d.offset)})
  handle('declaration:preview-archive',async (_event,id:unknown)=>{const archiveId=statusSchema.shape.bookingId.parse(id);await showPreview(repository.declarationArchiveHtml(archiveId),'Eva_Camp_Archived_Registration.pdf')})
  handle('declaration:get',(_event,id:unknown)=>repository.getDeclaration(statusSchema.shape.bookingId.parse(id)))
  handle('declaration:save',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.saveDeclaration(saveDeclarationSchema.parse(raw))})
  handle('declaration:undo',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.undoDeclaration(undoDeclarationSchema.parse(raw))})
  handle('extras:list',(_event,id:unknown)=>repository.listExtras(statusSchema.shape.bookingId.parse(id)))
  handle('extras:add',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.addExtra(addExtraSchema.parse(raw))})
  handle('extras:remove',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.removeExtra(extraRefSchema.parse(raw))})
  handle('extras:restore',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.restoreExtra(extraRefSchema.parse(raw))})
  handle('companions:add',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.addCompanion(addCompanionSchema.parse(raw))})
  handle('companions:update',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.updateCompanion(updateCompanionSchema.parse(raw))})
  handle('companions:remove',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const d=companionRefSchema.parse(raw);repository.removeCompanion(d.bookingId,d.companionId)})
  handle('companions:restore',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const d=companionRefSchema.parse(raw);repository.restoreCompanion(d.bookingId,d.companionId)})
  handle('bookings:update-details',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.updateBookingDetails(bookingDetailsSchema.parse(raw))})
  handle('preferences:get',()=>repository.getPreferences())
  handle('preferences:save',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.savePreferences(uiPreferencesSchema.parse(raw))})
  handle('guests:find',(_event,query:unknown)=>repository.findGuests(searchSchema.parse(query)))
  handle('guests:find-identity',(_event,query:unknown)=>repository.findGuestsByIdentity(searchSchema.parse(query)))
  handle('guests:duplicates',(_event,phone:unknown)=>repository.duplicateGuests(searchSchema.parse(phone)))
  handle('guests:history',(_event,raw:unknown)=>repository.guestHistory(guestHistorySchema.parse(raw)))
  handle('bookings:search',(_event,query:unknown)=>repository.searchBookings(searchSchema.parse(query)))
  handle('units:history',(_event,id:unknown)=>repository.unitHistory(statusSchema.shape.bookingId.parse(id)))
  handle('units:transfer',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.transferUnit(transferSchema.parse(raw))})
  handle('calendar:list',(_event,raw:unknown)=>{const range=calendarRangeSchema.parse(raw);return repository.calendar(range.start,range.end)})
  handle('calendar:reschedule',(_event,raw:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');repository.reschedule(rescheduleSchema.parse(raw))})
  handle('bookings:list',()=>repository.listBookings())
  handle('bookings:get',(_event,id:unknown)=>repository.getBooking(statusSchema.shape.bookingId.parse(id)))
  handle('bookings:status',(_event,data:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');const d=statusSchema.parse(data);repository.changeStatus(d.bookingId,d.status)})
  handle('bookings:create',(_event,data:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.createBooking(bookingSchema.parse(data))})
  handle('payments:list',(_event,data:unknown)=>repository.listPayments(paymentHistorySchema.parse(data)))
  handle('payments:create',(_event,data:unknown)=>{if(restoring||shutdownStarted)throw new Error('Restore or shutdown in progress');return repository.addPayment(paymentSchema.parse(data))})
  window=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:650,show:false,backgroundColor:'#f4f4f2',webPreferences:{preload:join(__dirname,'../preload/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
  window.once('ready-to-show',()=>window.show())
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',(e)=>e.preventDefault())
  if(process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL); else window.loadFile(join(__dirname,'../renderer/index.html'))
 } catch(error) { dialog.showErrorBox('Eva Camp — startup error',String(error)); app.quit() }
})
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',event=>{if(shutdownFinished)return;event.preventDefault();if(shutdownStarted)return;shutdownStarted=true;Promise.allSettled([...pendingFileJobs]).then(()=>{try{db?.close();shutdownFinished=true;app.quit()}catch(error){shutdownStarted=false;dialog.showErrorBox('Database close failed / تعذر إغلاق قاعدة البيانات',String(error))}})})
