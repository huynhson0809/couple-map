import { translate, type Lang } from '../hooks/I18nContext'

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return ''
}

export function localizedSpaceError(error: unknown, lang: Lang) {
  const message = errorText(error).toLowerCase()

  if (message.includes('space_quota_reached') || message.includes('owned space limit reached')) {
    return translate(lang, 'settings.spaceQuotaCreateOnly')
  }
  if (message.includes('space_read_only') || message.includes('map is read-only')) {
    return translate(lang, 'settings.spaceReadOnlyBannerTitle')
  }
  if (message.includes('space_invite_not_found') || message.includes('invite code not found')) {
    return translate(lang, 'settings.spaceInviteInvalid')
  }
  if (message.includes('space_full') || message.includes('space is full')) {
    return translate(lang, 'settings.spaceFull')
  }
  if (
    message.includes('space_invite_owner_required') ||
    message.includes('only space owners')
  ) {
    return translate(lang, 'settings.spaceInviteOwnerOnly')
  }
  return translate(lang, 'settings.spaceActionError')
}
