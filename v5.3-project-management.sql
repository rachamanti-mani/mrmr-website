-- Mr.MR V5.3 — Project Management
-- Run this AFTER the V5.2 admin setup SQL.

create table if not exists public.client_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inquiry_id uuid references public.project_inquiries(id) on delete set null,
  name text not null,
  client_name text,
  client_email text,
  client_phone text,
  service text,
  budget text,
  status text not null default 'PLANNING'
    check (status in ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  progress integer not null default 0
    check (progress >= 0 and progress <= 100),
  start_date date,
  due_date date,
  project_url text,
  repo_url text,
  notes text
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.client_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'TODO'
    check (status in ('TODO','IN_PROGRESS','DONE')),
  priority text not null default 'MEDIUM'
    check (priority in ('LOW','MEDIUM','HIGH')),
  due_date date
);

create index if not exists client_projects_inquiry_id_idx on public.client_projects(inquiry_id);
create index if not exists client_projects_status_idx on public.client_projects(status);
create index if not exists project_tasks_project_id_idx on public.project_tasks(project_id);

create or replace function public.set_client_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_projects_updated_at on public.client_projects;
create trigger client_projects_updated_at
before update on public.client_projects
for each row execute function public.set_client_projects_updated_at();

alter table public.client_projects enable row level security;
alter table public.project_tasks enable row level security;

drop policy if exists "Admins can manage projects" on public.client_projects;
create policy "Admins can manage projects"
on public.client_projects
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
);

drop policy if exists "Admins can manage project tasks" on public.project_tasks;
create policy "Admins can manage project tasks"
on public.project_tasks
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
);

grant select, insert, update, delete on table public.client_projects to authenticated;
grant select, insert, update, delete on table public.project_tasks to authenticated;

-- Public visitors receive no permissions on either table.
-- The existing project_inquiries anon INSERT policy remains unchanged.
