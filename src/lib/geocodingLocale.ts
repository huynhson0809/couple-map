export function resolveGeocodingLanguage(language?: string): string {
  const explicit = language?.trim();
  if (explicit) return explicit.split(/[-_]/)[0].toLowerCase();

  if (typeof document !== "undefined") {
    const documentLanguage = document.documentElement.lang.trim();
    if (documentLanguage) {
      return documentLanguage.split(/[-_]/)[0].toLowerCase();
    }
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language.split(/[-_]/)[0].toLowerCase();
  }

  return "en";
}
