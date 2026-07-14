-- Applied to Supabase project icgsgjbywmbizqkzduve on 2026-07-14.
-- Separates the write-capable Agent access code from stable read-only web URLs.

create table if not exists private.wardrobe_view_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  view_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table private.wardrobe_view_links enable row level security;
revoke all on table private.wardrobe_view_links from public, anon, authenticated;

create or replace function private.wardrobe_view_user_id(p_view_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from private.wardrobe_view_links
  where view_id = p_view_id and revoked_at is null limit 1
$$;

revoke all on function private.wardrobe_view_user_id(uuid) from public, anon, authenticated;

create or replace function public.agent_get_or_create_wardrobe_view(p_access_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_view uuid;
begin
  v_user := private.agent_user_id(p_access_code);
  if v_user is null then raise exception 'INVALID_ACCESS_CODE' using errcode='P0001'; end if;
  insert into private.wardrobe_view_links(user_id) values (v_user)
  on conflict (user_id) do update set revoked_at = null
  returning view_id into v_view;
  return v_view;
end
$$;

create or replace function public.view_list_wardrobe_items(p_view_id uuid, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid; v_result jsonb;
begin
  v_user := private.wardrobe_view_user_id(p_view_id);
  if v_user is null then raise exception 'VIEW_NOT_FOUND' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_result
  from (
    select w.id,w.name,w.category::text,w.subcategory,w.primary_color,w.secondary_color,w.season_tags,w.created_at,
      exists(select 1 from public.agent_item_images i where i.item_id=w.id and i.user_id=v_user) as has_image
    from public.wardrobe_items w
    where w.user_id=v_user and w.deleted_at is null
    order by w.created_at desc limit greatest(1,least(coalesce(p_limit,50),50))
  ) x;
  return jsonb_build_object('items',v_result);
end
$$;

create or replace function public.view_get_item_image(p_view_id uuid, p_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid; v_img public.agent_item_images;
begin
  v_user := private.wardrobe_view_user_id(p_view_id);
  if v_user is null then raise exception 'VIEW_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_img from public.agent_item_images where item_id=p_item_id and user_id=v_user;
  if v_img.item_id is null then raise exception 'IMAGE_NOT_FOUND' using errcode='P0001'; end if;
  return jsonb_build_object('mime_type',v_img.mime_type,'base64',encode(v_img.image_bytes,'base64'));
end
$$;

revoke all on function public.agent_get_or_create_wardrobe_view(text) from public, anon, authenticated;
revoke all on function public.view_list_wardrobe_items(uuid, integer) from public, anon, authenticated;
revoke all on function public.view_get_item_image(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agent_get_or_create_wardrobe_view(text) to anon, authenticated;
grant execute on function public.view_list_wardrobe_items(uuid, integer) to anon, authenticated;
grant execute on function public.view_get_item_image(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
