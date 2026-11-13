export type UpdatePhase='unsupported'|'idle'|'checking'|'up-to-date'|'available'|'downloading'|'ready'|'installing'|'error'
export type UpdateError='network'|'rate-limit'|'release'|'integrity'|'storage'|'backup'
export interface UpdateState {phase:UpdatePhase;currentVersion:string;version?:string;notes?:string;progress:number;error?:UpdateError}
