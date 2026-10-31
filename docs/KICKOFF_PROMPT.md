# Kickoff prompt: landing (Phase 3)

Open Claude Code in `2972robotics/landing/` and paste the prompt below. The detailed work list is
[PHASE3_TASKS.md](PHASE3_TASKS.md).

---

```
You are working on the landing repo for 2972robotics.com, the self-hosted site of FRC Team 2972. It is a plain HTML/CSS/JS site with no build step; almost all content lives in js/content.js and the shared header/footer in js/components.js. It will serve the public site at SITE_DOMAIN and www.SITE_DOMAIN, and the logged-in portal home at portal.SITE_DOMAIN. Sibling repos: ../infra (compose, Caddy, Authentik, shared docs), ../admin, ../taskapp.

Read first, in order: CLAUDE.md, docs/PHASE3_TASKS.md, README.md, ../infra/docs/CONVENTIONS.md, ../infra/docs/INTEGRATION.md (§1, §2, §8), ../MASTER_PLAN.md (Phase 3, decisions log, open questions). Those are the source of truth. If something in them is wrong or impossible, stop and tell me; do not work around it.

Start in plan mode. Ask me clarifying questions one at a time, starting with the open questions in docs/PHASE3_TASKS.md. Do not change files until I approve a plan.

## Current state of the repo
- One commit ("Initial commit"). A large uncommitted diff on top of it (about 950 lines across content.js, components.js, style.css, README.md, .gitignore and several pages).
- Untracked: robot.html, team-login.html, CLAUDE.md, docs/.
- Real photos are in assets/ but git-ignored, so a clean clone shows broken images until step 2.
- infra has no commits yet: no compose.yml, no Caddyfile, no config/apps.json.

## Step 1: baseline and safety
- Show me `git status --ignored` and a gitleaks scan of the working tree and the history. If anything real turns up, stop; it gets rotated, and history is not rewritten without my OK.
- Then, with my approval, commit the current work as a baseline (no images, .DS_Store or .env staged), so later changes are reviewable.
- Add .gitleaks.toml and .github/workflows/gitleaks.yml. Keep the image ignore rules and the standard block (CONVENTIONS §9) in .gitignore.

## Step 2: images from Google Drive
Every local assets/*.jpg|png reference in content.js switches to https://lh3.googleusercontent.com/d/<ID>=w<size> (the table in PHASE3_TASKS §1 lists every one and a size). Give me the list of filenames and I will supply the Drive IDs, or tell me the fastest way to collect them. Add width/height or aspect-ratio and loading="lazy" so pages don't jump. Fix the content.js top comment that still says "put image files in assets/". Only SVG placeholders stay in git.

## Step 3: host names and public links
One setting builds every host URL from SITE_SCHEME and SITE_DOMAIN, so localhost and 2972robotics.com both work. "Team Login" in the header and footer goes to the portal; add "Request an account" pointing at admin.SITE_DOMAIN/request. team-login.html becomes a redirect to the portal (keep noindex).

## Step 4: container
Dockerfile with a pinned static Caddy on PORT 3001. GET /healthz returns 200 {"status":"ok"} with no secret. Portal requests need X-Proxy-Secret equal to PROXY_SHARED_SECRET, otherwise 401; the public host never serves portal files or identity. Test it alone with docker run and hand-sent headers.

## Step 5: portal home
On portal.SITE_DOMAIN: "Hi, <name>" (textContent), tiles from the read-only apps.json filtered by the pipe-separated X-Authentik-Groups (groups [] = any logged-in user), the "your account is waiting for an admin to assign your group" notice when there are no groups, and a sign-out link (INTEGRATION §1). Keep it no-build, for example a Caddy-templated identity JSON plus client-side filtering. Filtering is convenience only; Authentik is the real gate. Then remove TEAM_APPS from content.js (it seeds infra's apps.json; the Task App tile points at tasks.SITE_DOMAIN).

## Step 6: README and infra hand-off
Rewrite README: plain "what is this" paragraph first, "edit content.js" front and center, Drive size suffixes, remove the stale /Users/.../Robotics/Website path and the GitHub Pages/Netlify deploy section ("this runs inside the infra stack; production updates only via infra/scripts/deploy.sh"). Then tell me exactly what infra needs: compose service, env, apps.json mount path, Caddy blocks. Do not edit ../infra yourself.

## Phase 3 test checklist
- [ ] The root domain loads with no login and no broken images from a clean clone.
- [ ] Portal tiles differ correctly for admin, mentor, student, parent, alumni and no-group test users.
- [ ] Forged groups sent to the public host or the portal host are stripped (portal shows the real groups).
- [ ] Lighthouse performance score is 80 or more on mobile for the home page (image sizes OK).
- [ ] A direct request to landing:3001 for a portal route with fake headers and no or a wrong secret gets 401; /healthz gets 200.
- [ ] gitleaks is clean.
Items that need the full stack wait for infra P0; say which ones you could not run.

## Rules
- No framework or build step without my agreement.
- Nothing private in git (CONVENTIONS §9): no secrets, no student names or emails, no private links on public pages, no photos committed. Test data uses @example.com.
- Commit in small steps, only with my OK. Do not push.
- When a decision changes something in MASTER_PLAN or the infra docs, tell me; those are edited from the parent folder.
```
