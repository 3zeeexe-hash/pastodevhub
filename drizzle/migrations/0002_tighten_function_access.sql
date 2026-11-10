-- Trigger-only functions: nobody calls these directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.commits_touch_repo(), public.assign_repo_number(),
  public.job_applications_count() FROM PUBLIC, anon, authenticated;
-- Signed-in only helpers (used by signed-in rules and actions).
REVOKE EXECUTE ON FUNCTION public.platform_fee(integer), public.can_access_order(uuid), public.can_download_product(uuid),
  public.can_download_product_path(text), public.is_application_participant(uuid), public.job_owner(uuid),
  public.job_is_open(uuid), public.has_role(uuid, public.app_role), public.is_developer(uuid), public.is_client(uuid),
  public.can_write_repo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_order(uuid), public.can_download_product(uuid),
  public.can_download_product_path(text), public.is_application_participant(uuid), public.job_owner(uuid),
  public.job_is_open(uuid), public.has_role(uuid, public.app_role), public.is_developer(uuid), public.is_client(uuid),
  public.can_write_repo(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_fee(integer) FROM authenticated;
