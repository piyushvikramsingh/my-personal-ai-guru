create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.agent_actions to authenticated;
grant all on public.agent_actions to service_role;
alter table public.agent_actions enable row level security;
create policy "own actions select" on public.agent_actions for select to authenticated using (auth.uid() = user_id);
create policy "own actions insert" on public.agent_actions for insert to authenticated with check (auth.uid() = user_id);
create policy "own actions update" on public.agent_actions for update to authenticated using (auth.uid() = user_id);
create policy "own actions delete" on public.agent_actions for delete to authenticated using (auth.uid() = user_id);
create index agent_actions_user_status_idx on public.agent_actions (user_id, status, created_at desc);