# ReferLink

A personal referral inbox. An employee shares one link, candidates send complete requests, the employee decides in one tap, and every candidate sees the answer.

Built by Siddh Mishra, who directed the product and reviewed the work, with Claude writing the code.

## Docs
- [PRD.md](PRD.md): problem, users, requirements, metrics
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): pages, database, security, deployment
- [BUILD_LOG.md](BUILD_LOG.md): every real decision, who made it, and what happened

## How it's built
- `public/`: the website (plain HTML, CSS and JavaScript, no framework)
- `supabase/schema.sql`: the database (tables, security rules and the 7 functions the site can call)
- `vercel.json`: short URLs (`/r/…`, `/d/…`, `/s/…`) and security headers
- `dev/`: local test server and automated database tests (not deployed)

## Run locally
Needs Node.js 18 or newer. No accounts are needed.

```bash
cd dev
npm install
npm test     # database security tests
npm start    # http://localhost:3000
```
