create table public.private_showroom_rooms (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  title text not null,
  models jsonb not null check (jsonb_typeof(models) = 'array' and jsonb_array_length(models) between 1 and 8),
  expires_at timestamptz not null
);

alter table public.private_showroom_rooms enable row level security;
revoke all on public.private_showroom_rooms from public, anon, authenticated;
grant select, insert, update, delete on public.private_showroom_rooms to service_role;

update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'model/gltf-binary')
where id = 'project-files' and not ('model/gltf-binary' = any(allowed_mime_types));
