import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { reverseGeocode } from '../lib/geocoding'
import { normalizeAddress, normalizeCityName, normalizeCountryName } from '../lib/locationNames'
import { deletePinMedia } from '../lib/cloudinary-delete'
import { isVideoUrl } from '../lib/cloudinary'
import type { Pin, PinImage } from '../types'
import type { CloudinaryUploadResult } from '../lib/cloudinary'

export interface CreatePinInput {
  title: string
  note?: string
  category?: string | null
  marker_emoji?: string | null
  marker_image_url?: string | null
  lat: number
  lng: number
  address?: string | null
  city?: string | null
  country?: string | null
  images: CloudinaryUploadResult[]
}

export function usePins(coupleId: string | null | undefined, userId: string | undefined) {
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPins = useCallback(async () => {
    if (!coupleId) {
      setPins([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('pins')
      .select('*, images:pin_images(*)')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    setPins((data as Pin[]) ?? [])
    setLoading(false)
  }, [coupleId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPins()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchPins])

  const createPin = useCallback(
    async (input: CreatePinInput): Promise<Pin> => {
      if (!coupleId || !userId) throw new Error('Not in a couple')
      let address: string | null = null
      let city: string | null = null
      let country: string | null = null
      if (input.address !== undefined || input.city !== undefined || input.country !== undefined) {
        address = normalizeAddress(input.address) || null
        city = normalizeCityName(input.city)
        country = normalizeCountryName(input.country)
      } else {
        try {
          const geo = await reverseGeocode(input.lat, input.lng, 'vi')
          address = normalizeAddress(geo.address) || null
          city = normalizeCityName(geo.city)
          country = normalizeCountryName(geo.country)
        } catch {
          // best-effort
        }
      }

      const { data: pin, error: insErr } = await supabase
        .from('pins')
        .insert({
          couple_id: coupleId,
          created_by: userId,
          title: input.title,
          note: input.note ?? null,
          category: input.category ?? null,
          marker_emoji: input.marker_emoji ?? null,
          marker_image_url: input.marker_image_url ?? null,
          lat: input.lat,
          lng: input.lng,
          address,
          city,
          country,
        })
        .select()
        .single()
      if (insErr || !pin) throw insErr ?? new Error('Failed to create pin')

      let images: PinImage[] = []
      if (input.images.length > 0) {
        const rows = input.images.map((img, i) => ({
          pin_id: pin.id,
          cloudinary_url: img.url,
          cloudinary_public_id: img.publicId,
          width: img.width,
          height: img.height,
          sort_order: i,
        }))
        const { data: imgData, error: imgErr } = await supabase
          .from('pin_images')
          .insert(rows)
          .select()
        if (imgErr) throw imgErr
        images = (imgData as PinImage[]) ?? []
      }
      const newPin: Pin = { ...(pin as Pin), images }
      setPins((prev) => [newPin, ...prev])
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
    [coupleId, userId],
  )

  const deletePin = useCallback(async (id: string) => {
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
    setPins((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const updatePin = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Pin, 'title' | 'note' | 'category' | 'marker_emoji' | 'marker_image_url' | 'is_favorite'>>,
    ) => {
      const { data, error } = await supabase
        .from('pins')
        .update(patch)
        .eq('id', id)
        .select('*, images:pin_images(*)')
        .single()
      if (error) throw error
      setPins((prev) => prev.map((p) => (p.id === id ? (data as Pin) : p)))
      return data as Pin
    },
    [],
  )

  return { pins, loading, error, fetchPins, createPin, updatePin, deletePin, setPins }
}
