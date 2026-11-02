import type { Database } from '@/lib/supabase/types'

export type HotelProfileRow = Database['public']['Tables']['hotel_profile']['Row']

export type HotelProfile = {
  addressLine1: string
  addressLine2: string
  city: string
  email: string
  logoPath: string
  logoUrl: string
  name: string
  phone: string
  region: string
  updatedAt: string | null
  updatedBy: string
  website: string
}

function clean(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getDefaultHotelProfile(): HotelProfile {
  return {
    addressLine1: clean(process.env.NEXT_PUBLIC_HOTEL_ADDRESS_LINE_1),
    addressLine2: clean(process.env.NEXT_PUBLIC_HOTEL_ADDRESS_LINE_2),
    city: clean(process.env.NEXT_PUBLIC_HOTEL_CITY),
    email: clean(process.env.NEXT_PUBLIC_HOTEL_EMAIL),
    logoPath: '',
    logoUrl: '',
    name: 'University Hotel',
    phone: clean(process.env.NEXT_PUBLIC_HOTEL_PHONE),
    region: clean(process.env.NEXT_PUBLIC_HOTEL_REGION),
    updatedAt: null,
    updatedBy: '',
    website: clean(process.env.NEXT_PUBLIC_SITE_URL)
  }
}

export function buildHotelProfile(profile?: HotelProfileRow | null): HotelProfile {
  const fallback = getDefaultHotelProfile()

  if (!profile) {
    return fallback
  }

  return {
    addressLine1: clean(profile.address_line_1) || fallback.addressLine1,
    addressLine2: clean(profile.address_line_2) || fallback.addressLine2,
    city: clean(profile.city) || fallback.city,
    email: clean(profile.email) || fallback.email,
    logoPath: clean(profile.logo_path),
    logoUrl: clean(profile.logo_url),
    name: clean(profile.name) || fallback.name,
    phone: clean(profile.phone) || fallback.phone,
    region: clean(profile.region) || fallback.region,
    updatedAt: profile.updated_at,
    updatedBy: clean(profile.updated_by),
    website: clean(profile.website) || fallback.website
  }
}

export function toHotelProfileUpdate(profile: HotelProfile, updatedBy: string): Database['public']['Tables']['hotel_profile']['Update'] {
  return {
    address_line_1: clean(profile.addressLine1) || null,
    address_line_2: clean(profile.addressLine2) || null,
    city: clean(profile.city) || null,
    email: clean(profile.email) || null,
    logo_path: clean(profile.logoPath) || null,
    logo_url: clean(profile.logoUrl) || null,
    name: clean(profile.name) || 'University Hotel',
    phone: clean(profile.phone) || null,
    region: clean(profile.region) || null,
    updated_at: new Date().toISOString(),
    updated_by: clean(updatedBy) || 'system',
    website: clean(profile.website) || null
  }
}

export function getHotelAddressLines(profile: HotelProfile) {
  const lines = [profile.addressLine1, profile.addressLine2].filter((line) => line.length > 0)

  if (profile.city || profile.region) {
    lines.push([profile.city, profile.region].filter((line) => line.length > 0).join(', '))
  }

  if (lines.length === 0) {
    lines.push('Property address not configured')
  }

  return lines
}

export function getHotelContactLines(profile: HotelProfile) {
  return [profile.phone ? `Tel: ${profile.phone}` : null, profile.email ? `Email: ${profile.email}` : null, profile.website || null].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )
}