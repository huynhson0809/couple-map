const HCM_CITY = 'Thành phố Hồ Chí Minh'
const VIETNAM = 'Vietnam'

const ISO_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/)

const VN_PROVINCE_GROUPS: Array<[string, string[]]> = [
  ['Tuyên Quang', ['Tuyên Quang', 'Hà Giang']],
  ['Lào Cai', ['Lào Cai', 'Yên Bái']],
  ['Thái Nguyên', ['Thái Nguyên', 'Bắc Kạn']],
  ['Phú Thọ', ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình']],
  ['Bắc Ninh', ['Bắc Ninh', 'Bắc Giang']],
  ['Hưng Yên', ['Hưng Yên', 'Thái Bình']],
  ['Hải Phòng', ['Hải Phòng', 'Hải Dương']],
  ['Ninh Bình', ['Ninh Bình', 'Hà Nam', 'Nam Định']],
  ['Quảng Trị', ['Quảng Trị', 'Quảng Bình']],
  ['Đà Nẵng', ['Đà Nẵng', 'Đà Nẵng City', 'Da Nang', 'Quảng Nam']],
  ['Quảng Ngãi', ['Quảng Ngãi', 'Kon Tum']],
  ['Gia Lai', ['Gia Lai', 'Bình Định']],
  ['Khánh Hòa', ['Khánh Hòa', 'Ninh Thuận']],
  ['Lâm Đồng', ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận']],
  ['Đắk Lắk', ['Đắk Lắk', 'Đắc Lắc', 'Phú Yên']],
  [HCM_CITY, ['Thành phố Hồ Chí Minh', 'TP. Hồ Chí Minh', 'TP Hồ Chí Minh', 'Hồ Chí Minh', 'Ho Chi Minh City', 'Saigon', 'Sài Gòn', 'Bình Dương', 'Bà Rịa - Vũng Tàu', 'Bà Rịa-Vũng Tàu']],
  ['Đồng Nai', ['Đồng Nai', 'Bình Phước']],
  ['Tây Ninh', ['Tây Ninh', 'Long An']],
  ['Cần Thơ', ['Cần Thơ', 'Can Tho', 'Sóc Trăng', 'Hậu Giang']],
  ['Vĩnh Long', ['Vĩnh Long', 'Trà Vinh', 'Bến Tre']],
  ['Đồng Tháp', ['Đồng Tháp', 'Tiền Giang']],
  ['Cà Mau', ['Cà Mau', 'Bạc Liêu']],
  ['An Giang', ['An Giang', 'Kiên Giang']],
  ['Cao Bằng', ['Cao Bằng']],
  ['Điện Biên', ['Điện Biên']],
  ['Hà Tĩnh', ['Hà Tĩnh']],
  ['Lai Châu', ['Lai Châu']],
  ['Lạng Sơn', ['Lạng Sơn']],
  ['Nghệ An', ['Nghệ An']],
  ['Quảng Ninh', ['Quảng Ninh']],
  ['Thanh Hóa', ['Thanh Hóa']],
  ['Sơn La', ['Sơn La']],
  ['Hà Nội', ['Hà Nội', 'Ha Noi', 'Hanoi']],
  ['Huế', ['Huế', 'Thừa Thiên Huế', 'Hue']],
]

function keyOf(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\b(tinh|thanh pho|tp\.?|province|city)\b/gi, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const EN_COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })
const VI_COUNTRY_NAMES = new Intl.DisplayNames(['vi'], { type: 'region' })
const COUNTRY_CODE_BY_ALIAS = new Map<string, string>()
const CANONICAL_COUNTRY_BY_CODE = new Map<string, string>()

for (const code of ISO_COUNTRY_CODES) {
  const englishName = EN_COUNTRY_NAMES.of(code)
  const vietnameseName = VI_COUNTRY_NAMES.of(code)
  if (englishName) {
    CANONICAL_COUNTRY_BY_CODE.set(code, englishName)
    COUNTRY_CODE_BY_ALIAS.set(keyOf(englishName), code)
  }
  if (vietnameseName) COUNTRY_CODE_BY_ALIAS.set(keyOf(vietnameseName), code)
  COUNTRY_CODE_BY_ALIAS.set(keyOf(code), code)
}

const MANUAL_COUNTRY_ALIASES: Record<string, string> = {
  'united states of america': 'US',
  usa: 'US',
  uk: 'GB',
  'republic of korea': 'KR',
  'south korea': 'KR',
  'north korea': 'KP',
  'russian federation': 'RU',
  russia: 'RU',
  'socialist republic of viet nam': 'VN',
  'cong hoa xa hoi chu nghia viet nam': 'VN',
}

for (const [alias, code] of Object.entries(MANUAL_COUNTRY_ALIASES)) {
  COUNTRY_CODE_BY_ALIAS.set(keyOf(alias), code)
}

function countryCodeFromValue(country: string | null | undefined): string | null {
  const trimmed = country?.trim()
  if (!trimmed) return null
  return COUNTRY_CODE_BY_ALIAS.get(keyOf(trimmed)) ?? null
}

const VN_PROVINCE_ALIAS_MAP = new Map<string, string>()
for (const [canonical, aliases] of VN_PROVINCE_GROUPS) {
  VN_PROVINCE_ALIAS_MAP.set(keyOf(canonical), canonical)
  for (const alias of aliases) {
    VN_PROVINCE_ALIAS_MAP.set(keyOf(alias), canonical)
  }
}

function looksLikePostalCode(value: string) {
  return /^[0-9][0-9A-Z\- ]{2,9}$/i.test(value.trim())
}

function isCountrySegment(value: string) {
  const key = keyOf(value)
  return key === 'viet nam' || key === 'vietnam'
}

function normalizeSegment(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(tỉnh|thành phố|tp\.?|province|city)\s+/i, '')
    .trim()
}

export function normalizeCityName(
  city: string | null | undefined,
  country?: string | null,
  countryCode?: string | null,
): string | null {
  const trimmed = city?.trim()
  if (!trimmed) return null

  const normalized = trimmed.normalize('NFC')
  const normalizedCountry = normalizeCountryName(country, countryCode)
  const hasCountryContext = Boolean(country?.trim() || countryCode?.trim())
  if (hasCountryContext && normalizedCountry !== VIETNAM) return normalized

  return VN_PROVINCE_ALIAS_MAP.get(keyOf(normalized)) ?? normalized
}

export function normalizeCountryName(
  country: string | null | undefined,
  countryCode?: string | null,
): string | null {
  const trimmed = country?.trim()
  const normalizedCountryCode = countryCode?.trim().toUpperCase()

  const inferredCode = normalizedCountryCode || countryCodeFromValue(trimmed)
  const canonicalName = inferredCode
    ? CANONICAL_COUNTRY_BY_CODE.get(inferredCode)
    : null

  if (canonicalName) return canonicalName
  if (!trimmed) return null

  return trimmed.normalize('NFC')
}

export function localizeCountryName(
  country: string | null | undefined,
  language: string,
): string | null {
  const normalized = normalizeCountryName(country)
  if (!normalized) return null
  const code = countryCodeFromValue(normalized)
  if (!code) return normalized

  const locale = language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
  return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? normalized
}

export function normalizeAddress(
  address: string | null | undefined,
  language: string,
): string {
  const normalized = address ?? ''
  return language.toLowerCase().startsWith('vi')
    ? normalized.replace(/\bHo Chi Minh City\b/gi, HCM_CITY)
    : normalized
}

export function pickVietnamProvinceFromAddress(address: string | null | undefined): string | null {
  const parts = (address ?? '')
    .split(',')
    .map(normalizeSegment)
    .filter(Boolean)
    .filter((part) => !looksLikePostalCode(part) && !isCountrySegment(part))

  for (let i = parts.length - 1; i >= 0; i--) {
    const canonical = VN_PROVINCE_ALIAS_MAP.get(keyOf(parts[i]))
    if (canonical) return canonical
  }

  return null
}

export function pickVietnamProvinceFromParts(parts: Array<string | null | undefined>): string | null {
  for (const part of parts) {
    const canonical = pickVietnamProvinceFromAddress(part)
    if (canonical) return canonical
    const normalized = normalizeCityName(part)
    if (normalized && VN_PROVINCE_ALIAS_MAP.get(keyOf(normalized))) return normalized
  }
  return null
}

interface LocalityParts {
  address?: string | null
  country?: string | null
  countryCode?: string | null
  city?: string | null
  place?: string | null
  town?: string | null
  locality?: string | null
  municipality?: string | null
  village?: string | null
  district?: string | null
  county?: string | null
  state?: string | null
  province?: string | null
  region?: string | null
  hamlet?: string | null
}

export function pickLocalityName(parts: LocalityParts): string | null {
  const normalizedCountry = normalizeCountryName(parts.country, parts.countryCode)
  const vietnamProvince = pickVietnamProvinceFromParts([
    parts.state,
    parts.province,
    parts.region,
    parts.address,
    parts.city,
    parts.place,
    parts.locality,
    parts.district,
  ])
  const isVietnam =
    normalizedCountry === VIETNAM ||
    parts.countryCode?.trim().toUpperCase() === 'VN'

  if (vietnamProvince && (isVietnam || !normalizedCountry)) {
    return vietnamProvince
  }

  const candidates = isVietnam
    ? [
        parts.state,
        parts.province,
        parts.region,
        parts.city,
        parts.place,
        parts.locality,
        parts.district,
        parts.county,
      ]
    : [
        parts.city,
        parts.place,
        parts.town,
        parts.locality,
        parts.municipality,
        parts.village,
        parts.district,
        parts.county,
        parts.state,
        parts.province,
        parts.region,
        parts.hamlet,
      ]

  for (const candidate of candidates) {
    const normalized = normalizeCityName(
      candidate,
      normalizedCountry,
      parts.countryCode,
    )
    if (normalized) return normalized
  }

  return null
}
