import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type ManagerApprovalRow = Database['public']['Tables']['manager_approvals']['Row']
type PayMethod = Database['public']['Enums']['pay_method']

type ApprovalPatchBody = {
  action?: 'approve' | 'reject'
  approvalId?: string
  note?: string
  payment?: {
    method?: PayMethod
    reference?: string | null
  }
}

function getActorName(name: unknown, email: unknown) {
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }

  if (typeof email === 'string' && email.trim().length > 0) {
    return email.trim()
  }

  return 'system'
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

function buildExtensionReviewMessage(values: {
  confirmationNote: string | null
  guestName: string
  manager: string
  newCheckOutExpected: string
  status: 'confirmed' | 'disputed'
}) {
  const statusLine = values.status === 'confirmed'
    ? `Manager ${values.manager} confirmed the stay extension for ${values.guestName} through ${values.newCheckOutExpected}.`
    : `Manager ${values.manager} marked the stay extension for ${values.guestName} as disputed.`

  return values.confirmationNote ? `${statusLine} Note: ${values.confirmationNote}` : statusLine
}

async function createNotification(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['notifications']['Insert']
) {
  const { error } = await supabase.from('notifications').insert(payload)

  if (error) {
    throw new Error(error.message)
  }
}

async function updateApprovalRecord(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  approval: ManagerApprovalRow,
  values: Database['public']['Tables']['manager_approvals']['Update']
) {
  const { error } = await supabase.from('manager_approvals').update(values).eq('id', approval.id)

  if (error) {
    throw new Error(error.message)
  }
}

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    if (user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
    }

    const { data, error } = await supabase.from('manager_approvals').select('*').order('requested_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    if (user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
    }

    const actor = getActorName(user.user_metadata?.name, user.email)
    const body = (await request.json()) as ApprovalPatchBody

    if (!body.approvalId || !body.action) {
      return NextResponse.json({ error: 'Approval id and action are required.' }, { status: 400 })
    }

    const { data: approval, error: approvalError } = await supabase.from('manager_approvals').select('*').eq('id', body.approvalId).single()

    if (approvalError || !approval) {
      return NextResponse.json({ error: approvalError?.message ?? 'Approval not found.' }, { status: 404 })
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: 'This approval has already been reviewed.' }, { status: 400 })
    }

    const reviewedAt = new Date().toISOString()
    const reviewNote = body.note?.trim() || null

    if (approval.approval_type === 'booking_extension') {
      const { data: extensionAudit, error: extensionAuditError } = await supabase
        .from('booking_extension_audits')
        .select('*')
        .eq('id', approval.target_id ?? '')
        .single()

      if (extensionAuditError || !extensionAudit) {
        return NextResponse.json({ error: extensionAuditError?.message ?? 'Extension audit not found.' }, { status: 404 })
      }

      if (extensionAudit.confirmation_status !== 'pending') {
        return NextResponse.json({ error: 'This stay extension has already been reviewed.' }, { status: 400 })
      }

      if (body.action === 'reject' && !reviewNote) {
        return NextResponse.json({ error: 'Add a discrepancy note before rejecting this extension.' }, { status: 400 })
      }

      const confirmationStatus = body.action === 'approve' ? 'confirmed' : 'disputed'
      const managerNote = reviewNote ?? 'Manager confirmed the extension.'

      const { error: reviewError } = await supabase
        .from('booking_extension_audits')
        .update({
          confirmation_note: managerNote,
          confirmation_status: confirmationStatus,
          confirmed_at: reviewedAt,
          confirmed_by: actor
        })
        .eq('id', extensionAudit.id)

      if (reviewError) {
        return NextResponse.json({ error: reviewError.message }, { status: 500 })
      }

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, guest_name')
        .eq('id', extensionAudit.booking_id)
        .single()

      if (bookingError || !booking) {
        return NextResponse.json({ error: bookingError?.message ?? 'Extension review saved but booking could not be loaded.' }, { status: 500 })
      }

      const reviewMessage = buildExtensionReviewMessage({
        confirmationNote: confirmationStatus === 'confirmed' ? reviewNote : managerNote,
        guestName: booking.guest_name,
        manager: actor,
        newCheckOutExpected: extensionAudit.new_check_out_expected,
        status: confirmationStatus
      })

      await updateApprovalRecord(supabase, approval, {
        review_note: managerNote,
        reviewed_at: reviewedAt,
        reviewed_by: actor,
        status: confirmationStatus === 'confirmed' ? 'approved' : 'rejected'
      })

      await createNotification(supabase, {
        booking_id: booking.id,
        message: reviewMessage,
        triggered_by: actor,
        type: confirmationStatus === 'confirmed' ? 'extension_confirmation_confirmed' : 'extension_confirmation_disputed'
      })

      return NextResponse.json({ message: reviewMessage, success: true })
    }

    if (approval.approval_type === 'service_receipt_confirmation') {
      const { data: charge, error: chargeError } = await supabase.from('service_charges').select('*').eq('id', approval.target_id ?? '').single()

      if (chargeError || !charge) {
        return NextResponse.json({ error: chargeError?.message ?? 'Service charge not found.' }, { status: 404 })
      }

      if (body.action === 'reject') {
        if (!reviewNote) {
          return NextResponse.json({ error: 'Add a rejection note before rejecting this approval.' }, { status: 400 })
        }

        await updateApprovalRecord(supabase, approval, {
          review_note: reviewNote,
          reviewed_at: reviewedAt,
          reviewed_by: actor,
          status: 'rejected'
        })

        await createNotification(supabase, {
          booking_id: approval.booking_id,
          message: `Service receipt confirmation was rejected by ${actor}. Note: ${reviewNote}`,
          triggered_by: actor,
          type: 'service_charge_receipt_rejected'
        })

        return NextResponse.json({ success: true })
      }

      if (!charge.booking_id) {
        return NextResponse.json({ error: 'This service charge is not attached to a booking.' }, { status: 400 })
      }

      if (!body.payment?.method) {
        return NextResponse.json({ error: 'Payment method is required to approve the receipt.' }, { status: 400 })
      }

      if (body.payment.method !== 'cash' && !body.payment.reference?.trim()) {
        return NextResponse.json({ error: 'Reference is required for non-cash receipt approval.' }, { status: 400 })
      }

      if (charge.payment_confirmed) {
        return NextResponse.json({ error: 'Receipt has already been confirmed for this service charge.' }, { status: 400 })
      }

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          amount_ghs: charge.amount_ghs,
          booking_id: charge.booking_id,
          method: body.payment.method,
          reference: body.payment.reference?.trim() || null,
          received_by: actor
        })
        .select('*')
        .single()

      if (paymentError) {
        return NextResponse.json({ error: paymentError.message }, { status: 500 })
      }

      const { error: chargeUpdateError } = await supabase
        .from('service_charges')
        .update({
          payment_confirmed: true,
          payment_confirmed_at: reviewedAt,
          payment_confirmed_by: actor,
          payment_id: payment.id,
          resolved: true,
          resolved_at: charge.resolved_at ?? reviewedAt,
          resolved_by: charge.resolved_by ?? actor
        })
        .eq('id', charge.id)

      if (chargeUpdateError) {
        return NextResponse.json({ error: chargeUpdateError.message }, { status: 500 })
      }

      await updateApprovalRecord(supabase, approval, {
        review_note: reviewNote ?? `Receipt approved using ${body.payment.method.replaceAll('_', ' ')}.`,
        reviewed_at: reviewedAt,
        reviewed_by: actor,
        status: 'approved'
      })

      await createNotification(supabase, {
        booking_id: approval.booking_id,
        message: `Receipt confirmed for GHS ${charge.amount_ghs.toLocaleString('en-GH')} using ${body.payment.method.replaceAll('_', ' ')}.`,
        triggered_by: actor,
        type: 'service_charge_receipt_confirmed'
      })

      return NextResponse.json({ success: true })
    }

    if (approval.approval_type === 'guest_kyc_review') {
      const { data: document, error: documentError } = await supabase
        .from('guest_identity_documents')
        .select('*')
        .eq('id', approval.target_id ?? '')
        .single()

      if (documentError || !document) {
        return NextResponse.json({ error: documentError?.message ?? 'Identity document not found.' }, { status: 404 })
      }

      if (document.status !== 'pending') {
        return NextResponse.json({ error: 'This KYC review has already been resolved.' }, { status: 400 })
      }

      const { data: profile, error: profileError } = await supabase
        .from('guest_profiles')
        .select('id, full_name, kyc_notes')
        .eq('id', document.guest_profile_id)
        .single()

      if (profileError || !profile) {
        return NextResponse.json({ error: profileError?.message ?? 'Guest profile not found.' }, { status: 404 })
      }

      if (body.action === 'reject' && !reviewNote) {
        return NextResponse.json({ error: 'Add a review note before rejecting guest KYC.' }, { status: 400 })
      }

      const nextDocumentStatus = body.action === 'approve' ? 'verified' : 'rejected'
      const nextProfileStatus = body.action === 'approve' ? 'verified' : 'rejected'

      const { error: documentUpdateError } = await supabase
        .from('guest_identity_documents')
        .update({
          status: nextDocumentStatus,
          verification_notes: reviewNote ?? document.verification_notes,
          verified_at: body.action === 'approve' ? reviewedAt : null,
          verified_by: body.action === 'approve' ? actor : null
        })
        .eq('id', document.id)

      if (documentUpdateError) {
        return NextResponse.json({ error: documentUpdateError.message }, { status: 500 })
      }

      const { error: profileUpdateError } = await supabase
        .from('guest_profiles')
        .update({
          kyc_notes: reviewNote ?? profile.kyc_notes,
          kyc_status: nextProfileStatus
        })
        .eq('id', profile.id)

      if (profileUpdateError) {
        return NextResponse.json({ error: profileUpdateError.message }, { status: 500 })
      }

      await updateApprovalRecord(supabase, approval, {
        review_note: reviewNote ?? (body.action === 'approve' ? 'Guest KYC verified.' : 'Guest KYC rejected.'),
        reviewed_at: reviewedAt,
        reviewed_by: actor,
        status: body.action === 'approve' ? 'approved' : 'rejected'
      })

      await createNotification(supabase, {
        booking_id: null,
        message:
          body.action === 'approve'
            ? `Guest KYC for ${profile.full_name} was verified by ${actor}.`
            : `Guest KYC for ${profile.full_name} was rejected by ${actor}. Note: ${reviewNote}`,
        triggered_by: actor,
        type: body.action === 'approve' ? 'guest_kyc_verified' : 'guest_kyc_rejected'
      })

      return NextResponse.json({
        message:
          body.action === 'approve'
            ? `Guest KYC for ${profile.full_name} has been verified.`
            : `Guest KYC for ${profile.full_name} has been rejected.`,
        success: true
      })
    }

    return NextResponse.json({ error: 'This approval type is not supported by the shared approvals route yet.' }, { status: 400 })
  } catch (error) {
    return getErrorResponse(error)
  }
}