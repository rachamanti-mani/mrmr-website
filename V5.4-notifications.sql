-- Mr.MR V5.4 — Notifications + Automation Events
-- Run this AFTER the V5.3 project management SQL.

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'INFO'
    check (type in ('LEAD','LEAD_STATUS','PROJECT','PROJECT_STATUS','TASK','TASK_STATUS','DUE_SOON','SYSTEM')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  dedupe_key text unique
);

create index if not exists admin_notifications_user_created_idx
  on public.admin_notifications(admin_user_id, created_at desc);
create index if not exists admin_notifications_user_unread_idx
  on public.admin_notifications(admin_user_id, read_at);

alter table public.admin_notifications enable row level security;

drop policy if exists "Admins can read notifications" on public.admin_notifications;
create policy "Admins can read notifications"
on public.admin_notifications
for select
to authenticated
using (
  admin_user_id = auth.uid()
  and exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
);

drop policy if exists "Admins can update notifications" on public.admin_notifications;
create policy "Admins can update notifications"
on public.admin_notifications
for update
to authenticated
using (
  admin_user_id = auth.uid()
  and exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
)
with check (
  admin_user_id = auth.uid()
  and exists (
    select 1 from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
);

grant select, update on table public.admin_notifications to authenticated;

create or replace function public.mrmr_notify_admins(
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_dedupe_prefix text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_notifications (
    admin_user_id, type, title, message, entity_type, entity_id, dedupe_key
  )
  select
    au.user_id,
    p_type,
    p_title,
    p_message,
    p_entity_type,
    p_entity_id,
    case when p_dedupe_prefix is null then null
         else p_dedupe_prefix || ':' || au.user_id::text end
  from public.admin_users au
  where au.role = 'admin'
  on conflict (dedupe_key) do nothing;
end;
$$;

-- New lead notifications.
create or replace function public.mrmr_notify_new_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mrmr_notify_admins(
    'LEAD',
    'New project inquiry',
    coalesce(new.name, 'A new client') || ' submitted a ' || coalesce(new.service, 'project') || ' inquiry.',
    'inquiry',
    new.id,
    'inquiry:new:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists project_inquiries_notify_new on public.project_inquiries;
create trigger project_inquiries_notify_new
after insert on public.project_inquiries
for each row execute function public.mrmr_notify_new_inquiry();

-- Lead status notifications.
create or replace function public.mrmr_notify_inquiry_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.mrmr_notify_admins(
      'LEAD_STATUS',
      'Lead status changed',
      coalesce(new.name, 'Lead') || ' moved to ' || new.status || '.',
      'inquiry',
      new.id,
      'inquiry:status:' || new.id::text || ':' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_inquiries_notify_status on public.project_inquiries;
create trigger project_inquiries_notify_status
after update of status on public.project_inquiries
for each row execute function public.mrmr_notify_inquiry_status();

-- Project created/status notifications.
create or replace function public.mrmr_notify_project_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.mrmr_notify_admins(
      'PROJECT',
      'Project created',
      coalesce(new.name, 'Project') || ' was added to the delivery workspace.',
      'project',
      new.id,
      'project:new:' || new.id::text
    );
  elsif new.status is distinct from old.status then
    perform public.mrmr_notify_admins(
      'PROJECT_STATUS',
      'Project status changed',
      coalesce(new.name, 'Project') || ' moved to ' || new.status || '.',
      'project',
      new.id,
      'project:status:' || new.id::text || ':' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists client_projects_notify_change on public.client_projects;
create trigger client_projects_notify_change
after insert or update of status on public.client_projects
for each row execute function public.mrmr_notify_project_change();

-- Task created/status notifications.
create or replace function public.mrmr_notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_name text;
begin
  select name into project_name from public.client_projects where id = new.project_id;

  if tg_op = 'INSERT' then
    perform public.mrmr_notify_admins(
      'TASK',
      'New project task',
      coalesce(new.title, 'Task') || ' was added to ' || coalesce(project_name, 'a project') || '.',
      'project',
      new.project_id,
      'task:new:' || new.id::text
    );
  elsif new.status is distinct from old.status then
    perform public.mrmr_notify_admins(
      'TASK_STATUS',
      'Task status changed',
      coalesce(new.title, 'Task') || ' moved to ' || new.status || '.',
      'project',
      new.project_id,
      'task:status:' || new.id::text || ':' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_notify_change on public.project_tasks;
create trigger project_tasks_notify_change
after insert or update of status on public.project_tasks
for each row execute function public.mrmr_notify_task_change();

-- Due-soon / overdue automation. The dashboard calls this function on load/refresh.
create or replace function public.mrmr_create_due_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := current_date;
begin
  -- Project overdue / due within 2 days.
  insert into public.admin_notifications (admin_user_id, type, title, message, entity_type, entity_id, dedupe_key)
  select au.user_id,
         'DUE_SOON',
         case when p.due_date < today then 'Project overdue' else 'Project due soon' end,
         coalesce(p.name, 'Project') || case when p.due_date < today then ' is overdue.' else ' is due on ' || to_char(p.due_date, 'DD Mon YYYY') || '.' end,
         'project', p.id,
         'due:project:' || p.id::text || ':' || p.due_date::text
  from public.client_projects p
  cross join public.admin_users au
  where au.role = 'admin'
    and p.due_date is not null
    and p.status not in ('COMPLETED','CANCELLED')
    and p.due_date <= today + 2
  on conflict (dedupe_key) do nothing;

  -- Task overdue / due within 2 days.
  insert into public.admin_notifications (admin_user_id, type, title, message, entity_type, entity_id, dedupe_key)
  select au.user_id,
         'DUE_SOON',
         case when t.due_date < today then 'Task overdue' else 'Task due soon' end,
         coalesce(t.title, 'Task') || case when t.due_date < today then ' is overdue.' else ' is due on ' || to_char(t.due_date, 'DD Mon YYYY') || '.' end,
         'project', t.project_id,
         'due:task:' || t.id::text || ':' || t.due_date::text
  from public.project_tasks t
  cross join public.admin_users au
  where au.role = 'admin'
    and t.due_date is not null
    and t.status <> 'DONE'
    and t.due_date <= today + 2
  on conflict (dedupe_key) do nothing;
end;
$$;

grant execute on function public.mrmr_create_due_notifications() to authenticated;

-- Backfill a first notification for existing admins so the center can be tested immediately.
insert into public.admin_notifications (admin_user_id, type, title, message, dedupe_key)
select au.user_id, 'SYSTEM', 'Mr.MR notifications are active', 'V5.4 notification automation is connected to your admin account.', 'system:v54:' || au.user_id::text
from public.admin_users au
where au.role = 'admin'
on conflict (dedupe_key) do nothing;
