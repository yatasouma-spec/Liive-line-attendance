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

create table if not exists public.liive_timecards (
  tenant_id text not null default 'default',
  source_key text not null,
  work_date date,
  employee text not null default '',
  site text not null default '',
  line_user_id text not null default '',
  check_in text not null default '',
  check_out text not null default '',
  hours numeric not null default 0,
  overtime numeric not null default 0,
  status text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source_key)
);

create index if not exists idx_liive_timecards_work_date
  on public.liive_timecards (tenant_id, work_date desc);

create table if not exists public.liive_shift_plans (
  tenant_id text not null default 'default',
  plan_key text not null,
  plan_id text not null default '',
  work_date date,
  employee text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  route text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, plan_key)
);

create index if not exists idx_liive_shift_plans_work_date
  on public.liive_shift_plans (tenant_id, work_date desc);

create table if not exists public.liive_behavior_reports (
  tenant_id text not null default 'default',
  report_id text not null,
  attendance_date date,
  employee text not null default '',
  site text not null default '',
  line_user_id text not null default '',
  status text not null default '',
  submitted_at timestamptz,
  deadline_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, report_id)
);

create index if not exists idx_liive_behavior_reports_attendance_date
  on public.liive_behavior_reports (tenant_id, attendance_date desc);

create table if not exists public.liive_correction_requests (
  tenant_id text not null default 'default',
  request_id text not null,
  employee text not null default '',
  line_user_id text not null default '',
  site text not null default '',
  status text not null default '',
  message text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, request_id)
);

create index if not exists idx_liive_correction_requests_created_at
  on public.liive_correction_requests (tenant_id, created_at desc);

create table if not exists public.liive_alcohol_evidence (
  tenant_id text not null default 'default',
  evidence_key text not null,
  employee text not null default '',
  line_user_id text not null default '',
  site text not null default '',
  line_channel text not null default 'primary',
  alcohol_value numeric not null default 0,
  meter_image_id text not null default '',
  face_image_id text not null default '',
  recorded_at timestamptz,
  expires_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, evidence_key)
);

create index if not exists idx_liive_alcohol_evidence_recorded_at
  on public.liive_alcohol_evidence (tenant_id, recorded_at desc);

create table if not exists public.liive_line_user_maps (
  tenant_id text not null default 'default',
  line_user_id text not null,
  employee_id text not null default '',
  employee_name text not null default '',
  site text not null default '',
  line_channel text not null default 'primary',
  site_link_id text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, line_user_id)
);

create index if not exists idx_liive_line_user_maps_employee_name
  on public.liive_line_user_maps (tenant_id, employee_name);

create table if not exists public.liive_employee_rules (
  tenant_id text not null default 'default',
  employee_key text not null,
  employee_id text not null default '',
  employee_code text not null default '',
  active boolean not null default true,
  requires_alcohol_check boolean not null default true,
  work_start text not null default '',
  work_end text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, employee_key)
);

create index if not exists idx_liive_employee_rules_active
  on public.liive_employee_rules (tenant_id, active);

drop trigger if exists trg_liive_timecards_set_updated_at on public.liive_timecards;
create trigger trg_liive_timecards_set_updated_at
before update on public.liive_timecards
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_liive_shift_plans_set_updated_at on public.liive_shift_plans;
create trigger trg_liive_shift_plans_set_updated_at
before update on public.liive_shift_plans
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_liive_behavior_reports_set_updated_at on public.liive_behavior_reports;
create trigger trg_liive_behavior_reports_set_updated_at
before update on public.liive_behavior_reports
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_liive_correction_requests_set_updated_at on public.liive_correction_requests;
create trigger trg_liive_correction_requests_set_updated_at
before update on public.liive_correction_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_liive_alcohol_evidence_set_updated_at on public.liive_alcohol_evidence;
create trigger trg_liive_alcohol_evidence_set_updated_at
before update on public.liive_alcohol_evidence
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_liive_line_user_maps_set_updated_at on public.liive_line_user_maps;
create trigger trg_liive_line_user_maps_set_updated_at
before update on public.liive_line_user_maps
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_liive_employee_rules_set_updated_at on public.liive_employee_rules;
create trigger trg_liive_employee_rules_set_updated_at
before update on public.liive_employee_rules
for each row execute procedure public.set_updated_at();

revoke all on table public.app_state_snapshots from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.app_state_snapshots to service_role;
revoke all on table public.liive_timecards from anon, authenticated;
grant select, insert, update, delete on table public.liive_timecards to service_role;
revoke all on table public.liive_shift_plans from anon, authenticated;
grant select, insert, update, delete on table public.liive_shift_plans to service_role;
revoke all on table public.liive_behavior_reports from anon, authenticated;
grant select, insert, update, delete on table public.liive_behavior_reports to service_role;
revoke all on table public.liive_correction_requests from anon, authenticated;
grant select, insert, update, delete on table public.liive_correction_requests to service_role;
revoke all on table public.liive_alcohol_evidence from anon, authenticated;
grant select, insert, update, delete on table public.liive_alcohol_evidence to service_role;
revoke all on table public.liive_line_user_maps from anon, authenticated;
grant select, insert, update, delete on table public.liive_line_user_maps to service_role;
revoke all on table public.liive_employee_rules from anon, authenticated;
grant select, insert, update, delete on table public.liive_employee_rules to service_role;

-- Refresh PostgREST schema cache to avoid stale column metadata after first setup.
select pg_notify('pgrst', 'reload schema');
