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
  is_favorite: boolean
  created_at: string
  updated_at: string
  images?: PinImage[]
  creator?: User
}

export interface PinReaction {
  pin_id: string
  user_id: string
  reaction: ReactionType
  created_at: string
}

export type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry'

export interface PinComment {
  id: string
  pin_id: string
  user_id: string
  parent_comment_id: string | null
  body: string
  created_at: string
  updated_at: string
  author?: User | null
}

export interface PinCommentReaction {
  comment_id: string
  user_id: string
  reaction: ReactionType
  created_at: string
}

export interface CoupleStreak {
  couple_id: string
  current_count: number
  best_count: number
  last_completed_date: string | null
  today_date: string
  today_user_a_posted: boolean
  today_user_b_posted: boolean
  today_completed: boolean
  timezone: string
  updated_at: string
}

export interface CoupleStreakDay {
  couple_id: string
  streak_date: string
  user_a_pin_count: number
  user_b_pin_count: number
  user_a_posted: boolean
  user_b_posted: boolean
  completed: boolean
  completed_at: string | null
  updated_at: string
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
