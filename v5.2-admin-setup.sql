-- Mr.MR V5.2 — Admin security setup
-- Run this in Supabase SQL Editor AFTER creating your admin user
-- under Authentication → Users.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

grant select on table public.admin_users to authenticated;

grant select, update on table public.project_inquiries to authenticated;

create policy "Admins can read own admin record"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid() and role = 'admin');

create policy "Admins can read project inquiries"
on public.project_inquiries
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
);

create policy "Admins can update project inquiries"
on public.project_inquiries
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
      and admin_users.role = 'admin'
  )
);

-- Replace the email below ONLY if you create the admin account with another email.
insert into public.admin_users (user_id, role)
select id, 'admin'
from auth.users
where email = 'rachamantimani243@gmail.com'
on conflict (user_id) do update set role = 'admin';
