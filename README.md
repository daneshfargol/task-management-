# پروژه دارایی | شرکت سمندیس

Persian task-management prototype. The current application is static HTML, CSS and JavaScript in `dist/`.

## Deploy to Vercel

Import `daneshfargol/task-management-` from GitHub in Vercel. Keep the root directory at the repository root. `vercel.json` sets the output directory to `dist`, with no install or build step.

Connect the production branch `main` for automatic deployments on subsequent pushes. Vercel assigns a production URL once the first deployment succeeds.

## Current data and access

This is still a browser-local prototype. Tasks and member settings use localStorage; uploaded files use IndexedDB. Real sign-in, server-enforced permissions and shared storage are not implemented yet.

Data from the previous domain does not transfer automatically to a new Vercel domain. Existing browser data remains on its original origin. The bundled demonstration scenarios are available on a new origin.

The existing ChatGPT Sites access policy does not protect a Vercel deployment. Configure deployment access in Vercel as appropriate before using real company data.

## Local preview

Serve `dist/` with a local static HTTP server, for example `python -m http.server 4173 --directory dist`, then open `http://localhost:4173`.
