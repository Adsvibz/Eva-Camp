import {it} from 'vitest'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {GitHubUpdater,selectRelease,trustedResponse,installerArguments} from '../src/main/updates'
const bytes=Buffer.from('MZ verified installer fixture')
const digest='sha256:'+createHash('sha256').update(bytes).digest('hex')
function release(version='0.3.0'){return {tag_name:'v'+version,draft:false,prerelease:false,body:'New features',assets:[{name:'evacamp.exe',state:'uploaded',size:bytes.length,digest,browser_download_url:'https://github.com/Adsvibz/Eva-Camp/releases/download/v'+version+'/evacamp.exe'}]}}
async function fixture(run:(u:GitHubUpdater,dir:string)=>Promise<void>,fetcher?:typeof fetch){
 const dir=await mkdtemp(join(tmpdir(),'eva-update-test-'))
 try{await run(new GitHubUpdater({version:'0.2.0',enabled:true,cacheDir:dir,fetcher:fetcher|| (async (url)=>String(url).includes('api.github.com')?Response.json([release()]):new Response(bytes))}),dir)}
 finally{await rm(dir,{recursive:true,force:true})}
}
it('selects the highest newer stable version, never an old or preview release',()=>{
 const older=release('0.2.9'),newer=release('0.10.0'),preview={...release('9.0.0'),prerelease:true},draft={...release('8.0.0'),draft:true}
 assert.equal(selectRelease([older,newer,preview,draft],'0.2.0')?.version,'0.10.0')
 assert.equal(selectRelease([older],'0.2.9'),null)
 assert.equal(selectRelease([{...newer,tag_name:'../../evil'}],'0.2.0'),null)
})
it('rejects unsafe installer origins, missing digest, duplicate assets and malformed size',()=>{
 for(const asset of [{browser_download_url:'https://evil.example/evacamp.exe'},{browser_download_url:'https://github.com/Other/Repo/releases/download/v0.3.0/evacamp.exe'},{digest:null},{size:600*1024*1024},{size:2.5},{name:'portable.exe'}]){
  const r=release();r.assets[0]={...r.assets[0],...asset} as any
  assert.throws(()=>selectRelease([r],'0.2.0'),/release/)
 }
 const r=release();r.assets.push(r.assets[0]);assert.throws(()=>selectRelease([r],'0.2.0'),/release/)
})
it('follows only HTTPS GitHub asset redirects',async()=>{
 let calls=0
 const f=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.example/payload'}})}
 await assert.rejects(trustedResponse(release().assets[0].browser_download_url,f as typeof fetch,new AbortController().signal),/release/)
 assert.equal(calls,1)
 await assert.rejects(trustedResponse('http://github.com/Adsvibz/Eva-Camp/releases/download/v0.3.0/evacamp.exe',f as typeof fetch,new AbortController().signal),/release/)
})
it('downloads verified bytes, reports ready, and rechecks tampering before install',async()=>{
 await fixture(async(u,dir)=>{
  await u.check();assert.equal(u.state().phase,'available')
  await u.download();assert.equal(u.state().phase,'ready');assert.equal(u.state().progress,100)
  const file=await u.installerPath();assert.deepEqual(await readFile(file),bytes)
  await writeFile(file,Buffer.alloc(bytes.length,1))
  await assert.rejects(u.installerPath(),/integrity/);assert.equal(u.state().phase,'error')
 })
})
it('rejects truncated, oversized and hash-mismatched downloads and removes partial files',async()=>{
 for(const bad of [bytes.subarray(0,5),Buffer.concat([bytes,bytes]),Buffer.alloc(bytes.length,0)]){
  await fixture(async(u,dir)=>{await u.check();await u.download();assert.equal(u.state().error,'integrity');assert.equal((await readdir(dir)).some(n=>n.endsWith('.exe')||n.endsWith('.part')),false)},(async url=>String(url).includes('api.github.com')?Response.json([release()]):new Response(bad)) as typeof fetch)
 }
})
it('does not allow concurrent downloads and cancellation cleans partial data',async()=>{
 let releaseFetch:()=>void=()=>{}
 const started=new Promise<void>(resolve=>{releaseFetch=resolve})
 const f=(async (url,init)=>{
  if(String(url).includes('api.github.com'))return Response.json([release()])
  releaseFetch()
  return await new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}))
 }) as typeof fetch
 await fixture(async(u,dir)=>{await u.check();const first=u.download();await started;await u.download();u.cancel();await first;assert.equal(u.state().phase,'available');assert.equal((await readdir(dir)).length,0)},f)
})
it('network and rate limit errors leave the app usable and a subsequent check can recover',async()=>{
 let fail=true
 await fixture(async u=>{await u.check();assert.equal(u.state().error,'rate-limit');fail=false;await u.check();assert.equal(u.state().phase,'available')},(async()=>fail?new Response(null,{status:403}):Response.json([release()])) as typeof fetch)
})
it('unsupported builds make no network requests and cannot install',async()=>{
 const u=new GitHubUpdater({version:'0.2.0',enabled:false,cacheDir:'unused',fetcher:(async()=>{throw Error('Must not fetch')}) as typeof fetch})
 await u.check();await u.download();assert.equal(u.state().phase,'unsupported');await assert.rejects(u.installerPath(),/not-ready/)
})
it('uses NSIS update and relaunch arguments, preserving the installation directory',()=>{
 assert.deepEqual(installerArguments('C:\\Apps\\Eva Camp'),['--updated','/S','--force-run','/D=C:\\Apps\\Eva Camp'])
})
