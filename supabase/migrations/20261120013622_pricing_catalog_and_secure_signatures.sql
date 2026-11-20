alter table public.quotes
  add column cost_subtotal numeric(12,2) not null default 0 check (cost_subtotal >= 0),
  add column multiplier numeric(3,2) not null default 2.50 check (multiplier between 1 and 4.5),
  add column signed_at timestamptz,
  add column signed_by text,
  add column signature_data text check (signature_data is null or length(signature_data) <= 200000),
  add column signed_document_hash text;

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  unit text not null default 'un' check (char_length(trim(unit)) between 1 and 20),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_products_user_active_idx on public.catalog_products(user_id, is_active, name);
alter table public.catalog_products enable row level security;

create policy "Users can view their own catalog products" on public.catalog_products
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own catalog products" on public.catalog_products
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can edit their own catalog products" on public.catalog_products
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own catalog products" on public.catalog_products
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.catalog_products to authenticated;
grant select, insert, update, delete on public.catalog_products to service_role;
revoke all on public.catalog_products from anon, public;

create table public.quote_shares (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  code_hash text not null check (length(code_hash) = 64),
  document_hash text not null check (length(document_hash) = 64),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  expires_at timestamptz not null,
  code_expires_at timestamptz not null,
  revoked_at timestamptz,
  signed_at timestamptz,
  signed_by text,
  signature_data text check (signature_data is null or length(signature_data) <= 200000),
  created_at timestamptz not null default now()
);

create index quote_shares_quote_user_idx on public.quote_shares(quote_id, user_id);
alter table public.quote_shares enable row level security;
revoke all on public.quote_shares from anon, authenticated, public;
grant select, insert, update, delete on public.quote_shares to service_role;
grant select, insert, update, delete on public.contacts, public.quotes to service_role;

drop policy if exists "Users can edit their own quotes" on public.quotes;
create policy "Users can edit their own unsigned quotes" on public.quotes
  for update to authenticated using ((select auth.uid()) = user_id and signed_at is null)
  with check ((select auth.uid()) = user_id and signed_at is null);
drop policy if exists "Users can add their own quotes" on public.quotes;
create policy "Users can add unsigned quotes to their own account" on public.quotes
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      contact_id is null or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.user_id = (select auth.uid())
      )
    )
    and status = 'pending'
    and signed_at is null
    and signed_by is null
    and signature_data is null
    and signed_document_hash is null
  );
drop policy if exists "Users can delete their own quotes" on public.quotes;
create policy "Users can delete their own unsigned quotes" on public.quotes
  for delete to authenticated using ((select auth.uid()) = user_id and signed_at is null);
revoke update on public.quotes from authenticated;

create or replace function public.complete_quote_signature(
  p_token_hash text,
  p_code_hash text,
  p_full_name text,
  p_signature_data text
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_share public.quote_shares%rowtype;
  v_signed_at timestamptz := now();
  v_updated integer;
begin
  select * into v_share
  from public.quote_shares
  where token_hash = p_token_hash
  for update;

  if not found or v_share.revoked_at is not null or v_share.expires_at <= v_signed_at then
    return 'expired_link';
  end if;
  if v_share.signed_at is not null then
    return 'already_signed';
  end if;
  if v_share.attempt_count >= 5 then
    return 'locked';
  end if;
  if v_share.code_expires_at <= v_signed_at then
    return 'expired_code';
  end if;
  if v_share.code_hash <> p_code_hash then
    update public.quote_shares
    set attempt_count = attempt_count + 1
    where id = v_share.id;
    return 'invalid_code';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 3
    or char_length(trim(p_full_name)) > 120
    or p_signature_data is null
    or length(p_signature_data) > 200000
    or p_signature_data not like 'data:image/png;base64,%' then
    return 'invalid_signature';
  end if;

  update public.quotes
  set status = 'approved', signed_at = v_signed_at,
      signed_by = trim(p_full_name), signature_data = p_signature_data,
      signed_document_hash = v_share.document_hash
  where id = v_share.quote_id and user_id = v_share.user_id and status = 'pending' and signed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return 'quote_not_pending';
  end if;

  update public.quote_shares
  set signed_at = v_signed_at, signed_by = trim(p_full_name), signature_data = p_signature_data
  where id = v_share.id;
  return 'signed';
end;
$$;

revoke all on function public.complete_quote_signature(text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_quote_signature(text, text, text, text) to service_role;
