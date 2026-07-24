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
`.trim().split(/\s+/);

function countryKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ENGLISH_COUNTRIES = new Intl.DisplayNames(["en"], { type: "region" });
const VIETNAMESE_COUNTRIES = new Intl.DisplayNames(["vi"], { type: "region" });
const COUNTRY_BY_ALIAS = new Map<string, string>();

for (const code of ISO_COUNTRY_CODES) {
  const englishName = ENGLISH_COUNTRIES.of(code);
  const vietnameseName = VIETNAMESE_COUNTRIES.of(code);
  if (!englishName) continue;

  COUNTRY_BY_ALIAS.set(countryKey(code), englishName);
  COUNTRY_BY_ALIAS.set(countryKey(englishName), englishName);
  if (vietnameseName) {
    COUNTRY_BY_ALIAS.set(countryKey(vietnameseName), englishName);
  }
}

const MANUAL_ALIASES: Record<string, string> = {
  "united states of america": "United States",
  usa: "United States",
  uk: "United Kingdom",
  "republic of korea": "South Korea",
  "russian federation": "Russia",
  "socialist republic of viet nam": "Vietnam",
};

for (const [alias, canonical] of Object.entries(MANUAL_ALIASES)) {
  COUNTRY_BY_ALIAS.set(countryKey(alias), canonical);
}

export function canonicalCountryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return COUNTRY_BY_ALIAS.get(countryKey(trimmed)) ?? trimmed.normalize("NFC");
}

export function canonicalCountryList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const countries = new Map<string, string>();
  for (const item of value) {
    const canonical = canonicalCountryName(item);
    if (canonical) countries.set(countryKey(canonical), canonical);
  }
  return Array.from(countries.values()).sort((a, b) => a.localeCompare(b, "en"));
}
