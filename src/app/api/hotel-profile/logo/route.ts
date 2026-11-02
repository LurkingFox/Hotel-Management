import { NextRequest, NextResponse } from 'next/server'

import { buildHotelProfile } from '@/lib/hotel-info'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

const allowedContentTypes = new Set(['image/jpeg', 'image/png'])
const maxFileSizeBytes = 2 * 1024 * 1024

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

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Logo file is required.' }, { status: 400 })
    }

    if (!allowedContentTypes.has(file.type)) {
      return NextResponse.json({ error: 'Only PNG and JPEG logos are supported.' }, { status: 400 })
    }

    if (file.size > maxFileSizeBytes) {
      return NextResponse.json({ error: 'Logo must be 2 MB or smaller.' }, { status: 400 })
    }

    const actor = getActorName(user?.user_metadata?.name, user?.email)
    const { data: existing, error: existingError } = await supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const extension = file.type === 'image/png' ? 'png' : 'jpg'
    const filePath = `branding/hotel-logo.${extension}`
    const fileBytes = new Uint8Array(await file.arrayBuffer())

    if (existing?.logo_path && !existing.logo_path.startsWith('sample:') && existing.logo_path !== filePath) {
      await supabase.storage.from('hotel-assets').remove([existing.logo_path])
    }

    const { error: uploadError } = await supabase.storage.from('hotel-assets').upload(filePath, fileBytes, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true
    })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: publicUrlData } = supabase.storage.from('hotel-assets').getPublicUrl(filePath)
    const { data: updated, error: updateError } = await supabase
      .from('hotel_profile')
      .upsert(
        {
          id: true,
          logo_path: filePath,
          logo_url: publicUrlData.publicUrl,
          name: existing?.name ?? 'University Hotel',
          updated_at: new Date().toISOString(),
          updated_by: actor
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json(buildHotelProfile(updated))
  } catch (error) {
    return getErrorResponse(error)
  }
}