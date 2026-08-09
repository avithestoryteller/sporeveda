revoke all on function public.log_bag_stage_change() from public, anon, authenticated;
revoke all on function public.user_org_ids() from public, anon;
revoke all on function public.user_role_in_org(uuid) from public, anon;
grant execute on function public.user_org_ids() to authenticated, service_role;
grant execute on function public.user_role_in_org(uuid) to authenticated, service_role;