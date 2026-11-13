import {spawn} from 'node:child_process'
import {installerArguments} from './updates'
/** Called only after a verified backup and database closure. No renderer-supplied paths. */
export function launchInstaller(file:string,directory:string):Promise<void>{
 return new Promise((resolve,reject)=>{
  const child=spawn(file,installerArguments(directory),{detached:true,stdio:'ignore',windowsHide:true})
  child.once('error',reject)
  child.once('spawn',()=>{child.unref();resolve()})
 })
}
