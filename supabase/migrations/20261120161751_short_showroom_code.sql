alter table public.private_showroom_rooms
  add column token_hash text unique,
  add column failed_attempts smallint not null default 0;

create function public.open_private_showroom(p_token_hash text, p_code_hash text)
returns setof public.private_showroom_rooms
language sql security invoker
set search_path = ''
as $$
  update public.private_showroom_rooms as room
  set failed_attempts = room.failed_attempts + case when room.code_hash = p_code_hash then 0 else 1 end
  where room.token_hash = p_token_hash and room.expires_at > now() and room.failed_attempts < 8
  returning room.*;
$$;
revoke all on function public.open_private_showroom(text, text) from public, anon, authenticated;
grant execute on function public.open_private_showroom(text, text) to service_role;
