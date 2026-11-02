insert into public.manager_approvals (
  approval_type,
  booking_id,
  target_id,
  target_table,
  title,
  detail,
  requested_by,
  requested_by_role,
  metadata
)
select
  'guest_kyc_review',
  null,
  documents.id,
  'guest_identity_documents',
  concat('Review KYC for ', profiles.full_name),
  concat(
    profiles.full_name,
    ' submitted ',
    replace(documents.document_type::text, '_', ' '),
    ' ending ',
    right(documents.document_number, 4),
    ' for manager verification.'
  ),
  'system',
  'system',
  jsonb_build_object(
    'document_masked', case
      when char_length(documents.document_number) <= 4 then documents.document_number
      else repeat('*', greatest(char_length(documents.document_number) - 4, 0)) || right(documents.document_number, 4)
    end,
    'document_status', documents.status,
    'document_type', documents.document_type,
    'email', profiles.email,
    'guest_name', profiles.full_name,
    'guest_profile_id', profiles.id,
    'kyc_status', profiles.kyc_status,
    'nationality', profiles.nationality,
    'phone', profiles.phone
  )
from public.guest_identity_documents as documents
join public.guest_profiles as profiles
  on profiles.id = documents.guest_profile_id
where documents.status = 'pending'
  and not exists (
    select 1
    from public.manager_approvals as approvals
    where approvals.approval_type = 'guest_kyc_review'
      and approvals.target_table = 'guest_identity_documents'
      and approvals.target_id = documents.id
      and approvals.status = 'pending'
  );