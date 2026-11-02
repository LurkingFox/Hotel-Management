alter type public.manager_approval_type add value if not exists 'guest_kyc_review';

update public.guest_profiles as profiles
set kyc_status = 'pending'
where profiles.kyc_status = 'not_started'
  and exists (
    select 1
    from public.guest_identity_documents as documents
    where documents.guest_profile_id = profiles.id
      and documents.status = 'pending'
  );