-- The event trigger continues to invoke this function as its owner, but it
-- must not be callable directly through the public PostgREST RPC surface.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Cover foreign keys used by owner-scoped lookups and cascade checks.
create index if not exists quote_shares_user_id_idx
  on public.quote_shares (user_id);

create index if not exists quotes_contact_id_idx
  on public.quotes (contact_id);
