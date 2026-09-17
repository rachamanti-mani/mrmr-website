-- Mr.MR V5.5 — Client CRM
-- Run after V5.4 notifications setup in the same Supabase project.

create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  email text,
  phone text,
  business text,
  website text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  source_inquiry_id uuid references public.project_inquiries(id) on delete set null,
  notes text
);

alter table public.client_profiles enable row level security;

drop policy if exists "Admin users can manage client profiles"
on public.client_profiles;

create policy "Admin users can manage client profiles"
on public.client_profiles
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

grant select, insert, update, delete on table public.client_profiles to authenticated;

create or replace function public.mrmr_set_client_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_profiles_updated_at
on public.client_profiles;

create trigger client_profiles_updated_at
before update on public.client_profiles
for each row
execute function public.mrmr_set_client_updated_at();

-- When a lead becomes WON, create a client profile if one with the same
-- email does not already exist. This keeps the CRM connected to the lead pipeline.
create or replace function public.mrmr_create_client_from_won_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'WON' and (old.status is distinct from 'WON') then
    if new.email is not null and exists (
      select 1 from public.client_profiles
      where lower(email) = lower(new.email)
    ) then
      return new;
    end if;

    insert into public.client_profiles (
      name, email, phone, business, website, source_inquiry_id, notes
    )
    values (
      coalesce(new.name, 'Client'),
      new.email,
      new.phone,
      new.business,
      new.website,
      new.id,
      'Created automatically when the lead moved to WON.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists project_inquiries_create_client_on_won
on public.project_inquiries;

create trigger project_inquiries_create_client_on_won
after update of status on public.project_inquiries
for each row
execute function public.mrmr_create_client_from_won_lead();

-- Notification when a new client is created.
create or replace function public.mrmr_notify_new_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_notifications (
    type, title, message, entity_type, entity_id
  )
  values (
    'client_created',
    'New client added',
    coalesce(new.name, 'Client') || ' is now in the Mr.MR client CRM.',
    'client',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists client_profiles_notify_insert
on public.client_profiles;

create trigger client_profiles_notify_insert
after insert on public.client_profiles
for each row
execute function public.mrmr_notify_new_client();
