// Test-only fixture. Not included in packaged app files.
const {app}=require('electron')
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events')
const data=process.env.EVA_TEST_DATA_DIR
if(!data)throw Error('Isolated data directory required')
app.setPath('userData',data);app.setPath('sessionData',data)
Object.defineProperty(app,'isPackaged',{value:true})
app.getVersion=()=>'0.1.0'
global.__updateOffline=true
const installer=fs.readFileSync(path.join(__dirname,'dist/evacamp.exe'))
const version=require('./package.json').version
const release={tag_name:'v'+version,draft:false,prerelease:false,body:'A clearer reception workspace and in-app updates.',assets:[{name:'evacamp.exe',state:'uploaded',size:installer.length,digest:'sha256:'+crypto.createHash('sha256').update(installer).digest('hex'),browser_download_url:'https://github.com/Adsvibz/Eva-Camp/releases/download/v'+version+'/evacamp.exe'}]}
global.fetch=async(url)=>{
 if(global.__updateOffline)throw Error('Offline fixture')
 if(String(url).startsWith('https://api.github.com/repos/Adsvibz/Eva-Camp/releases'))return Response.json([release])
 if(String(url)===release.assets[0].browser_download_url)return new Response(installer)
 throw Error('Unexpected network request')
}
const Database=require('better-sqlite3'),close=Database.prototype.close
let closedLive=false
Database.prototype.close=function(...args){if(this.name===path.join(data,'eva-camp.sqlite'))closedLive=true;return close.apply(this,args)}
const cp=require('node:child_process'),originalSpawn=cp.spawn
cp.spawn=function(file,args,options){
 if(file===path.join(data,'updates/pending.exe')){
  const backups=fs.readdirSync(data).filter(n=>n.startsWith('pre-update-')&&n.endsWith('.sqlite'))
  fs.writeFileSync(path.join(data,'update-install-record.json'),JSON.stringify({file,args,options,closedLive,backups}))
  const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child
 }
 return originalSpawn(file,args,options)
}
require(path.join(__dirname,'out/main/main.cjs'))
