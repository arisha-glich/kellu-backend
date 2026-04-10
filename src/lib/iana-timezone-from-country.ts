/**
 * When the client omits `timeZone`, pick a representative IANA zone from ISO 3166-1 alpha-2.
 * US/CA/AU are multi-zone: this is a population-weighted default; clients should send
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` for exact local time.
 */
const DEFAULT_IANA_BY_COUNTRY: Record<string, string> = {
  GB: 'Europe/London',
  GG: 'Europe/London',
  IM: 'Europe/London',
  JE: 'Europe/London',
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  IE: 'Europe/Dublin',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  PT: 'Europe/Lisbon',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen',
  FI: 'Europe/Helsinki',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  IN: 'Asia/Kolkata',
  PK: 'Asia/Karachi',
  BD: 'Asia/Dhaka',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  IL: 'Asia/Jerusalem',
  ZA: 'Africa/Johannesburg',
  NG: 'Africa/Lagos',
  KE: 'Africa/Nairobi',
  EG: 'Africa/Cairo',
  BR: 'America/Sao_Paulo',
  AR: 'America/Argentina/Buenos_Aires',
  MX: 'America/Mexico_City',
  CL: 'America/Santiago',
  CO: 'America/Bogota',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  CN: 'Asia/Shanghai',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
  TH: 'Asia/Bangkok',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
  VN: 'Asia/Ho_Chi_Minh',
}

export function isValidIanaTimeZoneId(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * @param explicitTimeZone — from client (IANA); empty / null / undefined falls through
 * @param isoCountry — ISO 3166-1 alpha-2 uppercase or null
 */
export function resolveBusinessIanaTimeZone(
  explicitTimeZone: string | undefined | null,
  isoCountry: string | null | undefined
): string {
  const raw = typeof explicitTimeZone === 'string' ? explicitTimeZone.trim() : ''
  if (raw !== '' && isValidIanaTimeZoneId(raw)) {
    return raw
  }

  const cc =
    typeof isoCountry === 'string' && isoCountry.length === 2 ? isoCountry.toUpperCase() : null
  if (cc) {
    const mapped = DEFAULT_IANA_BY_COUNTRY[cc]
    if (mapped && isValidIanaTimeZoneId(mapped)) {
      return mapped
    }
  }

  return 'UTC'
}
