export interface User {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  couple_id: string | null
  created_at: string
}

export interface Couple {
  id: string
  invite_code: string
  user_a: string
  user_b: string | null
  anniversary_date: string | null
  background_image_url: string | null
  created_at: string
}

export interface Pin {
  id: string
  couple_id: string
  created_by: string
  title: string
  note: string | null
  lat: number
  lng: number
  address: string | null
  city: string | null
  country: string | null
  category: string | null
  marker_emoji: string | null
  marker_image_url: string | null
  created_at: string
  updated_at: string
  images?: PinImage[]
  creator?: User
}

export interface PinImage {
  id: string
  pin_id: string
  cloudinary_url: string
  cloudinary_public_id: string | null
  width: number | null
  height: number | null
  sort_order: number
  created_at: string
}

export interface Collection {
  id: string
  couple_id: string
  title: string
  description: string | null
  cover_image_url: string | null
  date_from: string | null
  date_to: string | null
  created_at: string
  pins?: Pin[]
}

export interface BucketListItem {
  id: string
  couple_id: string
  created_by: string
  title: string
  lat: number
  lng: number
  status: 'dream' | 'done'
  completed_pin_id: string | null
  created_at: string
}
