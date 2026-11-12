import {date} from './contracts'
/** Display a validated ISO date consistently, regardless of Windows locale. */
export function displayDate(value:string):string{
 return date.safeParse(value).success?value.split('-').reverse().join('/'):''
}
