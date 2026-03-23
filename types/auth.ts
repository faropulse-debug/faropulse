export type Role = 'owner' | 'manager' | 'viewer'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'enterprise'
}

export interface Membership {
  id: string
  user_id: string
  org_id: string
  location_id?: string
  role: Role
  is_active: boolean
  organization: Organization
}

export interface AuthUser {
  profile: UserProfile
  memberships: Membership[]
  /** The membership the user has selected for this session */
  activeMembership: Membership | null
}
