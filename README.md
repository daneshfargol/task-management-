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

## Optional daily website-presence report

`005_presence.sql` is applied after 004. `presence.js` sends authenticated project-scoped heartbeats every 30 seconds while the tab is visible, focused and has had input within two minutes. No input contents or pointer coordinates are collected. Members see a small disclosure. The report is collapsed under management reports; server RLS and RPC checks limit it to the shared management role. Server timestamps and Tehran dates are used. A shared per-person daily cursor avoids adding overlapping tab intervals, with a maximum credited heartbeat interval of 75 seconds. This is an approximate website-engagement measure, not actual working time or attendance certification. Explicit page end/logout is best effort; last-seen remains available after abrupt exits. Collection starts after real member login; demo role selection does not track employees. Test script: `presence-test.sql` (all fixtures roll back).

## Recoverable task deletion

006_task_trash.sql adds management-only trash/restore RPCs and a guard against updates to trashed tasks. Applied to the current Supabase project. Deletion keeps task records, attachments and history; the app filters the trash from active lists. No permanent deletion is exposed. trash-test.sql uses an isolated project and fake users inside a rolled-back transaction. The static demo keeps a separate local trash backup. Persian date fields now offer clickable Persian month calendars; values submitted to the database remain ISO dates.

## Owner-only personal projects

007_personal_projects.sql creates six separate personal projects linked to the existing Reza Afshar member ID via sm_personal_owners. Other directors have no read/write access under RLS. These projects use simple due dates and done toggles, without assignments, team membership or reviewer approval. Owners can add projects and create/edit/soft-delete/restore their own tasks. Revision checks prevent stale overwrites. personal-projects-test.sql verifies owner operations and denial for another director in an isolated rolled-back transaction. personal-projects.js adds the project picker in both shared and demo modes; demo data stays browser-local and is not an access-control mechanism. Darayi presence tracking pauses while a personal project is selected.

## Personal scheduling, external contacts and initial attachments

008_task_dates_external_contacts.sql adds private starts_on dates with start/deadline validation, and explicit external contacts in sm_members. Management can create/edit them through sm_save_external_member; a database trigger prevents external contacts from acquiring an email, user identity or management role. They remain selectable as task owners/collaborators without receiving app access. refinement-test.sql validates dates, external assignment/reassignment and management file upload within rolled-back isolated fixtures. creation-attachments.js adds optional versioned attachments to new team tasks and preserves partial upload results; retries use the created task. Existing personal workbook rows were split into short titles and descriptions privately, outside Git.

## Creator task editing
009_creator_task_edit.sql adds revision-checked title, description and deadline editing for the creator or shared management role. Owner/collaborator assignment stays management-only. Editing review/done tasks reopens them, preserves files and prior event snapshots, and sends in-app notices. Trashed tasks remain guarded. creator-edit-test.sql verifies creator/manager access, denial for another member, stale-write rejection and history retention with rolled-back fixtures. task-edit.js exposes edit buttons in task lists, boards and details.

