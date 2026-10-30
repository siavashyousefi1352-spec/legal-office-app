-- Deployment script, NOT automatically executed. Run during the coordinated rollout.
-- No existing files are moved/deleted, and profile-avatars remains public for avatars.
begin;
do $$ begin
  if exists(select 1 from public.profiles where signature_path is not null)
     or exists(select 1 from storage.objects where bucket_id='profile-avatars' and name ~ '/signature-') then
    raise exception 'Legacy signatures found: inventory and migrate privately before rollout';
  end if;
  if exists(select 1 from storage.buckets where id='profile-signatures') then
    raise exception 'Bucket already exists: review configuration before applying';
  end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-signatures','profile-signatures',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy signatures_read_own on storage.objects for select to authenticated
using(bucket_id='profile-signatures' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy signatures_insert_own on storage.objects for insert to authenticated
with check(bucket_id='profile-signatures' and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]+/signature-[0-9a-f-]+\.(png|jpg|webp)$');
create policy signatures_delete_own on storage.objects for delete to authenticated
using(bucket_id='profile-signatures' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Immutable objects: intentionally no UPDATE/upsert permission and no admin exception.
-- Prevent an old client from continuing to upload signatures into the public bucket.
create policy signatures_no_public_insert on storage.objects as restrictive for insert to authenticated
with check(not(bucket_id='profile-avatars' and name ~ '/signature-'));
create policy signatures_no_public_update on storage.objects as restrictive for update to authenticated
using(not(bucket_id='profile-avatars' and name ~ '/signature-'))
with check(not(bucket_id='profile-avatars' and name ~ '/signature-'));

-- Validate every write, including existing SECURITY DEFINER RPCs and admin updates.
-- Invoker function; no new privilege bypass. It inherits the caller's object visibility.
create schema signature_private;
revoke all on schema signature_private from public,anon,authenticated;
grant usage on schema signature_private to authenticated;
create function signature_private.validate_signature_reference() returns trigger language plpgsql
set search_path='' as $$
begin
  if new.signature_path is not null and
     (tg_op='INSERT' or new.signature_path is distinct from old.signature_path) then
    if new.signature_path !~ ('^profile-signatures/'||new.id::text||'/signature-[0-9a-f-]+\.(png|jpg|webp)$')
       or not exists(select 1 from storage.objects o where o.bucket_id='profile-signatures'
          and o.name=substring(new.signature_path from length('profile-signatures/')+1)) then
      raise exception 'invalid_signature_reference';
    end if;
  end if;
  return new;
end $$;
revoke all on function signature_private.validate_signature_reference() from public,anon,authenticated;
create trigger validate_signature_reference before insert or update of signature_path on public.profiles
for each row execute function signature_private.validate_signature_reference();

-- SECURITY INVOKER relies on existing profile RLS; ordinary users currently have no
-- direct UPDATE policy, so reuse the existing self-only SECURITY DEFINER setter after
-- locking/checking the caller's own row. No arbitrary profile ID can be supplied.
create function signature_private.clear_my_signature(p_expected_path text) returns void language plpgsql
security definer set search_path='' as $$
declare v_current text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select signature_path into v_current from public.profiles where id=auth.uid() for update;
  if not found or v_current is distinct from p_expected_path then
    raise exception 'signature_changed_refresh_required';
  end if;
  update public.profiles set signature_path=null where id=auth.uid();
end $$;
revoke all on function signature_private.clear_my_signature(text) from public,anon;
grant execute on function signature_private.clear_my_signature(text) to authenticated;
-- Exposed wrapper has no privilege escalation; internal implementation checks auth.uid().
create function public.clear_my_signature(p_expected_path text) returns void language sql
security invoker set search_path='' as $$
  select signature_private.clear_my_signature(p_expected_path);
$$;
revoke all on function public.clear_my_signature(text) from public,anon;
grant execute on function public.clear_my_signature(text) to authenticated;
-- Existing setters already target auth.uid(); remove anonymous execution explicitly.
revoke execute on function public.set_my_signature(text) from public,anon;
grant execute on function public.set_my_signature(text) to authenticated;
revoke execute on function public.update_my_personal_profile(text,text,text,text,text,text) from public,anon;
grant execute on function public.update_my_personal_profile(text,text,text,text,text,text) to authenticated;
commit;
