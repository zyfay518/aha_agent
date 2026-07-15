create or replace function public.agent_add_wardrobe_items_batch(
  p_access_code text,
  p_batch_idempotency_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid;
  v_count integer;
  v_existing_count integer;
  v_index integer;
  v_item jsonb;
  v_id uuid;
  v_name text;
  v_category text;
  v_subcategory text;
  v_colors text[];
  v_seasons text[];
  v_mime_type text;
  v_image_base64 text;
  v_sort_start integer;
  v_results jsonb := '[]'::jsonb;
begin
  v_user := private.agent_user_id(p_access_code);
  if v_user is null then
    raise exception 'INVALID_ACCESS_CODE' using errcode = 'P0001';
  end if;

  if char_length(coalesce(p_batch_idempotency_key, '')) not between 8 and 100
     or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count not between 2 and 8 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  select count(*) into v_existing_count
  from public.wardrobe_items
  where user_id = v_user
    and deleted_at is null
    and ai_metadata ->> 'agent_batch_idempotency_key' = p_batch_idempotency_key;

  if v_existing_count > 0 then
    if v_existing_count <> v_count then
      raise exception 'BATCH_CONFLICT' using errcode = 'P0001';
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'has_image', true)
      order by (ai_metadata ->> 'agent_batch_index')::integer
    ), '[]'::jsonb)
    into v_results
    from public.wardrobe_items
    where user_id = v_user
      and deleted_at is null
      and ai_metadata ->> 'agent_batch_idempotency_key' = p_batch_idempotency_key;

    return jsonb_build_object('created', false, 'count', v_count, 'items', v_results);
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_start
  from public.wardrobe_items
  where user_id = v_user and deleted_at is null;

  for v_index in 0..v_count - 1 loop
    v_item := p_items -> v_index;
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'colors') is distinct from 'array'
       or jsonb_typeof(v_item -> 'seasons') is distinct from 'array' then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_name := trim(coalesce(v_item ->> 'name', ''));
    v_category := v_item ->> 'category';
    v_subcategory := coalesce(nullif(trim(v_item ->> 'subcategory'), ''), 'other');
    v_mime_type := v_item ->> 'mime_type';
    v_image_base64 := v_item ->> 'image_base64';

    select coalesce(array_agg(value), '{}'::text[]) into v_colors
    from jsonb_array_elements_text(v_item -> 'colors');
    select coalesce(array_agg(value), '{}'::text[]) into v_seasons
    from jsonb_array_elements_text(v_item -> 'seasons');

    if char_length(v_name) not between 1 and 80
       or char_length(v_subcategory) not between 1 and 50
       or v_category not in ('top', 'bottom', 'shoes', 'bag')
       or cardinality(v_colors) not between 1 and 2
       or cardinality(v_seasons) > 4
       or not (v_seasons <@ array['spring','summer','autumn','winter','all_season']::text[])
       or v_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
       or v_image_base64 is null
       or length(v_image_base64) > 8000000 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_id := gen_random_uuid();
    insert into public.wardrobe_items(
      id, user_id, name, category, subcategory, primary_color, secondary_color,
      season_tags, original_image_path, ai_metadata, sort_order
    ) values (
      v_id, v_user, v_name, v_category::public.wardrobe_category, v_subcategory,
      v_colors[1], v_colors[2], v_seasons, 'agent://batch/' || v_id::text,
      jsonb_build_object(
        'source', 'host_agent_batch_vision',
        'agent_batch_idempotency_key', p_batch_idempotency_key,
        'agent_batch_index', v_index
      ),
      v_sort_start + v_index
    );

    insert into public.agent_item_images(item_id, user_id, mime_type, image_bytes)
    values (v_id, v_user, v_mime_type, decode(v_image_base64, 'base64'));

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('id', v_id, 'name', v_name, 'has_image', true)
    );
  end loop;

  return jsonb_build_object('created', true, 'count', v_count, 'items', v_results);
exception
  when invalid_text_representation or data_exception then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
end
$function$;

revoke all on function public.agent_add_wardrobe_items_batch(text, text, jsonb) from public, authenticated;
grant execute on function public.agent_add_wardrobe_items_batch(text, text, jsonb) to anon, service_role;

create or replace function public.agent_consume_rate_limit(p_access_code text, p_tool_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
    when 'add_wardrobe_items_batch' then 6
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
$function$;

