import { z } from 'zod'
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T00:00:00Z'); return !isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v }, 'Invalid date')
export const unitSchema = z.object({name:z.string().trim().min(1).max(80),type:z.string().trim().min(1).max(80),capacity:z.number().int().min(1).max(100),pricePiasters:z.number().int().min(0).safe()})
export const bookingSchema = z.object({guestId:z.number().int().positive().optional(),allowSharedPhone:z.boolean().optional(),allowDuplicateIdentity:z.boolean().optional(),fullName:z.string().trim().min(1).max(200),phone:z.string().trim().max(50),unitId:z.number().int().positive(),arrival:date,departure:date,adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100),totalPiasters:z.number().int().min(0).safe(),source:z.enum(['walk-in','phone','whatsapp','agency']),nationality:z.string().trim().max(120).optional(),email:z.union([z.string().trim().email().max(254),z.literal('')]).optional(),dateOfBirth:z.union([date,z.literal('')]).optional(),country:z.string().trim().max(100).optional(),address:z.string().trim().max(500).optional(),notes:z.string().trim().max(4000).optional(),idNumber:z.string().trim().max(100).optional(),companions:z.array(z.object({fullName:z.string().trim().min(1).max(200),idNumber:z.string().trim().max(100).optional(),allowDuplicateIdentity:z.boolean().optional()})).optional()}).refine(x=>x.arrival<x.departure,{message:'Departure must be after arrival'})
export const unitAvailabilitySchema=z.object({arrival:date,departure:date,adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100)}).refine(v=>v.arrival<v.departure,{message:'Departure must be after arrival'})
export type UnitAvailabilityInput=z.infer<typeof unitAvailabilitySchema>
export type UnitAvailability={unitId:number;state:'available'|'booked'|'capacity'|'cleaning'|'maintenance'}
export const paymentSchema = z.object({bookingId:z.number().int().positive(),amountPiasters:z.number().int().safe().refine(v=>v!==0),method:z.enum(['cash','card','transfer']),date,note:z.string().trim().max(500).optional()})
export type UnitInput = z.infer<typeof unitSchema>
export type BookingInput = z.infer<typeof bookingSchema>
export type PaymentInput = z.infer<typeof paymentSchema>
export type BookingRow = {id:number;reference:string;fullName:string;unitName:string;arrival:string;departure:string;status:string;totalPiasters:number;paidPiasters:number;balancePiasters:number}
export const updateUnitSchema=unitSchema.extend({id:z.number().int().positive().safe(),housekeepingStatus:z.enum(['available','cleaning','maintenance']),notes:z.string().trim().max(2000)})
export type UpdateUnitInput=z.infer<typeof updateUnitSchema>
export type UnitRow = {id:number;name:string;type:string;capacity:number;pricePiasters:number;housekeepingStatus:'available'|'cleaning'|'maintenance';notes:string}

export const statusSchema = z.object({bookingId:z.number().int().positive(),status:z.enum(['reserved','checked-in','checked-out','cancelled'])})
export type BookingDetail = BookingRow & {discountPiasters:number;extrasPiasters:number;totalDuePiasters:number;guestId:number;unitId:number;nationality:string|null;email:string|null;dateOfBirth:string|null;country:string|null;address:string|null;notes:string|null;phone:string;adults:number;children:number;source:'walk-in'|'phone'|'whatsapp'|'agency';hasPrimaryId:boolean;companions:{id:number;fullName:string;hasId:boolean}[]}

export type DailyReport = {date:string;cash:number;card:number;transfer:number;gross:number;refunds:number;net:number;count:number;closed:boolean}
export const calendarRangeSchema=z.object({start:date,end:date}).refine(v=>v.start<v.end&&new Date(v.end).valueOf()-new Date(v.start).valueOf()<=62*86400000,{message:'Invalid calendar range'})
export const rescheduleSchema=z.object({bookingId:z.number().int().positive(),unitId:z.number().int().positive(),arrival:date,departure:date}).refine(v=>v.arrival<v.departure,{message:'Departure must be after arrival'})
export type CalendarBooking={id:number;reference:string;unitId:number;fullName:string;arrival:string;departure:string;bookingArrival:string;bookingDeparture:string;bookingUnitId:number;status:'reserved'|'checked-in'}
export type RescheduleInput=z.infer<typeof rescheduleSchema>

export const searchSchema=z.string().trim().max(200)
export const bookingDetailsSchema=z.object({bookingId:z.number().int().positive(),fullName:z.string().trim().min(1).max(200),phone:z.string().trim().max(50),nationality:z.string().trim().max(120).optional(),email:z.union([z.string().trim().email().max(254),z.literal('')]).optional(),dateOfBirth:z.union([date,z.literal('')]).optional(),country:z.string().trim().max(100).optional(),address:z.string().trim().max(500).optional(),notes:z.string().trim().max(4000).optional(),adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100),totalPiasters:z.number().int().min(0).safe(),source:z.enum(['walk-in','phone','whatsapp','agency'])})
export type BookingDetailsInput=z.infer<typeof bookingDetailsSchema>
export const reportRangeSchema=z.object({start:date,end:date}).refine(v=>v.start<=v.end&&new Date(v.end).valueOf()-new Date(v.start).valueOf()<=365*86400000,{message:'Invalid report range'})
export type ManagementReport={start:string;end:string;bookingCount:number;bookingValuePiasters:number;collectionsPiasters:number;refundsPiasters:number;scheduledNights:number;availableNights:number;outstandingPiasters:number;nationalities:{nationality:string;stays:number}[]}
const identifier=z.string().trim().max(100)
export const replaceIdentitySchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('primary'),bookingId:z.number().int().positive(),idNumber:identifier,allowDuplicateIdentity:z.boolean().optional()}),z.object({kind:z.literal('companion'),bookingId:z.number().int().positive(),companionId:z.number().int().positive(),idNumber:identifier,allowDuplicateIdentity:z.boolean().optional()})])
export const undoIdentityConfirmationSchema=z.boolean()
export const addCompanionSchema=z.object({bookingId:z.number().int().positive(),fullName:z.string().trim().min(1).max(200),idNumber:identifier.optional(),allowDuplicateIdentity:z.boolean().optional()})
export const updateCompanionSchema=z.object({bookingId:z.number().int().positive(),companionId:z.number().int().positive(),fullName:z.string().trim().min(1).max(200)})
export const companionRefSchema=z.object({bookingId:z.number().int().positive(),companionId:z.number().int().positive(),allowDuplicateIdentity:z.boolean().optional()})
export type ReplaceIdentityInput=z.infer<typeof replaceIdentitySchema>
export type AddCompanionInput=z.infer<typeof addCompanionSchema>
export type UpdateCompanionInput=z.infer<typeof updateCompanionSchema>
export type CompanionRef=z.infer<typeof companionRefSchema>
export const portablePasswordSchema=z.string().min(12).max(256)
export const transferSchema=z.object({bookingId:z.number().int().positive(),unitId:z.number().int().positive(),date})
export type TransferInput=z.infer<typeof transferSchema>
export type UnitSegment={unitId:number;unitName:string;start:string;end:string}

export type GuestProfile={id:number;fullName:string;phone:string;nationality:string|null;email:string|null;dateOfBirth:string|null;country:string|null;address:string|null;notes:string|null;hasPrimaryId:boolean}
export const guestHistorySchema=z.object({guestId:z.number().int().positive(),offset:z.number().int().min(0).max(1000000).default(0)})
export type GuestHistoryInput=z.input<typeof guestHistorySchema>
export type GuestHistoryPage={rows:BookingRow[];hasMore:boolean}

export const uiPreferencesSchema=z.object({language:z.enum(['en','ar']),theme:z.enum(['light','dark','system'])}).strict()
export type UiPreferences=z.infer<typeof uiPreferencesSchema>

export type DashboardStay={id:number;reference:string;fullName:string;unitName:string;status:'reserved'|'checked-in';arrival:string;departure:string}
export type DashboardSummary={day:string;totalUnits:number;occupiedUnits:number;occupancyPercent:number;inHouseBookings:number;inHouseGuests:number;arrivalsCount:number;departuresCount:number;todayCollectionsPiasters:number;monthCollectionsPiasters:number;outstandingPiasters:number;unitStatuses:{available:number;reserved:number;occupied:number;cleaning:number;maintenance:number};arrivals:DashboardStay[];departures:DashboardStay[]}

export const addExtraSchema=z.object({bookingId:z.number().int().positive().safe(),description:z.string().trim().min(1).max(120),quantity:z.number().int().min(1).max(10000),unitPricePiasters:z.number().int().min(0).safe()}).refine(v=>Number.isSafeInteger(v.quantity*v.unitPricePiasters),{message:'Amount is too large'})
export const extraRefSchema=z.object({bookingId:z.number().int().positive().safe(),extraId:z.number().int().positive().safe()})
export type AddExtraInput=z.infer<typeof addExtraSchema>
export type ExtraRef=z.infer<typeof extraRefSchema>
export type BookingExtra={id:number;description:string;quantity:number;unitPricePiasters:number}

export const discountSchema=z.object({bookingId:z.number().int().positive().safe(),discountPiasters:z.number().int().min(0).safe(),expectedDiscountPiasters:z.number().int().min(0).safe()}).strict()
export type DiscountInput=z.infer<typeof discountSchema>

export const paymentHistorySchema=z.object({bookingId:z.number().int().positive().safe(),offset:z.number().int().min(0).max(1000000)}).strict()
export type PaymentHistoryInput=z.infer<typeof paymentHistorySchema>
export type PaymentRow={id:number;receiptNo:string;date:string;method:'cash'|'card'|'transfer';amountPiasters:number;note:string}
export type PaymentHistoryPage={rows:PaymentRow[];hasMore:boolean}

export type CompanionStay={bookingId:number;companionId:number;companionName:string;reference:string;primaryGuest:string;arrival:string;departure:string;status:string}

export const companionHistoryCursorSchema=z.object({arrival:date,bookingId:z.number().int().positive().safe(),companionId:z.number().int().positive().safe()}).strict()
export const companionHistoryPageSchema=z.object({identity:z.string().trim().min(1).max(100),cursor:companionHistoryCursorSchema.optional()}).strict()
export type CompanionHistoryCursor=z.infer<typeof companionHistoryCursorSchema>
export type CompanionHistoryInput=z.infer<typeof companionHistoryPageSchema>
export type CompanionHistoryPage={rows:CompanionStay[];nextCursor:CompanionHistoryCursor|null}
