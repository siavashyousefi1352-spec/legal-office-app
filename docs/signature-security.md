# Private user signatures

## Verified 2026-10-30, before deployment

Read-only queries against the project configured in index.html confirmed:

- `profile-avatars` is public. Its INSERT/UPDATE/DELETE policies allow the user's UUID folder OR `is_admin()`. No SELECT policy exists for it; public downloads nevertheless bypass read RLS.
- `storage.objects` has RLS enabled. No policy granting general access across all buckets was found.
- Zero profiles have a non-null signature_path and zero Storage objects match the current `/signature-` naming convention. This does not prove that no historical exposure occurred, nor inventory files with other naming conventions. No image bytes were fetched.
- `set_my_signature` and `update_my_personal_profile` are SECURITY DEFINER and target auth.uid(), but accept unvalidated signature paths.
- Old removal only clears the profile reference. Old replacement also leaves the previous object behind.

## Change and limits

New references are `profile-signatures/<auth-user-uuid>/signature-<random-uuid>.<extension>`. The dedicated bucket is private. Owner-only SELECT/INSERT/DELETE policies enforce authorization on the server; no admin exception or UPDATE permission is added. The frontend signs for 60 seconds and removes the preview when its link expires or on logout. Links are bearer credentials: anyone receiving one can use it until expiry; logout alone does not revoke an issued URL. Do not log, persist, or share signed URLs. Browser downloads/screenshots cannot be revoked.

The database trigger validates ownership and object existence even when an older RPC or direct admin update writes the reference. Normal profile saves no longer submit a cached signature path. Legacy public references fail closed in the new UI.

Deletion conditionally unlinks the expected signature before calling Storage.remove. A stale tab cannot clear a replacement. File deletion failure, including an empty deletion result, displays an explicit incomplete-cleanup warning. A failure/crash after unlink can still leave a private orphan; this is NOT a transactional or automatic guaranteed cleanup system. Replacement and ambiguous upload/RPC failures deliberately preserve files to avoid deleting a successful concurrent commit. Operators must reconcile these private orphans, with a retention period and audit trail. Never delete storage.objects rows with SQL: use the Storage API to delete actual bytes. Never bulk-delete from filename patterns alone.

## Coordinated rollout (not yet applied)

1. Use a maintenance window to pause signature operations and refresh the audit. The SQL intentionally aborts if any current or conventionally named legacy signature exists, or the target bucket already exists. If signatures have appeared, stop: inventory references server-side, copy bytes to private paths, validate copies and update references before considering any old-file deletion. Do not make the avatar bucket private without converting avatar rendering too.
2. A project Owner/Admin or a narrowly authorized database deployment operator runs `sql/private-signatures.sql` via SQL Editor/approved deployment connection. It creates a private 5 MiB bucket, restricts MIME types, adds owner policies, blocks the old public signature upload convention, and validates references. No service-role key belongs in browser code. No user passwords or image exports are needed.
3. Deploy the accompanying index.html during that window. SQL first means old clients' signature uploads fail safely until refreshed. Do not deploy frontend alone: the required bucket/RPC would be missing.
4. Run the acceptance checks below using synthetic images and two dedicated test accounts. Check existing avatar displays and profile saves. Record results before restoring signature operations.
5. On failure keep the private bucket private. Preserve files and references. Roll forward or disable signature controls; rolling back to public signature uploads is unsafe.

## Access needed / dashboard verification

The connected Supabase tools already allowed read-only inspection; no extra dashboard access is required for those findings. Production changes were NOT applied. For rollout, the operator needs access to this project's Storage bucket configuration, storage.objects policy DDL and public.profiles trigger/function DDL. Ordinary application users need only their existing authenticated JWT, never project admin/service-role credentials. In Storage → profile-signatures confirm Public OFF, size 5242880, MIME PNG/JPEG/WebP; in Storage Policies confirm only owner SELECT/INSERT/DELETE for this bucket and no broader permissive policy. Existing policy names and the exact SQL are in the deployment script. Recheck policies after any later administrative changes.

## Verification

Run `node --test tests/signatures.test.cjs` for mocked client behavior. These tests are NOT evidence that production RLS or Storage endpoints work.

Before rollout acceptance: using synthetic files and ordinary user JWTs, prove A can upload/sign/read/delete its own object; B and anon cannot sign/read/list/delete A's object; public `/object/public/profile-signatures/...` cannot fetch it; upsert/UPDATE is denied; signing expires after 60 seconds; a caller cannot set a reference into B's directory or to a missing object via either setter or direct profile update; stale clear RPC fails; deletion and simulated network denial show the correct states. Test former public upload paths are rejected and avatars still work. Do not test using real user signatures.

Private orphan reconciliation is a privileged read-only comparison of Storage names with all profile references, followed by deliberate Storage API deletion of confirmed unreferenced objects after a retention period. Repeat the reference check immediately before deletion; add a transactional cleanup queue/worker if guaranteed eventual deletion is required.
