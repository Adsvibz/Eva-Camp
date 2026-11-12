import {z} from 'zod'
import {date} from './contracts'
export const confirmation={en:'I confirm that the above information is correct.',ar:'أقر بصحة البيانات الموضحة أعلاه.'} as const
export const confirmationText=`${confirmation.en}\n${confirmation.ar}`
const point=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])
export const signatureSchema=z.array(z.array(point).min(2).max(400)).min(1).max(50)
 .refine(strokes=>strokes.reduce((n,s)=>n+s.length,0)<=4000)
 .refine(strokes=>strokes.some(s=>s.some(p=>p[0]!==s[0][0]||p[1]!==s[0][1])))
export type Signature=z.infer<typeof signatureSchema>
export const saveDeclarationSchema=z.object({bookingId:z.number().int().positive().safe(),expectedRevision:z.number().int().nonnegative().safe(),receivedBy:z.string().trim().min(1).max(100),signedDate:date,confirmed:z.literal(true),signature:signatureSchema.nullable()}).strict()
export const undoDeclarationSchema=z.object({bookingId:z.number().int().positive().safe(),changeId:z.number().int().positive().safe()}).strict()
export type SaveDeclarationInput=z.infer<typeof saveDeclarationSchema>
export type UndoDeclarationInput=z.infer<typeof undoDeclarationSchema>
export type DeclarationRecord={revision:number;isCurrent:boolean;confirmationText:string;receivedBy:string;signedDate:string;signature:Signature|null;hasPrevious:boolean}

// Paths contain only bounded numeric coordinates; never accept user-supplied SVG markup.
export function signaturePaths(signature:Signature):string[]{return signature.map(stroke=>stroke.map((p,i)=>`${i?'L':'M'}${(p[0]*600).toFixed(2)},${(p[1]*180).toFixed(2)}`).join(' '))}

export type DeclarationArchive={id:number;createdAt:string;signedDate:string;receivedBy:string;hasSignature:boolean;undone:boolean}
export type DeclarationArchivePage={rows:DeclarationArchive[];hasMore:boolean}
export const archivePageSchema=z.object({bookingId:z.number().int().positive().safe(),offset:z.number().int().min(0).max(1000000)}).strict()
