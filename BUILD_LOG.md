# ReferLink Build Log

One entry per real decision or problem. Newest at the bottom.

---

## 2026-10-24 · Build without asking employees first
- Decision: Build ReferLink as a side project. Don't check with employees before building.
- Why: Siddh chose to build first and test demand at launch.
- Who: Siddh (Claude flagged the risk)
- Evidence: None yet. No employee has agreed to use it.
- Result: "Employees may not adopt it" is the #1 risk in the PRD. The launch plan has to cover it.

## 2026-10-24 · No AI on day 1
- Decision: Don't add AI summaries, ratings or rankings to the MVP. Move them to the top of the Later list.
- Why: The AI could only read 300 characters, since resumes are Drive links and LinkedIn can't be scraped. Ranking people's careers with AI is a fairness risk. It would also need a server, a paid API and 2–3 more hours.
- Who: Together (Siddh proposed AI, Claude argued against it, Siddh agreed)
- Evidence: None yet. Revisit in Step 8 if the data shows employees struggling with large queues.
- Result: Pending

## 2026-10-24 · Strict form instead of "Need more info"
- Decision: Drop the "Need more info" status. Check required fields on the form before submitting. Show a rule-based quality line on each request. Add "Resume link didn't open" as a decline reason.
- Why: Siddh's insight was that busy employees won't chase candidates for missing details, so gaps should be fixed by the candidate before submitting.
- Who: Together (Siddh found the problem, Claude proposed the fix)
- Evidence: None yet
- Result: Two outcomes only: Referred ✓ or Not this time.

## 2026-10-24 · No email in the MVP
- Decision: No email service. A "Save your link" screen shows copy and "Email this link to myself" buttons. The email button opens the user's own mail app.
- Why: It keeps the build to one day with one less tool. The tradeoff is that employees get no alert for new requests and can't recover a lost dashboard link.
- Who: Siddh (picked option a)
- Evidence: None yet. Watch how quickly requests get a decision.
- Result: Pending

## 2026-10-24 · Candidates see the decline reason
- Decision: Show the decline reason on the status page in soft wording.
- Why: It closes the loop and teaches candidates to send better requests.
- Who: Together
- Evidence: None yet
- Result: Pending

## 2026-10-24 · Setup defaults
- Decision: Private GitHub repo, hosted on Vercel's free subdomain. Readable public link (`/r/name-company-x7k2`). Long random tokens for the dashboard and status links. Limit of 20 requests per board per hour.
- Why: The public link only lets people submit a request, so a readable link is safe. Private links must be impossible to guess.
- Who: Claude proposed, Siddh accepted
- Evidence: None yet
- Result: Pending

## 2026-10-24 · PRD approved; overnight build delegated
- Decision: Siddh approved the PRD and asked Claude to write the plan and build locally overnight, making the build decisions on Siddh's behalf.
- Why: Saves a day. Siddh reviews everything in the morning before anything goes live.
- Who: Siddh
- Evidence: None
- Result: The plan approval checkpoint was skipped. The entries below marked "Claude (overnight)" need Siddh's review.

## 2026-10-24 · Test locally with a real Postgres, no accounts
- Decision: Run Postgres inside Node (PGlite) for local testing, loading the same `schema.sql` that goes live.
- Why: We could build and test everything before any accounts existed, with no Docker.
- Who: Claude (overnight)
- Evidence: 11 of 11 automated database tests pass (`cd dev && npm test`).
- Result: Every security rule is checked by a test, e.g. that the browser key can't read the tables directly and that one board's secret can't touch another board.

## 2026-10-24 · Store fingerprints, not tokens
- Decision: The database stores a SHA-256 fingerprint of each secret link, never the link itself.
- Why: If the database ever leaked, the stored values couldn't be turned back into working links. This is the same idea as password hashing.
- Who: Claude (overnight)
- Evidence: Tested. The stored value never equals the token.
- Result: Done

## 2026-10-24 · "Delete my request" wipes personal data, keeps an anonymous row
- Decision: Deleting clears the name, email, links and message, but keeps the board, status and dates.
- Why: The candidate's data is gone, but deleted requests don't silently vanish from the North Star. The PRD has been updated to match.
- Who: Claude (overnight)
- Evidence: Tested. After a delete, all personal fields are empty and the status link stops working.
- Result: Done

## 2026-10-24 · Extra form rules
- Decision: "Why you fit" must be 20–300 characters. A job ID must contain at least one number. The site allows at most 50 new boards an hour.
- Why: This blocks "pls refer" requests and junk job IDs like "SDE", and stops someone flooding the site with boards.
- Who: Claude (overnight)
- Evidence: None yet. Watch `request_form_blocked` to see if these rules block real candidates.
- Result: Pending

## 2026-10-24 · Analytics carries no personal data
- Decision: PostHog gets only the events we name. There's no autocapture, no session recording and no names or emails, and secret tokens are scrubbed from URLs.
- Why: It handles career data, so trust matters more than extra analytics.
- Who: Claude (overnight)
- Evidence: Browser test. The dashboard event logged its URL as `/d/[token]`.
- Result: Done

## 2026-10-24 · Local end-to-end test
- Decision: Tested every flow in the browser at desktop and phone width (375px): create board → submit request → dashboard decisions → status page → delete.
- Why: To catch problems before deploying.
- Who: Claude (overnight)
- Evidence: All flows worked. A `<img onerror>` injection test in "Why you fit" showed as plain text. No page scrolled sideways on a phone.
- Result: Fixed 3 small issues: filter tabs touching the card above, unclear wording ("their recruiting team" → "Google's recruiting team"), and a confusing message when copying fails.

## 2026-10-24 · UI redesign
- Decision: Rebuilt the whole look. Geist font, near-black buttons, one indigo accent, line icons instead of emoji, automatic dark mode, a product preview on the landing page, a live board preview while creating a link, and a timeline on the status page.
- Why: Siddh reviewed the first version and said it looked "built in 2017". The causes were the system font, a Bootstrap-style blue, and the same white box everywhere.
- Who: Siddh (the call to redesign), Claude (the direction)
- Evidence: Siddh suggested the "ui-ux-pro-max" skill from GitHub. Claude read it and didn't install it, because it's mainly a Python search over style spreadsheets, which means running outside code for little gain. Its checklist was used instead: no emoji icons, dark mode, reduced-motion support, visible focus rings, 44px+ tap targets.
- Result: Every flow retested in the browser at desktop and phone width (375px), with no sideways scrolling. Same plain HTML/CSS/JS with no framework. Fonts now load from Google Fonts, and the privacy page says so.

## 2026-10-24 · Dark violet theme, motion and theme toggle
- Decision: Changed the colour theme to a dark violet base with a violet-to-magenta gradient. Dark is the default, and a header toggle switches to light; the choice is saved in that browser. Added motion: depth word reveal, scramble text, rolling digit counts, cursor spotlight on cards, light sweep on buttons, and scroll reveals. All of it turns off for people who ask their device for reduced motion.
- Why: Siddh wanted a "wow" but professional look, and an on-site toggle rather than following the device setting.
- Who: Siddh (direction, reference sites), Claude (choices and build)
- Evidence: Siddh's references were Motion Primitives, SmoothUI, unlumen UI, Realtime Colors and Haikei. They're all React or design tools, so each effect was rebuilt in plain JS/CSS, with no new libraries.
- Result: Retested landing, create, board, dashboard and status in both themes and at phone width, with no sideways scrolling. A bug was found and fixed: animations that held their end frame could leave text invisible if the browser paused them, so the resting state is now always visible.

## 2026-10-24 · Cursor trail, sun icon fix, theme and favicon options
- Decision: Added a gradient cursor trail that takes its colours from the theme. It shows for mouse only and is off for reduced motion. Fixed the sun icon, which had two rays drawn from the wrong point. Built preview pages for 6 colour themes and 8 hand-off favicon variations, so Siddh can choose.
- Why: Siddh wasn't satisfied with the violet theme, wanted more interactivity, and asked to see themes pictured before choosing.
- Who: Siddh (requests, 2 palettes), Claude (4 more themes, favicon variants, build)
- Evidence: Trail tested in the browser: it draws while the mouse moves and fully clears within a second. The sun was checked at large size.
- Result: Pending Siddh's theme and favicon choice.

## 2026-10-24 · Background sparkle replaces cursor trail; theme screenshots
- Decision: Removed the cursor trail. Hovering over empty background now shows a soft glow and small twinkling gradient sparkles, never over cards, nav or buttons. The hero glow now takes its colours from the theme instead of a fixed violet image.
- Why: Siddh didn't like the trail and asked for a sparkle on the background only.
- Who: Siddh (direction), Claude (build)
- Evidence: Browser test: the glow shows over the background and stays off over cards, and sparkles fully clear after fading. Real screenshots of the landing page in all 6 themes are in `design/theme-shots/`.
- Result: Pending Siddh's theme choice.

## 2026-10-24 · Stepped back from effects; 5 UI design directions
- Decision: Removed the background sparkle. Built 5 distinct UI directions (Ledger, Paper, Graphite, Signal, Harbor), each covering the landing page, the employee dashboard and the candidate phone form, to replace the effects-heavy look.
- Why: Siddh said the UI read as "AI slop". Claude agreed that glows, gradient text, scramble text and sparkles are the tell, and that a professional look comes from layout, type and restraint.
- Who: Siddh (call), Claude (directions and mockups)
- Evidence: Rendered boards are in `design/ui-designs/`. All use made-up example data, and none promise features the product doesn't have.
- Result: Pending Siddh's choice. Once chosen, the live site gets rebuilt in that direction.

## 2026-10-24 · Rebuilt the site in the "Paper" design
- Decision: Rebuilt every page in the Paper direction: warm paper tones, Newsreader serif headlines, Inter body text, one forest-green accent, and no effects. The candidate form is now one question per screen (5 steps). The dashboard is a two-pane inbox, and on phones the list and the open request take turns. Light is the default, with a warm dark mode on the toggle. The favicon is now the green check circle.
- Why: Siddh picked Paper from the 5 directions because it feels calm and human, not "AI slop". One question per screen should feel lighter for candidates on a phone.
- Who: Siddh (picked Paper), Claude (build)
- Evidence: Browser tests passed for the step flow (blocks bad input, Back works, sends at the end) and the phone dashboard (tap to open, decline with reason, stays open). No page scrolls sideways at 375px, and the 11 database tests still pass. Two bugs were found and fixed: stretched avatars, and a stray "null" on the dashboard.
- Result: Added `request_form_step_viewed`, so Step 8 can show exactly which question candidates drop off at.

## 2026-10-24 · Switched to the "Ledger" design, added an animated demo
- Decision: Restyled the site in the Ledger direction: white, slate text, one indigo accent, Inter, and a near-black logo mark. The landing page puts the headline beside an example inbox. The dashboard is now a table where you refer or decline from the row and click a row to expand the full request. The candidate form keeps one question per screen. The landing page gets a 20-second "how it works" demo built from HTML.
- Why: Siddh preferred Ledger. Claude kept the step-by-step form because its per-question drop-off data matters for Step 8 more than matching the mock exactly.
- Who: Siddh (picked Ledger, asked for a video), Claude (build)
- Evidence: Browser tests passed: table quick-checks, expand, decline with reason, refer, and live counts. Every demo scene shows for about 5 seconds and loops. No sideways scrolling at 375px, and 11 of 11 database tests pass.
- Result: The demo is HTML, not an MP4, so it's crisp and light on phones. An MP4 version via HyperFrames is pending Siddh's OK to install FFmpeg.

## 2026-10-24 · "How it works" video rendered with HyperFrames
- Decision: Installed FFmpeg (winget) and used HeyGen's open-source HyperFrames to render a 29-second square MP4 (1080×1080, 30fps, 1.1 MB) in the Ledger look. It runs hook → logo → share → ask → inbox → answer → end card. It's silent, because LinkedIn autoplays muted.
- Why: Siddh wanted a video for the launch. Square fills the most space in the LinkedIn phone feed. The website keeps the lighter HTML demo.
- Who: Siddh (asked, approved the install), Claude (script, build, render)
- Evidence: `hyperframes check` passed with 0 errors and all text meeting the contrast standard. Frames were checked from both the preview and the final MP4. A DM line that could read as mocking candidates was replaced.
- Result: `design/referlink-how-it-works.mp4`. The end card has no URL yet. Add the domain after deploy and re-render with `cd design/video && npm run render` (about a minute).

## 2026-10-24 · The MP4 replaces the HTML demo on the landing page
- Decision: The "See it in 30 seconds" section now plays the HyperFrames MP4 (1.1 MB). It's muted, loops, has no player bar, and only plays while on screen, with a Pause/Play button. People who prefer reduced motion see a still image until they press Play. The HTML demo code was removed.
- Why: Siddh expected to see the actual video on the site, and wanted visitors to see the same thing as on LinkedIn.
- Who: Siddh (picked option 1), Claude (build)
- Evidence: The file loads at 1080×1080 and plays muted. Byte-range requests return 206, matching how Vercel serves video. It starts by itself when on screen (the headless test showed "Pause" after load), and there's no sideways scroll at 375px.
- Result: Done. The local test server now supports video byte ranges, like Vercel.
