-- Liive production bootstrap (state snapshot persistence)
-- Run in Supabase SQL Editor.

create table if not exists public.app_state_snapshots (
  tenant_id text not null default 'default',
  state_key text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, state_key)
);

create index if not exists idx_app_state_snapshots_updated_at
  on public.app_state_snapshots (updated_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_app_state_snapshots_set_updated_at on public.app_state_snapshots;
create trigger trg_app_state_snapshots_set_updated_at
before update on public.app_state_snapshots
for each row execute procedure public.set_updated_at();

revoke all on table public.app_state_snapshots from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.app_state_snapshots to service_role;

-- Refresh PostgREST schema cache to avoid stale column metadata after first setup.
select pg_notify('pgrst', 'reload schema');
