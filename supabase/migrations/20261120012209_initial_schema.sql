create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  number text not null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  valid_until date,
  delivery_estimate text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, number)
);

create index if not exists contacts_user_id_idx on public.contacts(user_id);
create index if not exists quotes_user_id_created_at_idx on public.quotes(user_id, created_at desc);

alter table public.contacts enable row level security;
alter table public.quotes enable row level security;

create policy "Users can view their own contacts" on public.contacts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own contacts" on public.contacts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can edit their own contacts" on public.contacts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own contacts" on public.contacts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view their own quotes" on public.quotes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own quotes" on public.quotes
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (
      contact_id is null or exists (
        select 1 from public.contacts c where c.id = contact_id and c.user_id = (select auth.uid())
      )
    )
  );
create policy "Users can edit their own quotes" on public.quotes
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (
    contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.user_id = (select auth.uid())
    )
  ));
create policy "Users can delete their own quotes" on public.quotes
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
revoke all on public.contacts, public.quotes from anon, public;
