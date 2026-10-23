# ReferLink PRD

**Owner:** Siddh Mishra · **Status:** Draft v1 · **Date:** 24 Oct 2026

**One line:** A personal referral inbox. An employee shares one link, candidates send structured requests, and every candidate gets an answer.

---

## 1. Problem

Employees at well-known companies get a steady stream of "can you refer me?" messages on LinkedIn. Most of these messages are vague, with no job ID, no resume and no reason to help.

**Both sides lose.**
- **Employees** waste time sorting messy DMs, so most get ignored.
- **Candidates** get ghosted and never learn what happened.

### Evidence (weak, and stated as weak)
1. One vendor guide claims Indian tech employees get 8–15 referral requests a week and ignore most. It comes from a small, unnamed sample. (jobrise.io/en/blog/job-referral-networking-india)
2. A Google engineer on Blind called the flood of demanding referral messages "just irritating". (teamblind.com/post/why-do-people-cold-inmail-for-referral-like-this-p5bvtq5j)
3. **No user interviews have been done.** I chose to build first and test demand at launch. ReferLink itself is the test.

### Why existing tools don't solve it
| Tool | Gap |
|---|---|
| LinkedIn DMs | No structure, no queue, no status |
| Company referral tools (Workday etc.) | Only start after the employee has already decided to refer someone |
| Jumbl | A candidate-side marketplace, not the employee's own inbox |
| Google Forms | Collects requests but never tells the candidate what happened |
| ChatGPT / Claude | Can't hold a shared queue between two people or track status |

---

## 2. Users

1. **Employee (referrer). The primary user.** They work at a known company and get referral DMs. They want to help some people, quickly, without guilt about the rest. If they don't adopt ReferLink, nothing works, so every tradeoff favours them.
2. **Candidate (requester).** A job seeker who reaches the employee's link from LinkedIn, usually on a phone. They want a fair shot and a clear answer.

---

## 3. Goals and non-goals

### Product goals
1. Every request gets a decision, and the candidate can see it.
2. An employee can clear a request in one tap.
3. Requests arrive complete, so the employee never has to chase missing details.

### My goals (portfolio)
1. A live public link.
2. 5–10 real employee boards with real requests.
3. One honest data story: "I saw X, changed Y, and Z happened."

### Non-goals for the MVP
Accounts and passwords · file uploads · email or WhatsApp alerts · AI screening, summaries or ranking · payments · company admin views · mobile app · a "Need more info" back-and-forth.

---

## 4. User flows

### A. Employee creates a board (under 1 minute)
1. Opens the home page and taps **Create my referral link**.
2. Enters name, company and LinkedIn URL. Can also add the teams or roles they refer for, and a short note (e.g. "Engineering roles only").
3. Sees a **Save your links** screen:
   - **Public link** to share on LinkedIn: `/r/priya-google-x7k2`
   - **Private dashboard link**: `/d/<long secret>`, with a warning: "Anyone with this link can manage your requests. Keep it private. We can't recover it."
   - **Copy** and **Email this link to myself** buttons. The email button opens their own mail app.

### B. Candidate submits a request
1. Opens the public link and sees the employee's name, company, the roles they refer for and their note.
2. Fills in name, email, LinkedIn URL, job link or job ID, resume link and "Why you fit" (max 300 characters).
3. Ticks consent: "My details are shared only with this employee."
4. The form checks every field before submitting and explains what's wrong in plain words, e.g. "No job ID? Find it on the job posting. Requests without one usually get ignored."
5. Gets a **private status link** (`/s/<long token>`) with Copy and Email-to-myself buttons.

### C. Employee works the queue
1. Opens the dashboard link. Sees requests newest first, filterable by Pending / Referred / Declined.
2. Each request shows the candidate's details and a **quick-check line**, e.g. "Job link on careers.google.com · Resume on Google Drive · LinkedIn ✓".
3. One tap: **Referred ✓** or **Decline**. Decline asks for a reason, which takes one more tap.

### D. Candidate checks status
1. Opens the status link and sees **Pending**, **Referred ✓** or **Not this time**, plus the reason in soft wording.
2. Can tap **Delete my request**, which permanently removes their personal details (name, email, links, message). An anonymous record (dates and outcome) stays so the metrics remain honest.

### Decline reasons (what the employee picks → what the candidate sees)
| Employee picks | Candidate sees |
|---|---|
| Role outside what I refer for | "This role is outside what I can refer for." |
| Experience doesn't match | "Your experience doesn't match this role closely enough." |
| Resume link didn't open | "Your resume link didn't open. Check its sharing settings and request again." |
| Job closed or not found | "I couldn't find this job, or it's closed." |
| Other | "Not this time." |

---

## 5. Requirements

### Must (day 1)
1. Board creation with a readable public link and a secret dashboard link.
2. Candidate form with required fields, format checks and a consent checkbox.
3. Private status link for each request.
4. Dashboard: list, newest first, filter by status, one-tap Referred / Decline with a reason.
5. Status page with a soft-worded outcome and **Delete my request**.
6. **Security:** Row Level Security on every table, with no direct reads. All reads and writes go through database functions that check the right token:
   - The public link can only **create** a request.
   - The dashboard secret can only **read and update** that board's requests.
   - The status token can only **read or delete** that one request.
7. **Anti-spam:**
   - A hidden honeypot field.
   - One open request per email, per job, per board. A declined request doesn't block a new one, so a candidate can fix a broken resume link and try again.
   - At most 20 requests per board per hour.
8. Analytics events (Section 6). **No names, emails or links are sent to analytics.**
9. Mobile-first design that works well on a phone.

### Should (if time allows on day 1)
1. Quick-check line on each request (rule-based, no AI).
2. Show a request count on each dashboard filter.
3. An "Email this link to myself" button on both save screens.

### Later (don't build now)
1. **AI summary and ranking of requests.** First in line, if the data shows employees struggling with large queues.
2. Email alerts to employees for new requests, and dashboard link recovery.
3. Email or WhatsApp alerts to candidates.
4. Employee accounts and login.
5. Edit, pause or delete a board.
6. Verifying that an employee really works at the company.
7. Multiple employees per company, and company admin views.
8. Resume file uploads, payments and a mobile app.

---

## 6. Metrics

Nothing here will be reported until real data exists.

**North Star: the share of requests that get a decision within 7 days.**
It only counts requests that are at least 7 days old. Why this metric: the product exists to close the loop.

| # | KPI | Definition | Source |
|---|---|---|---|
| 1 | Board activation | Boards with at least 1 decision ÷ boards created | Supabase |
| 2 | Form completion | `request_submitted` ÷ `request_form_viewed` | PostHog funnel |
| 3 | Request quality | Share of declines for "Resume link didn't open" or "Job closed or not found", plus how often the form blocks a submit | Supabase + PostHog |
| 4 | Speed | Median hours from request to decision | Supabase |
| 5 | Decline reasons | Count and share of each reason | Supabase |
| 6 | Load | Requests per active board per week (active means 1+ request that week) | Supabase |

**Change from the brief on KPI 3.** The brief measured "share of requests with a valid job ID or link". Our strict form makes that close to 100% by design, so it would tell us nothing. Instead we measure the problems that still get through, and how often the form stops a bad submit.

### Analytics events
`board_created`, `public_link_copied`, `request_form_viewed`, `request_form_started`, `request_submitted`, `dashboard_viewed`, `decision_made` (type, reason), `status_page_viewed`.
**One addition:** `request_form_blocked` (which field failed). It powers KPI 3.

---

## 7. Risks

| # | Risk | What we do about it |
|---|---|---|
| 1 | **Employees don't adopt it.** None has agreed yet. | The launch plan targets friends at real companies first. Board activation (KPI 1) shows this quickly. |
| 2 | **No alerts, so requests sit unanswered.** | Measured directly by the North Star and KPI 4. A likely first change after launch. |
| 3 | **A lost dashboard link loses the board.** | Strong save screen, a "can't recover" warning and an Email-to-myself button. |
| 4 | **Candidates never come back to check status.** | Track `status_page_viewed`. The Email-to-myself button helps them keep the link. |
| 5 | **Fake boards:** anyone can claim any company. | The employee's LinkedIn is shown on the board so candidates can judge. Verification is on the Later list. |
| 6 | **Spam or abuse.** | Honeypot, duplicate block and hourly limit. |
| 7 | **Career data leaks.** | Row Level Security, token-checked functions, long random tokens, minimal data, a delete option and no personal data in analytics. |
| 8 | **Too little data.** With 5–10 boards, findings are directional, not statistically proven. | Say so honestly in the analysis. |
