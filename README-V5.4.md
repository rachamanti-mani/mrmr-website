# Mr.MR Website — V5.4

V5.4 adds an admin notification center and event-driven automation.

## Added
- Notification center in the protected admin dashboard
- Unread notification count
- Mark one notification read / mark all read
- New inquiry notifications
- Lead status change notifications
- Project creation/status notifications
- Project task creation/status notifications
- Due-soon and overdue project/task reminders checked on admin load/refresh
- 30-second notification refresh while the dashboard is open

## Database
Run `V5.4-notifications.sql` in the same Supabase project after V5.3 SQL.

No service-role key is needed in the browser. Keep Supabase secret/service-role credentials server-side only.
