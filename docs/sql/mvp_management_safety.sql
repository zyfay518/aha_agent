-- Aha wardrobe management, account lifecycle, and MCP safeguards.
-- Prepared and applied 2026-07-14.

alter table public.wardrobe_items
  add column if not exists sort_order integer;

with ranked as (
  select id,
    row_number() over (
      partition by user_id, category
      order by created_at desc, id
    ) - 1 as position
  from public.wardrobe_items
)
update public.wardrobe_items as item
set sort_order = ranked.position
from ranked
where item.id = ranked.id and item.sort_order is null;

alter table public.wardrobe_items
  alter column sort_order set default 0,
  alter column sort_order set not null;

create index if not exists wardrobe_items_user_category_sort_idx
  on public.wardrobe_items (user_id, category, sort_order, created_at desc)
  where deleted_at is null;

create or replace function public.web_get_item_image(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_image public.agent_item_images;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  select image.* into v_image
  from public.agent_item_images as image
  join public.wardrobe_items as item on item.id = image.item_id
  where image.item_id = p_item_id
    and image.user_id = v_user
    and item.user_id = v_user
    and item.deleted_at is null;

  if v_image.item_id is null then
    raise exception 'IMAGE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'mime_type', v_image.mime_type,
    'base64', encode(v_image.image_bytes, 'base64')
  );
end
$$;

create or replace function public.web_reorder_wardrobe_items(p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_category public.wardrobe_category;
  v_expected integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_item_ids is null
    or cardinality(p_item_ids) < 1
    or cardinality(p_item_ids) > 200
    or cardinality(p_item_ids) <> (
      select count(distinct item_id)::integer from unnest(p_item_ids) as item_id
    )
  then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_expected
  from public.wardrobe_items as item
  where item.user_id = v_user
    and item.deleted_at is null
    and item.id = any(p_item_ids);

  select item.category into v_category
  from public.wardrobe_items as item
  where item.user_id = v_user
    and item.deleted_at is null
    and item.id = p_item_ids[1];

  if v_expected <> cardinality(p_item_ids)
    or exists (
      select 1 from public.wardrobe_items as item
      where item.user_id = v_user
        and item.deleted_at is null
        and item.id = any(p_item_ids)
        and item.category <> v_category
    )
  then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.wardrobe_items as item
  set sort_order = ordered.ordinality - 1,
      updated_at = now()
  from unnest(p_item_ids) with ordinality as ordered(item_id, ordinality)
  where item.id = ordered.item_id and item.user_id = v_user;

  return jsonb_build_object('updated', cardinality(p_item_ids));
end
$$;

create or replace function public.web_revoke_agent_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  update public.agent_access_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = v_user and revoked_at is null;

  update public.oauth_grants
  set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where user_id = v_user and status = 'active';

  update private.wardrobe_view_links
  set revoked_at = coalesce(revoked_at, now())
  where user_id = v_user and revoked_at is null;

  return jsonb_build_object('revoked', true);
end
$$;

create or replace function public.web_delete_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_confirmation <> 'DELETE_MY_ACCOUNT' then
    raise exception 'DELETE_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'wardrobe-private'
      and (storage.foldername(name))[2] = v_user::text
  ) then
    raise exception 'STORAGE_NOT_EMPTY' using errcode = 'P0001';
  end if;

  delete from public.outfits where user_id = v_user;
  delete from public.wardrobe_items where user_id = v_user;
  delete from public.pending_uploads where user_id = v_user;
  delete from public.oauth_grants where user_id = v_user;
  delete from public.agent_access_tokens where user_id = v_user;
  delete from private.wardrobe_view_links where user_id = v_user;
  delete from public.audit_events where user_id = v_user;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;

  return jsonb_build_object('deleted', true);
end
$$;

create table if not exists private.mcp_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, tool_name, window_start)
);

alter table private.mcp_rate_limits enable row level security;
revoke all on table private.mcp_rate_limits from public, anon, authenticated;

create or replace function public.agent_consume_rate_limit(
  p_access_code text,
  p_tool_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_window timestamptz := date_trunc('minute', now());
  v_limit integer;
  v_count integer;
begin
  v_user := private.agent_user_id(p_access_code);
  if v_user is null then
    raise exception 'INVALID_ACCESS_CODE' using errcode = 'P0001';
  end if;

  v_limit := case p_tool_name
    when 'attach_item_image' then 8
    when 'create_outfit_board' then 15
    when 'add_wardrobe_item' then 20
    else 60
  end;

  insert into private.mcp_rate_limits(user_id, tool_name, window_start, request_count)
  values (v_user, left(coalesce(p_tool_name, 'unknown'), 80), v_window, 1)
  on conflict (user_id, tool_name, window_start)
  do update set request_count = private.mcp_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from private.mcp_rate_limits
  where window_start < now() - interval '1 day';

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'retry_after_seconds', case when v_count > v_limit then greatest(1, 60 - extract(second from now())::integer) else 0 end
  );
end
$$;

create or replace function public.agent_list_wardrobe_items(
  p_access_code text,
  p_category text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_result jsonb;
begin
  v_user := private.agent_user_id(p_access_code);
  if v_user is null then
    raise exception 'INVALID_ACCESS_CODE' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(result) order by result.category, result.sort_order, result.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select item.id, item.name, item.category::text, item.subcategory,
      item.primary_color, item.secondary_color, item.season_tags, item.style_tags,
      item.sort_order, item.created_at,
      exists(
        select 1 from public.agent_item_images as image
        where image.item_id = item.id and image.user_id = v_user
      ) as has_image
    from public.wardrobe_items as item
    where item.user_id = v_user
      and item.deleted_at is null
      and (p_category is null or item.category::text = p_category)
    order by item.category, item.sort_order, item.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 50))
  ) as result;

  return jsonb_build_object('items', v_result);
end
$$;

create or replace function public.view_list_wardrobe_items(
  p_view_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_result jsonb;
begin
  v_user := private.wardrobe_view_user_id(p_view_id);
  if v_user is null then
    raise exception 'VIEW_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(result) order by result.category, result.sort_order, result.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select item.id, item.name, item.category::text, item.subcategory,
      item.primary_color, item.secondary_color, item.season_tags,
      item.sort_order, item.created_at,
      exists(
        select 1 from public.agent_item_images as image
        where image.item_id = item.id and image.user_id = v_user
      ) as has_image
    from public.wardrobe_items as item
    where item.user_id = v_user and item.deleted_at is null
    order by item.category, item.sort_order, item.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 50))
  ) as result;

  return jsonb_build_object('items', v_result);
end
$$;

revoke all on function public.web_get_item_image(uuid) from public, anon, authenticated;
revoke all on function public.web_reorder_wardrobe_items(uuid[]) from public, anon, authenticated;
revoke all on function public.web_revoke_agent_access() from public, anon, authenticated;
revoke all on function public.web_delete_account(text) from public, anon, authenticated;
revoke all on function public.agent_consume_rate_limit(text, text) from public, anon, authenticated;

grant execute on function public.web_get_item_image(uuid) to authenticated;
grant execute on function public.web_reorder_wardrobe_items(uuid[]) to authenticated;
grant execute on function public.web_revoke_agent_access() to authenticated;
grant execute on function public.web_delete_account(text) to authenticated;
grant execute on function public.agent_consume_rate_limit(text, text) to anon, authenticated;

-- Modification and deletion are deliberately web-only to avoid ambiguous natural-language targets.
revoke all on function public.agent_update_wardrobe_item(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.agent_delete_wardrobe_item(text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
