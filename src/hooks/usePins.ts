import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { reverseGeocode } from '../lib/geocoding'
import { normalizeAddress, normalizeCityName, normalizeCountryName } from '../lib/locationNames'
import { deletePinMedia } from '../lib/cloudinary-delete'
import { isVideoUrl } from '../lib/cloudinary'
import { normalizeCategoryIds } from '../lib/pinCategories'
import type { Pin, PinImage } from '../types'
import type { CloudinaryUploadResult } from '../lib/cloudinary'

const PIN_SELECT_WITH_CATEGORIES =
  'id, couple_id, space_id, created_by, title, note, lat, lng, address, city, country, category, marker_emoji, marker_image_url, is_favorite, created_at, updated_at, categories:pin_categories(pin_id,couple_id,category_id,position,created_at)'
const PIN_SELECT_WITH_IMAGES_AND_CATEGORIES = `${PIN_SELECT_WITH_CATEGORIES}, images:pin_images(*)`

export interface CreatePinInput {
  title: string
  note?: string
  category?: string | null
  categoryIds?: string[]
  marker_emoji?: string | null
  marker_image_url?: string | null
  lat: number
  lng: number
  address?: string | null
  city?: string | null
  country?: string | null
  images: CloudinaryUploadResult[]
}

export function usePins(
  spaceId: string | null | undefined,
  userId: string | undefined,
  writable = true,
  language: string,
) {
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeSpaceIdRef = useRef(spaceId)
  const activeUserIdRef = useRef(userId)
  const fetchRequestIdRef = useRef(0)

  useLayoutEffect(() => {
    activeSpaceIdRef.current = spaceId
    activeUserIdRef.current = userId
    fetchRequestIdRef.current += 1
  }, [spaceId, userId])

  const fetchPinWithRelations = useCallback(async (pinId: string): Promise<Pin> => {
    const { data, error } = await supabase
      .from('pins')
      .select(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES)
      .eq('id', pinId)
      .order('position', { referencedTable: 'categories', ascending: true })
      .order('sort_order', { referencedTable: 'images', ascending: true })
      .single()
    if (error || !data) throw error ?? new Error('Failed to fetch pin')
    return data as Pin
  }, [])

  const fetchPins = useCallback(async () => {
    const targetSpaceId = spaceId
    const targetUserId = userId
    const requestId = ++fetchRequestIdRef.current
    const isCurrentRequest = () =>
      requestId === fetchRequestIdRef.current &&
      activeSpaceIdRef.current === targetSpaceId &&
      activeUserIdRef.current === targetUserId

    if (!targetSpaceId) {
      if (isCurrentRequest()) {
        setPins([])
        setError(null)
        setLoading(false)
      }
      return
    }
    setLoading(true)
    setError(null)

    try {
      // Only fetch fields needed for map markers and stats.
      const { data, error: fetchError } = await supabase
        .from('pins')
        .select(PIN_SELECT_WITH_CATEGORIES)
        .eq('space_id', targetSpaceId)
        .order('position', { referencedTable: 'categories', ascending: true })
        .order('created_at', { ascending: false })
      if (!isCurrentRequest()) return
      if (fetchError) throw fetchError
      setPins(((data as Pin[]) ?? []).map((p) => ({ ...p, images: undefined })))
    } catch (fetchError) {
      if (!isCurrentRequest()) return
      console.error('Failed to load pins:', fetchError)
      setPins([])
      setError('pins_load_failed')
    } finally {
      if (isCurrentRequest()) setLoading(false)
    }
  }, [spaceId, userId])

  /** Fetch images for a single pin on-demand */
  const fetchPinImages = useCallback(async (pinId: string): Promise<PinImage[]> => {
    const targetSpaceId = activeSpaceIdRef.current
    const targetUserId = activeUserIdRef.current
    const { data, error: imageError } = await supabase
      .from('pin_images')
      .select('*')
      .eq('pin_id', pinId)
      .order('sort_order', { ascending: true })
    if (
      activeSpaceIdRef.current !== targetSpaceId ||
      activeUserIdRef.current !== targetUserId
    ) return []
    if (imageError) {
      console.error('Failed to load pin media:', imageError)
      throw new Error('pin_images_load_failed', { cause: imageError })
    }
    const images = (data as PinImage[]) ?? []
    setPins((prev) => prev.map((p) => (p.id === pinId ? { ...p, images } : p)))
    return images
  }, [])

  const createPin = useCallback(
    async (input: CreatePinInput): Promise<Pin> => {
      if (!spaceId || !userId) throw new Error('Not in a space')
      if (!writable) throw new Error('space_read_only')
      const targetSpaceId = spaceId
      const targetUserId = userId
      let address: string | null = null
      let city: string | null = null
      let country: string | null = null
      if (input.address !== undefined || input.city !== undefined || input.country !== undefined) {
        address = normalizeAddress(input.address, language) || null
        country = normalizeCountryName(input.country)
        city = normalizeCityName(input.city, country)
      } else {
        try {
          const geo = await reverseGeocode(input.lat, input.lng, language)
          address = normalizeAddress(geo.address, language) || null
          country = normalizeCountryName(geo.country)
          city = normalizeCityName(geo.city, country)
        } catch {
          // best-effort
        }
      }

      if (
        activeSpaceIdRef.current !== targetSpaceId ||
        activeUserIdRef.current !== targetUserId
      ) throw new Error('space_changed')

      const normalizedCategoryIds = normalizeCategoryIds(input.categoryIds ?? [input.category])

      const { data: pinId, error: insErr } = await supabase
        .rpc('create_pin_with_categories', {
          in_couple_id: spaceId,
          in_created_by: userId,
          in_title: input.title,
          in_note: input.note ?? null,
          in_category_ids: normalizedCategoryIds,
          in_marker_emoji: input.marker_emoji ?? null,
          in_marker_image_url: input.marker_image_url ?? null,
          in_lat: input.lat,
          in_lng: input.lng,
          in_address: address,
          in_city: city,
          in_country: country,
        })
      if (insErr || !pinId) throw insErr ?? new Error('pin_create_failed')

      if (input.images.length > 0) {
        const rows = input.images.map((img, i) => ({
          pin_id: pinId as string,
          cloudinary_url: img.url,
          cloudinary_public_id: img.publicId,
          width: img.width,
          height: img.height,
          sort_order: i,
        }))
        const { error: imgErr } = await supabase
          .from('pin_images')
          .insert(rows)
        if (imgErr) throw imgErr
      }
      const newPin = await fetchPinWithRelations(pinId as string)
      if (
        activeSpaceIdRef.current === targetSpaceId &&
        activeUserIdRef.current === targetUserId
      ) {
        setPins((prev) => [newPin, ...prev])
      }
      supabase.functions.invoke('send-push', {
        body: {
          event_type: 'memory_added',
          record: newPin,
        },
      }).then(({ error }) => {
        if (error) console.warn('send-push memory failed:', error.message)
      })
      return newPin
    },
    [spaceId, fetchPinWithRelations, language, userId, writable],
  )

  const deletePin = useCallback(async (id: string) => {
    if (!writable) throw new Error('space_read_only')
    const targetSpaceId = activeSpaceIdRef.current
    const targetUserId = activeUserIdRef.current
    // Fetch images before deleting so we can clean up Cloudinary
    const { data: images } = await supabase
      .from('pin_images')
      .select('id, cloudinary_public_id, cloudinary_url')
      .eq('pin_id', id)

    // Delete Cloudinary assets BEFORE deleting the pin (edge function verifies ownership via pin_images rows)
    const assets = (images ?? [])
      .filter((img) => img.cloudinary_public_id)
      .map((img) => ({
        id: img.id,
        publicId: img.cloudinary_public_id!,
        resourceType: isVideoUrl(img.cloudinary_url) ? 'video' as const : 'image' as const,
      }))
    if (assets.length > 0) {
      await deletePinMedia(assets).catch((err) =>
        console.warn('Failed to delete Cloudinary assets:', err),
      )
    }

    const { error } = await supabase.from('pins').delete().eq('id', id)
    if (error) throw error
    if (
      activeSpaceIdRef.current === targetSpaceId &&
      activeUserIdRef.current === targetUserId
    ) {
      setPins((prev) => prev.filter((p) => p.id !== id))
    }
  }, [writable])

  const updatePin = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Pin, 'title' | 'note' | 'category' | 'marker_emoji' | 'marker_image_url' | 'is_favorite'>> & {
        categoryIds?: string[]
      },
    ) => {
      if (!writable) throw new Error('space_read_only')
      const targetSpaceId = activeSpaceIdRef.current
      const targetUserId = activeUserIdRef.current
      const { categoryIds, ...pinPatch } = patch
      const categoryIdsForRpc =
        categoryIds !== undefined
          ? categoryIds
          : pinPatch.category !== undefined
            ? [pinPatch.category]
            : undefined
      const shouldUseCategoryRpc = categoryIdsForRpc !== undefined
      let updatedPin: Pin

      if (shouldUseCategoryRpc) {
        const normalizedCategoryIds = normalizeCategoryIds(categoryIdsForRpc)
        const hasTitle = Object.prototype.hasOwnProperty.call(pinPatch, 'title')
        const hasNote = Object.prototype.hasOwnProperty.call(pinPatch, 'note')
        const hasMarkerEmoji = Object.prototype.hasOwnProperty.call(pinPatch, 'marker_emoji')
        const hasMarkerImageUrl = Object.prototype.hasOwnProperty.call(pinPatch, 'marker_image_url')
        const { error } = await supabase.rpc('update_pin_with_categories', {
          in_pin_id: id,
          in_title: hasTitle ? pinPatch.title ?? null : null,
          in_note: hasNote ? pinPatch.note ?? null : null,
          in_category_ids: normalizedCategoryIds,
          in_marker_emoji: hasMarkerEmoji ? pinPatch.marker_emoji ?? null : null,
          in_marker_image_url: hasMarkerImageUrl ? pinPatch.marker_image_url ?? null : null,
          in_title_set: hasTitle,
          in_note_set: hasNote,
          in_marker_emoji_set: hasMarkerEmoji,
          in_marker_image_url_set: hasMarkerImageUrl,
        })
        if (error) throw error

        if (pinPatch.is_favorite !== undefined) {
          const { error: favoriteErr } = await supabase
            .from('pins')
            .update({ is_favorite: pinPatch.is_favorite })
            .eq('id', id)
          if (favoriteErr) throw favoriteErr
        }

        updatedPin = await fetchPinWithRelations(id)
      } else {
        const { data, error } = await supabase
          .from('pins')
          .update(pinPatch)
          .eq('id', id)
          .select(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES)
          .order('position', { referencedTable: 'categories', ascending: true })
          .order('sort_order', { referencedTable: 'images', ascending: true })
          .single()
        if (error) throw error
        updatedPin = data as Pin
      }
      if (
        activeSpaceIdRef.current === targetSpaceId &&
        activeUserIdRef.current === targetUserId
      ) {
        setPins((prev) => prev.map((p) => (p.id === id ? updatedPin : p)))
      }
      if (patch.is_favorite === true && userId) {
        supabase.functions.invoke('send-push', {
          body: {
            event_type: 'favorite',
            record: { id, user_id: userId },
          },
        }).then(({ error }) => {
          if (error) console.warn('send-push favorite failed:', error.message)
        })
      }
      return updatedPin
    },
    [fetchPinWithRelations, userId, writable],
  )

  return { pins, loading, error, fetchPins, fetchPinImages, createPin, updatePin, deletePin, setPins }
}
