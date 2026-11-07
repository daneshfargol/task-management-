# پروژه دارایی | شرکت سمندیس

Persian task-management prototype. The current application is static HTML, CSS and JavaScript in `dist/`.

## Deploy to Vercel

Import `daneshfargol/task-management-` from GitHub in Vercel. Keep the root directory at the repository root. `vercel.json` sets the output directory to `dist`, with no install or build step.

Connect the production branch `main` for automatic deployments on subsequent pushes. Vercel assigns a production URL once the first deployment succeeds.

## Application modes

- `/index.html`: retained browser-local demonstration. Existing localStorage and IndexedDB data stays intact.
- `/shared.html`: Supabase-authenticated shared workspace. PostgreSQL stores task records, reports, history, notifications and membership. A private Supabase Storage bucket stores versioned attachments.

The public connection is in `dist/shared-config.js`. It contains only a browser publishable key; never put a secret/service-role key here. `dist/vendor/supabase.js` is Supabase JS 2.119.0 (MIT, see included license).

## Database setup

Apply `supabase/001_shared_workspace.sql`, then `002_notice_recipients.sql` and `003_equal_management.sql` and `004_planning_worklogs.sql` once, in order. These migrations are already applied to the selected `samandis-projects` Supabase project. Do not replay them.

All application tables have RLS. Clients have SELECT grants only. Mutations use database functions with server-side project membership, role checks, immutable histories and optimistic task revision checks. Final approval belongs to the assigning manager. Project managers and workshop supervisors now share the director permission role while retaining their job titles. File uploads are reserved, privately uploaded, then finalized after checking object metadata and task revision. Files cannot be overwritten or deleted through the browser API.

`supabase/permissions-test.sql` exercises actual database roles, task transitions, private Storage policies and concurrent-write protection inside a transaction that rolls back all test data. Do not use real account IDs in test fixtures.

## First member and email delivery

The five specified people are pre-created without email bindings. The operator must set verified email-to-person mappings in the Supabase dashboard before anyone can access project data. `sm_claim_membership()` binds a verified Auth user to an existing approved email; unknown accounts get no project access. Do not let users select or grant themselves roles.

After the first director's email is bound, that director can manage additional member emails inside the shared workspace. Adding an email does not send an invitation; the person signs in using that email. Email delivery depends on the project's Supabase Auth SMTP configuration and rate limits. Default Supabase email delivery may be limited to authorized organization addresses; configure a production SMTP provider before onboarding other email addresses.

Supabase Auth Site URL is `https://task-management-nine-red.vercel.app/shared.html`. The client uses that same return URL. Data refreshes on actions, manually, and every 20 seconds while visible. Remote phone push is not implemented. Browser demo records are not automatically imported or attributed to real members.

## Local preview

Serve `dist/` with a local static HTTP server, for example `python -m http.server 4173 --directory dist`, then open `http://localhost:4173`.

## Desktop interface and fonts

`desktop.js` and `desktop.css` provide the shared sidebar, compact toolbar, list/board layouts and responsive navigation. Existing task and approval logic remains in the workflow modules. Only the layout preference uses the new `samandis-layout-v2` browser key.

The supplied RaviFaNum variable font is embedded in `dist/fonts/RaviFaNum-Variable.ttf` and used throughout the interface. Earlier static Ravi weights and the OFL-licensed Vazirmatn fallback are retained.

## Shared planning and work logs

`004_planning_worklogs.sql` adds version-checked delivery milestones, immutable milestone history, and append-only work logs. Both management positions can manage delivery dates. Each contributor records only their own work; a database transaction lock prevents concurrent logs exceeding 24 hours per day. Experts read their own logs; management can read project logs. `planning-test.sql` tests these policies and rolls back all fixtures. `shared-planning.js` connects the calendar, delivery editor and per-task work-log form. Local demonstration data is not imported automatically.
