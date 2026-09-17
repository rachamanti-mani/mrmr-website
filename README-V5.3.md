# Mr.MR V5.3 — Project Management

V5.3 extends the protected admin area into a lightweight client project workspace.

## What is new
- Leads and Projects tabs inside the admin command center.
- Create a project directly from a project inquiry.
- Create a project manually.
- Project status: PLANNING, ACTIVE, ON_HOLD, COMPLETED, CANCELLED.
- Progress tracking from 0–100%.
- Start date and due date.
- Client contact information and budget.
- Live project URL and repository URL.
- Internal project notes.
- Project search and status filtering.
- Due-soon project count.
- Project task checklist with TODO / IN_PROGRESS / DONE and LOW / MEDIUM / HIGH priority.
- Existing V5.2 lead pipeline is preserved.
- Password recovery screen is included in admin.js/admin.html; the email rate limit issue can be handled separately.

## Supabase setup
1. Keep your existing working `supabase-config.js` values. Never put a service-role/secret key in this file.
2. In Supabase SQL Editor, run `v5.3-project-management.sql` after your V5.2 admin setup SQL.
3. The SQL enables RLS and allows only authenticated users listed as `admin` in `admin_users` to manage projects/tasks.
4. Public visitors are not granted access to project tables.

## Run locally
Use VS Code Live Server and open `admin.html`.

## Important
This version does not require changing the public inquiry form. Existing leads remain in `project_inquiries` and can be converted into projects from the lead details dialog.
