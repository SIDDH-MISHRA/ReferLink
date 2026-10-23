# Project Brief: ReferLink

Paste this whole file into a new chat (or attach it with @), then say: **"Read this brief and start with Step 1."**

---

## 1. Who I am and how to work with me

I'm Siddh Mishra, a 2025 B.Tech CSE grad from Delhi NCR. I'm targeting Product Manager, Associate PM, Product Analyst, Founder's Office and Growth roles in Indian startups.

**How I build:** I decide what to build and why. I direct AI (you) to write the code. I review the result as a user would, and I fix what doesn't meet the bar. I understand technical concepts, but I don't write production code myself.

**Rules for working with me:**
1. Use simple, direct English. Short sentences. Use numbered lists for anything complex.
2. Never position me as a software engineer. I'm a product person who builds with AI.
3. Explain every technical choice in one or two plain lines, so I can defend it in an interview.
4. Keep a clear record of what I decided and what you implemented.
5. Don't assume. If something is unclear, ask me.
6. Never invent metrics, users, research or results. Every number must come from real data.
7. Disagree with me when I'm wrong. I mean it.
8. Avoid tools I can't defend: no React or other JS frameworks, no Docker, no AWS, no complex backend.

---

## 2. Why this project exists

I need one project that gives me:
1. **A live public link** anyone can click.
2. **Real users generating real data,** so I can say: "I shipped it, watched what users did, found X, and changed Y."
3. **Real SQL practice.** I'm still building my SQL skill.
4. **Written artifacts** I can show: PRD, implementation plan, build log, and a later analysis write-up.

It must be built in **one focused day (about 10 hours)**, then run for a week to collect data.

---

## 3. The problem

Employees at well-known companies get flooded with "can you refer me?" messages on LinkedIn.

- One vendor guide claims Indian tech employees get 8–15 referral requests a week, and that most are ignored. This is from a small, unnamed sample, so treat it as rough. (jobrise.io/en/blog/job-referral-networking-india)
- Employees openly complain. A Google engineer on Blind called the flood of demanding referral messages "just irritating". (teamblind.com/post/why-do-people-cold-inmail-for-referral-like-this-p5bvtq5j)
- Most requests are vague: no job ID, no resume, no reason to help.

**Both sides lose.** Employees waste time sorting messy DMs. Candidates get ghosted and never learn what happened.

### Why existing tools don't solve it

| Tool | Why it fails here |
|---|---|
| LinkedIn DMs | No structure, no queue, no status |
| Company tools (Workday, Zoho Recruit, SAP) | Only start after the employee has already decided to refer someone |
| Jumbl (Indian referral marketplace) | A candidate-side marketplace. Not the employee's own inbox for requests that already come to them. |
| Google Forms | Collects requests, but never tells the candidate what happened |
| ChatGPT / Claude | Can't hold a shared queue between two people, track status over time, or give a public link |

---

## 4. The product

**ReferLink: a personal referral inbox for employees.**

An employee puts one link on their LinkedIn profile: *"Want a referral from me? Request it here."*

### Two users

1. **The employee (referrer).** The primary user and the real bottleneck. If they don't adopt it, nothing works. Design for them first.
2. **The candidate (requester).** Easy to find. Comes through the employee's link.

### Core flows

**A. Employee creates a board (under 1 minute)**
- Enters name, company and LinkedIn URL. Optionally adds the teams or roles they can refer for, and a short note ("I only refer for engineering roles").
- Gets two links:
  - **A public link** to share, e.g. `/r/<slug>`
  - **A private dashboard link** with a secret token, e.g. `/d/<secret>`. No password. Warn clearly: "Anyone with this link can manage your requests. Keep it private."

**B. Candidate submits a request**
- Required: name, email, LinkedIn URL, **job ID or job link**, resume link (Google Drive or similar), and "Why you fit" (max 300 characters).
- A consent checkbox: data is shared only with this employee.
- After submitting, the candidate gets **a private status link**, e.g. `/s/<token>`.

**C. Employee works the queue**
- A clean list: newest first, filter by status.
- One tap per request: **Referred ✓**, **Decline** (with a quick reason: role mismatch / experience / no job ID / other) or **Need more info**.

**D. Candidate checks status**
- The status page shows: Pending → Referred ✓ / Not this time / More info needed.

### Out of scope for the MVP

- Accounts, passwords, logins
- File uploads (resumes are links only)
- Email or WhatsApp notifications (the status page replaces them for now)
- AI screening or matching
- Payments
- Multiple employees per company, or company admin views
- A mobile app

Each of these is a reasonable later idea. Note them in a "Later" list. Don't build them.

---

## 5. Success metrics

**North Star: share of requests that get a decision within 7 days.**
Why: the product exists to close the loop. Candidates stop being ghosted, and employees clear their queue.

**Supporting KPIs:**
1. Board activation: boards created → first decision made
2. Candidate form completion: form opened → request submitted
3. Request quality: share of requests with a valid job ID or link
4. Speed: median time from request to decision
5. Decline reasons: how they break down
6. Requests per active board per week

Set these up so they can be measured from day one. Don't report any of them until real data exists.

---

## 6. Tech stack (keep it simple and defensible)

| Part | Choice | Why (one line) |
|---|---|---|
| Frontend | Plain HTML, CSS and vanilla JavaScript | Simple, and I can read and explain it |
| Database | Supabase (free tier, Postgres) | Real SQL database, so I can practise SQL on real data |
| Analytics | PostHog (free tier) | Funnels and events with no setup pain |
| Hosting | Vercel or Netlify (free) | Gives the live public link |

### Security requirements (important, because the database key in the browser is public)

1. Turn on Row Level Security on every table and deny direct reads by default.
2. All reads and writes go through Supabase SQL functions (RPC). Each function checks the right secret token:
   - The public board slug only allows **creating** a request.
   - The dashboard secret allows **reading and updating** that board's requests only.
   - The candidate token allows **reading one request's status** only.
3. Tokens must be long and random. Never use guessable IDs in links.
4. Basic anti-spam:
   - a hidden honeypot field
   - one request per email, per job, per board
   - a simple limit on requests per hour per board
5. Collect as little personal data as possible. Add a "delete my request" option on the candidate status page.

Explain this security setup to me in plain words. Interviewers may ask.

### Analytics events to track

`board_created`, `public_link_copied`, `request_form_viewed`, `request_form_started`, `request_submitted`, `dashboard_viewed`, `decision_made` (with type and reason), `status_page_viewed`.

---

## 7. Deliverables and order of work

Work in this order. Wait for my approval at each checkpoint marked ✋.

**Step 1: Clarify (short)**
- Ask me at most 5 questions that change what we build. Then stop. ✋

**Step 2: PRD (`PRD.md`)**
- Problem, users, evidence, goals, non-goals, user flows, requirements (must / should / later), metrics, risks.
- Keep it to about 2–3 pages. Plain English. ✋

**Step 3: Implementation plan (`IMPLEMENTATION_PLAN.md`)**
- Pages, database tables and fields, SQL functions, analytics events, deployment steps.
- Split into time-boxed blocks that fit about 10 hours.
- Mark anything I must do myself (create accounts, add keys). ✋

**Step 4: Build log (`BUILD_LOG.md`), kept updated the whole time**
- Must be clean and short, not cluttered. One entry per real decision or problem, in this format:

  ```
  ## [Date] Short title
  - Decision: what was decided
  - Why: one or two lines
  - Who: me / Claude / together
  - Evidence: link, number or test result (if any)
  - Result: what happened
  ```
- No long essays. No repeating code. Only things that matter for my portfolio story.

**Step 5: Build**
- Build in small working slices: board creation → candidate form → dashboard → status page → analytics → polish.
- After each slice, tell me how to test it as a real user. ✋

**Step 6: Deploy and test**
- Put it on a live public URL.
- Run through every flow end to end on desktop and phone.
- Fix anything broken before launch. ✋

**Step 7: Launch plan (`LAUNCH_PLAN.md`)**
- How I get the first 5–10 employees to create boards. Start with friends at real companies.
- A short message I can send them, and a LinkedIn post draft.
- What to watch in the first 7 days.

**Step 8 (after about 7 days of data): Analysis (`ANALYSIS.md`)**
- Help me write the SQL queries for each KPI. I want to write the final versions myself, with you checking them.
- Find one real insight, decide one change, ship it, and measure again.
- This becomes my resume line and interview story.

---

## 8. Design direction

- Clean, trustworthy, fast. It handles people's career data, so it must feel safe.
- Mobile-first: candidates will open the link from LinkedIn on their phone.
- One clear action per screen.
- Friendly, plain microcopy. Example: "No job ID? Find it on the job posting. Requests without one usually get ignored."

---

## 9. What success looks like for me

1. A live link on my resume.
2. 5–10 real employee boards and real candidate requests.
3. A PRD, implementation plan, clean build log and analysis write-up I can show.
4. One honest data story: "I saw X in the data, changed Y, and Z happened."

Start with Step 1.
