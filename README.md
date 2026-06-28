# MailScope — Company Email Finder

A responsive Node.js web app that crawls public company pages, discovers email addresses, classifies them by department, and identifies addresses matching the company domain.

## Run locally

```powershell
npm install
npm start
```

Open `http://localhost:3000`.

## Features

- Same-domain crawling with a 20-page limit and request timeouts
- Email extraction from HTML, visible text, links, scripts, and structured data
- Official-domain detection and optional third-party results
- Department classification, copy controls, and CSV, Excel-compatible, and JSON exports
- Dark/light themes and the last 20 searches stored locally in the browser
- Protection against local/private network targets and unsafe URL protocols
- Bulk Excel/CSV uploads containing up to 10,000 company websites
- Parallel, resumable extraction jobs with pause, resume, cancel, retries, and progress estimates
- Downloadable Excel reports containing contact details, company information, and social profiles

Bulk job state is saved under `data/bulk-jobs`, so interrupted work can be resumed after restarting the server. Set `BULK_CONCURRENCY` to a value from 1 to 12 to tune parallel processing (default: 5).

Only scan websites you are permitted to access. Results depend on the publicly available content exposed by each site.
