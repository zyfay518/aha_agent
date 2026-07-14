-- Backend efficiency optimization, prepared 2026-07-14.
-- Additive only: existing RPCs and indexes remain available for compatibility.

create index if not exists agent_access_tokens_user_id_idx
  on public.agent_access_tokens (user_id);

create index if not exists agent_item_images_user_id_idx
  on public.agent_item_images (user_id);

create or replace function public.agent_get_outfit_source(
  p_access_code text,
  p_item_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_view uuid;
  v_items jsonb;
begin
  v_user := private.agent_user_id(p_access_code);
  if v_user is null then
    raise exception 'INVALID_ACCESS_CODE' using errcode = 'P0001';
  end if;

  if p_item_ids is null
    or cardinality(p_item_ids) < 1
    or cardinality(p_item_ids) > 5
    or cardinality(p_item_ids) <> (
      select count(distinct item_id)::integer from unnest(p_item_ids) as item_id
    )
  then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  insert into private.wardrobe_view_links (user_id)
  values (v_user)
  on conflict (user_id) do update set revoked_at = null
  returning view_id into v_view;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', wardrobe.id,
        'name', wardrobe.name,
        'category', wardrobe.category::text,
        'mime_type', image.mime_type,
        'base64', encode(image.image_bytes, 'base64')
      ) order by requested.ordinality
    ),
    '[]'::jsonb
  )
  into v_items
  from unnest(p_item_ids) with ordinality as requested(item_id, ordinality)
  join public.wardrobe_items as wardrobe
    on wardrobe.id = requested.item_id
    and wardrobe.user_id = v_user
    and wardrobe.deleted_at is null
  join public.agent_item_images as image
    on image.item_id = wardrobe.id
    and image.user_id = v_user;

  if jsonb_array_length(v_items) <> cardinality(p_item_ids) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  return jsonb_build_object('view_id', v_view, 'items', v_items);
end
$$;

revoke all on function public.agent_get_outfit_source(text, uuid[]) from public, anon, authenticated;
grant execute on function public.agent_get_outfit_source(text, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
