import {createHash} from 'node:crypto'
import {mkdir,open,rename,rm,lstat} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {join} from 'node:path'
import type {UpdateState,UpdateError} from '../shared/updates'

const repository='Adsvibz/Eva-Camp'
const releasesUrl='https://api.github.com/repos/'+repository+'/releases?per_page=30'
const maxInstaller=512*1024*1024
type Candidate={version:string;notes:string;url:string;size:number;sha256:string}
function version(value:unknown):number[]|null {
 if(typeof value!=='string'||!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))return null
 const parts=value.replace(/^v/,'').split('.').map(Number)
 return parts.every(Number.isSafeInteger)?parts:null
}
function compare(a:number[],b:number[]){for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0}
export function selectRelease(data:unknown,current:string):Candidate|null {
 const baseline=version(current)
 if(!Array.isArray(data)||!baseline)throw Error('release')
 let selected:any=null,selectedVersion=baseline
 for(const item of data){
  if(!item||typeof item!=='object'||item.draft!==false||item.prerelease!==false)continue
  const parsed=version(item.tag_name)
  if(parsed&&compare(parsed,selectedVersion)>0){selected=item;selectedVersion=parsed}
 }
 if(!selected)return null
 const assets=Array.isArray(selected.assets)?selected.assets.filter((a:any)=>a?.name==='evacamp.exe'):[]
 if(assets.length!==1)throw Error('release')
 const asset=assets[0],expected='https://github.com/'+repository+'/releases/download/'+encodeURIComponent(selected.tag_name)+'/evacamp.exe'
 if(asset.state!=='uploaded'||asset.browser_download_url!==expected||!Number.isSafeInteger(asset.size)||asset.size<2||asset.size>maxInstaller||typeof asset.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(asset.digest))throw Error('release')
 return {version:selectedVersion.join('.'),notes:typeof selected.body==='string'?selected.body.slice(0,5000):'',url:expected,size:asset.size,sha256:asset.digest.slice(7)}
}
function allowed(url:URL){
 if(url.protocol!=='https:'||url.username||url.password||url.port)return false
 if(url.hostname==='api.github.com')return url.pathname==='/repos/'+repository+'/releases'
 if(url.hostname==='github.com')return url.pathname.startsWith('/'+repository+'/releases/download/')
 return url.hostname==='release-assets.githubusercontent.com'||url.hostname==='objects.githubusercontent.com'
}
export async function trustedResponse(url:string,fetcher:typeof fetch,signal:AbortSignal):Promise<Response>{
 for(let redirects=0;redirects<5;redirects++){
  const parsed=new URL(url);if(!allowed(parsed))throw Error('release')
  const response=await fetcher(url,{redirect:'manual',signal,headers:{'User-Agent':'Eva-Camp-Updater','Accept':parsed.hostname==='api.github.com'?'application/vnd.github+json':'application/octet-stream'}})
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel()
   if(!location)throw Error('release');url=new URL(location,url).href;continue
  }
  if(response.status===403||response.status===429){await response.body?.cancel();throw Error('rate-limit')}
  if(response.status!==200){await response.body?.cancel();throw Error('network')}
  return response
 }
 throw Error('release')
}
async function readJson(response:Response){
 const reader=response.body?.getReader();if(!reader)throw Error('release')
 const chunks:Uint8Array[]=[];let total=0
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>2*1024*1024)throw Error('release');chunks.push(value)}}
 finally{await reader.cancel().catch(()=>{})}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('release')}
}
async function verify(file:string,candidate:Candidate){
 const info=await lstat(file)
 if(!info.isFile()||info.isSymbolicLink()||info.size!==candidate.size)throw Error('integrity')
 const hash=createHash('sha256');let size=0;let first=Buffer.alloc(0)
 for await(const chunk of createReadStream(file)){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>candidate.size)throw Error('integrity');if(first.length<2)first=Buffer.concat([first,bytes]).subarray(0,2);hash.update(bytes)}
 if(size!==candidate.size||first.toString('ascii')!=='MZ'||hash.digest('hex')!==candidate.sha256)throw Error('integrity')
}
export function installerArguments(){return ['--updated','/S','--force-run']}
export class GitHubUpdater {
 private value:UpdateState
 private candidate:Candidate|null=null
 private controller:AbortController|null=null
 private file:string
 private fetcher:typeof fetch
 constructor(private options:{version:string;enabled:boolean;cacheDir:string;fetcher?:typeof fetch}){
  this.value={phase:options.enabled?'idle':'unsupported',currentVersion:options.version,progress:0}
  this.file=join(options.cacheDir,'pending.exe');this.fetcher=options.fetcher||fetch
 }
 state():UpdateState{return {...this.value}}
 private set(patch:Partial<UpdateState>){this.value={...this.value,...patch}}
 private failure(error:unknown){const code=error instanceof Error?error.message:'';this.set({phase:'error',error:(['network','rate-limit','release','integrity','storage','backup'].includes(code)?code:'network') as UpdateError})}
 async check(){
  if(!['idle','up-to-date','available','error'].includes(this.value.phase))return this.state()
  this.candidate=null;this.set({phase:'checking',error:undefined,progress:0,version:undefined,notes:undefined})
  try{
   const response=await trustedResponse(releasesUrl,this.fetcher,AbortSignal.timeout(20000))
   this.candidate=selectRelease(await readJson(response),this.options.version)
   this.set({phase:this.candidate?'available':'up-to-date',version:this.candidate?.version,notes:this.candidate?.notes})
  }catch(error){this.failure(error)}
  return this.state()
 }
 async download(){
  if(!this.options.enabled||!this.candidate||!['available','error'].includes(this.value.phase))return this.state()
  const candidate=this.candidate,controller=new AbortController();this.controller=controller
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10*60*1000)])
  this.set({phase:'downloading',progress:0,error:undefined})
  const part=this.file+'.part';let handle:Awaited<ReturnType<typeof open>>|undefined
  try{
   try{await mkdir(this.options.cacheDir,{recursive:true});await rm(part,{force:true});await rm(this.file,{force:true});handle=await open(part,'wx',0o600)}catch{throw Error('storage')}
   const response=await trustedResponse(candidate.url,this.fetcher,signal),reader=response.body?.getReader()
   if(!reader)throw Error('network')
   let received=0
   try{while(true){
    signal.throwIfAborted();const {done,value}=await reader.read();if(done)break
    received+=value.length;if(received>candidate.size)throw Error('integrity')
    try{await handle.writeFile(value)}catch{throw Error('storage')}
    this.set({progress:Math.min(99,Math.floor(received/candidate.size*100))})
   }}finally{await reader.cancel().catch(()=>{})}
   if(received!==candidate.size)throw Error('integrity')
   await handle.close();handle=undefined
   signal.throwIfAborted();await verify(part,candidate);signal.throwIfAborted()
   await rename(part,this.file);this.set({phase:'ready',progress:100,error:undefined})
  }catch(error){
   await handle?.close().catch(()=>{});await rm(part,{force:true}).catch(()=>{});await rm(this.file,{force:true}).catch(()=>{})
   if(controller.signal.aborted)this.set({phase:'available',progress:0,error:undefined});else this.failure(error)
  }finally{this.controller=null}
  return this.state()
 }
 cancel(){this.controller?.abort();return this.state()}
 async installerPath(){
  if(!['ready','installing'].includes(this.value.phase)||!this.candidate)throw Error('not-ready')
  try{await verify(this.file,this.candidate);return this.file}catch{this.failure(Error('integrity'));throw Error('integrity')}
 }
 installing(){this.set({phase:'installing'})}
 backupFailed(){this.set({phase:'ready',error:'backup'})}
}
