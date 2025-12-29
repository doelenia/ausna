import { User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  username: string
  email?: string
  full_name?: string
  avatar_url?: string
  created_at?: string
  updated_at?: string
}

export type AuthUser = User

