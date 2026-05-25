const HCM_CITY = 'Thành phố Hồ Chí Minh'

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

export function normalizeCityName(city: string | null | undefined): string | null {
  const trimmed = city?.trim()
  if (!trimmed) return null

  const normalized = trimmed.normalize('NFC')
  return VN_PROVINCE_ALIAS_MAP.get(keyOf(normalized)) ?? normalized
}

export function normalizeAddress(address: string | null | undefined): string {
  return (address ?? '').replace(/\bHo Chi Minh City\b/gi, HCM_CITY)
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
