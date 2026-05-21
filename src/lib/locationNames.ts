const HCM_CITY = 'Thành phố Hồ Chí Minh'

const CITY_ALIASES: Array<[RegExp, string]> = [
  [/^(ho chi minh|ho chi minh city|hồ chí minh|hồ chí minh city|tp\.?\s*hồ chí minh|thành phố hồ chí minh)$/i, HCM_CITY],
  [/^(saigon|sài gòn)$/i, HCM_CITY],
]

export function normalizeCityName(city: string | null | undefined): string | null {
  const trimmed = city?.trim()
  if (!trimmed) return null

  const normalized = trimmed.normalize('NFC')
  for (const [pattern, replacement] of CITY_ALIASES) {
    if (pattern.test(normalized)) return replacement
  }
  return normalized
}

export function normalizeAddress(address: string | null | undefined): string {
  return (address ?? '').replace(/\bHo Chi Minh City\b/gi, HCM_CITY)
}
