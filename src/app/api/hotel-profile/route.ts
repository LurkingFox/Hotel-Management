import { NextRequest, NextResponse } from 'next/server'

import { buildHotelProfile, toHotelProfileUpdate, type HotelProfile } from '@/lib/hotel-info'
import { findSampleLogoById } from '@/lib/sample-logos'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

function getActorName(name: unknown, email: unknown) {
  if (typeof name === 'string' && name.trim().length > 0) {
    return name
  }

  if (typeof email === 'string' && email.trim().length > 0) {
    return email
  }

  return 'system'
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const { data, error } = await supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(buildHotelProfile(data))
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = (await request.json()) as Partial<HotelProfile>
    const actor = getActorName(user?.user_metadata?.name, user?.email)
    const { data: existing, error: existingError } = await supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const selectedSampleLogo = typeof body.logoPath === 'string' && body.logoPath.startsWith('sample:') ? findSampleLogoById(body.logoPath.slice('sample:'.length)) : null
    const existingProfile = buildHotelProfile(existing)
    const normalizedProfile: HotelProfile = {
      addressLine1: body.addressLine1 ?? existingProfile.addressLine1,
      addressLine2: body.addressLine2 ?? existingProfile.addressLine2,
      city: body.city ?? existingProfile.city,
      email: body.email ?? existingProfile.email,
      logoPath: selectedSampleLogo ? `sample:${selectedSampleLogo.id}` : body.logoPath ?? existingProfile.logoPath,
      logoUrl: selectedSampleLogo ? selectedSampleLogo.url : body.logoUrl ?? existingProfile.logoUrl,
      name: body.name ?? existingProfile.name,
      phone: body.phone ?? existingProfile.phone,
      region: body.region ?? existingProfile.region,
      updatedAt: null,
      updatedBy: actor,
      website: body.website ?? existingProfile.website
    }

    const { data, error } = await supabase
      .from('hotel_profile')
      .upsert({ id: true, ...toHotelProfileUpdate(normalizedProfile, actor) }, { onConflict: 'id' })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(buildHotelProfile(data))
  } catch (error) {
    return getErrorResponse(error)
  }
}