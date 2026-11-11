import type Database from 'better-sqlite3'
import {date,type DashboardStay,type DashboardSummary} from '../shared/contracts'

/** A consistent front-desk snapshot; all dates are supplied in the operator's local calendar. */
export function dashboardSummary(db:Database.Database,day:string):DashboardSummary{
 date.parse(day)
 return db.transaction(()=>{
  const counts=db.prepare(`SELECT
   COUNT(*) FILTER (WHERE status='checked-in') AS inHouseBookings,
   COALESCE(SUM(CASE WHEN status='checked-in' THEN adults_count+children_count ELSE 0 END),0) AS inHouseGuests,
   COUNT(*) FILTER (WHERE status IN ('reserved','checked-in') AND arrival_date=?) AS arrivalsCount,
   COUNT(*) FILTER (WHERE status IN ('reserved','checked-in') AND departure_date=?) AS departuresCount
   FROM bookings WHERE deleted_at IS NULL`).get(day,day) as Pick<DashboardSummary,'inHouseBookings'|'inHouseGuests'|'arrivalsCount'|'departuresCount'>
  const classifications=db.prepare(`WITH checked_in_units AS MATERIALIZED (
    SELECT DISTINCT COALESCE(
      (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id AND s.start_date<=@day AND s.end_date>@day ORDER BY s.start_date DESC,s.id DESC LIMIT 1),
      CASE WHEN @day<b.arrival_date THEN
        (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id ORDER BY s.start_date ASC,s.id ASC LIMIT 1)
      ELSE (SELECT s.unit_id FROM booking_unit_segments s WHERE s.booking_id=b.id ORDER BY s.start_date DESC,s.id DESC LIMIT 1) END
    ) AS unit_id FROM bookings b WHERE b.deleted_at IS NULL AND b.status='checked-in'
   ), reserved_units AS MATERIALIZED (
    SELECT DISTINCT s.unit_id FROM booking_unit_segments s JOIN bookings b ON b.id=s.booking_id
    WHERE b.deleted_at IS NULL AND b.status='reserved' AND s.start_date<=@day AND s.end_date>@day
   ), classified AS (
    SELECT CASE WHEN ci.unit_id IS NOT NULL THEN 'occupied'
      WHEN u.housekeeping_status='maintenance' THEN 'maintenance'
      WHEN u.housekeeping_status='cleaning' THEN 'cleaning'
      WHEN r.unit_id IS NOT NULL THEN 'reserved' ELSE 'available' END AS status
    FROM units u LEFT JOIN checked_in_units ci ON ci.unit_id=u.id LEFT JOIN reserved_units r ON r.unit_id=u.id
    WHERE u.deleted_at IS NULL
   ) SELECT status,COUNT(*) AS count FROM classified GROUP BY status`).all({day}) as {status:keyof DashboardSummary['unitStatuses'];count:number}[]
  const unitStatuses:DashboardSummary['unitStatuses']={available:0,reserved:0,occupied:0,cleaning:0,maintenance:0}
  for(const row of classifications)unitStatuses[row.status]=row.count
  const totalUnits=Object.values(unitStatuses).reduce((a,b)=>a+b,0),occupiedUnits=unitStatuses.occupied
  const payments=db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN payment_date=@day THEN amount_piasters ELSE 0 END),0) AS todayCollectionsPiasters,
    COALESCE(SUM(amount_piasters),0) AS monthCollectionsPiasters
    FROM payments WHERE deleted_at IS NULL AND payment_date>=@month AND payment_date<=@day`).get({day,month:day.slice(0,8)+'01'}) as Pick<DashboardSummary,'todayCollectionsPiasters'|'monthCollectionsPiasters'>
  const balance=db.prepare(`SELECT COALESCE(SUM(CASE WHEN v.balance_piasters>0 THEN v.balance_piasters ELSE 0 END),0) AS outstandingPiasters FROM bookings b JOIN booking_balances v ON v.booking_id=b.id WHERE b.deleted_at IS NULL AND b.status<>'cancelled'`).get() as Pick<DashboardSummary,'outstandingPiasters'>
  const rows=(column:'arrival_date'|'departure_date',order:'ASC'|'DESC')=>db.prepare(`SELECT b.id,b.booking_reference AS reference,g.full_name AS fullName,
    COALESCE((SELECT u.name FROM booking_unit_segments s JOIN units u ON u.id=s.unit_id WHERE s.booking_id=b.id ORDER BY s.start_date ${order},s.id ${order} LIMIT 1),current.name) AS unitName,
    b.status,b.arrival_date AS arrival,b.departure_date AS departure
    FROM bookings b JOIN guests g ON g.id=b.guest_id JOIN units current ON current.id=b.unit_id
    WHERE b.deleted_at IS NULL AND b.status IN ('reserved','checked-in') AND b.${column}=?
    ORDER BY g.full_name COLLATE NOCASE,b.id LIMIT 10`).all(day) as DashboardStay[]
  return {day,...counts,totalUnits,occupiedUnits,occupancyPercent:totalUnits?Math.round(occupiedUnits*1000/totalUnits)/10:0,unitStatuses,...payments,...balance,arrivals:rows('arrival_date','ASC'),departures:rows('departure_date','DESC')}
 })()
}
