/** Egyptian local mobile numbers match +20/0020; other numbers keep their country code. */
export function normalizePhone(value: string): string {
  let digits = value.replace(/[٠-٩۰-۹]/g, char => {
    const code = char.charCodeAt(0)
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660)
  }).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^01[0125]\d{8}$/.test(digits)) digits = '20' + digits.slice(1)
  return digits
}
