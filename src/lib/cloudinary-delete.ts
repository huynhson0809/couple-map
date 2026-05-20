import { supabase } from './supabase'

export interface CloudinaryDeleteAsset {
  id: string
  publicId: string
  resourceType: 'image' | 'video'
}

export async function deletePinMedia(assets: CloudinaryDeleteAsset[]) {
  if (assets.length === 0) return
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('You must be signed in to delete media')
  }

  const { error } = await supabase.functions.invoke('delete-pin-media', {
    body: { assets },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const details = await context.json().catch(() => null)
      if (details?.error) {
        throw new Error(details.details ? `${details.error}: ${JSON.stringify(details.details)}` : details.error)
      }
    }
    throw new Error(error.message)
  }
}
