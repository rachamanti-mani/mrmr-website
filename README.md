# Mr.MR Website V5.1

V5.1 upgrades the V4 client inquiry form with real Supabase lead storage.

## Current architecture

Customer
→ Start a Project
→ Supabase `project_inquiries`
→ status `NEW`

The V4 email fallback remains active until Supabase is configured.

## Files

- `index.html` — Home
- `about.html` — About
- `services.html` — Services
- `projects.html` — Projects
- `start-a-project.html` — Client inquiry form
- `styles.css` — Shared styling
- `script.js` — Navigation, animations and V5.1 inquiry submission
- `supabase-config.js` — Supabase Project URL + publishable key
- `README.md` — Setup notes

## Supabase setup

The database table should already exist:

`public.project_inquiries`

with the public INSERT policy created in Supabase SQL Editor.

### Configure the website

Open `supabase-config.js` and replace:

- `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
- `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE`

Use the values from the Supabase Connect dialog.

### Security

Use only the Supabase **publishable key** in this browser-side file.

Never put a Supabase **secret** or **service-role** key in the website.

The table should keep Row Level Security enabled and should allow public INSERT only for this V5.1 form. Do not add a public SELECT policy for `project_inquiries`; the future admin dashboard will use authenticated/server-side access.

## V5.1 test

1. Configure `supabase-config.js`.
2. Upload/commit the V5.1 files to the existing GitHub repository.
3. Let Vercel deploy.
4. Open `start-a-project.html`.
5. Submit a test inquiry.
6. In Supabase, open Table Editor → `project_inquiries`.
7. Confirm the new row exists with status `NEW`.

## Next

V5.2 will add the protected admin lead dashboard:

NEW → CONTACTED → DISCUSSION → PROPOSAL → WON / LOST
