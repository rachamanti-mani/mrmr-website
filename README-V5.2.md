# Mr.MR V5.2 — Protected Admin Lead Dashboard

V5.2 adds a Supabase Auth protected admin dashboard for the `project_inquiries` table.

## Files added
- `admin.html` — private login + dashboard UI
- `admin.css` — dashboard styling
- `admin.js` — Supabase Auth, admin verification, lead loading/search/filter/status updates
- `v5.2-admin-setup.sql` — database security setup

## Setup
1. Keep your existing working `supabase-config.js` from V5.1. Copy it into this V5.2 folder. Do not replace it with a service-role/secret key.
2. In Supabase → Authentication → Users, create the admin account using the email you want to use for Mr.MR admin access.
3. If using `rachamantimani243@gmail.com`, run `v5.2-admin-setup.sql` as-is in SQL Editor. If using another email, change only the email in the final INSERT query before running it.
4. Open `admin.html` through Live Server, not `file://`.
5. Sign in with the Supabase Auth account.

## Security model
- Public visitors can INSERT inquiries through the existing V5.1 anon policy.
- Public visitors cannot SELECT or UPDATE inquiries.
- Only authenticated users listed in `admin_users` with role `admin` can SELECT or UPDATE inquiries.
- No Supabase secret/service-role key is used in browser code.
- `admin.html` is marked `noindex,nofollow`; the real protection is Supabase Auth + RLS.

## Important
Do not add a public SELECT policy to `project_inquiries`. That would expose client leads.
