# Mr.MR Website V5.5

V5.5 adds the first advanced Business OS layer: **Client CRM**.

## Added
- Clients admin tab
- Client profile CRUD
- Client status: ACTIVE / INACTIVE / ARCHIVED
- Search and filtering
- Client statistics
- Automatic client creation when a lead moves to WON
- Notification when a new client is created
- Existing V5.1–V5.4 lead, project, task, auth, and notification features preserved
- Supabase Realtime notification support preserved

## Setup
1. Copy your working `supabase-config.js` from V5.4 into this folder.
2. Run `v5.5-client-crm.sql` in Supabase SQL Editor.
3. Open `admin.html` with Live Server.
4. Sign in with the permanent Mr.MR admin account.
5. Open **Clients**.

Do not put a Supabase secret/service-role key in browser code.
