import {spawn} from 'node:child_process'
import {installerArguments} from './updates'
/** Called only after a verified backup and database closure. No renderer-supplied paths. */
export function launchInstaller(file:string):Promise<void>{
 return new Promise((resolve,reject)=>{
  const child=spawn(file,installerArguments(),{detached:true,stdio:'ignore',windowsHide:true})
  child.once('error',reject)
  child.once('spawn',()=>{child.unref();resolve()})
 })
}
