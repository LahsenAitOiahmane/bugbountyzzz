# Beginner Bug Hunter Playbook — Intigriti

Compiled 2026-10-16. Methodology synthesised from European, American, Chinese and  
Russian sources — see the Sources section at the end for every citation.

---

## Contents

1. The recommendation
2. How Intigriti actually works
3. The universal "we don't pay for that" list
4. The workflow, phase by phase
5. The toolchain
6. Your work environment
7. The global community map
8. Your first 90 days
9. Sources

---

## 1. The recommendation

### Primary: **Intigriti's own bug bounty program**

`https://app.intigriti.com/programs/intigriti/intigriti/detail`

This is the single best program on the platform for a beginner, and it's not a close  
call. Here's why.

**It ships with a practice range.** Intigriti runs a dedicated **PWN (test)  
environment**, and their words are "all the tests will now be performed on our test  
(PWN) environment, which will allow you to play around **without any restrictions**."  
You download a WireGuard config from your profile, connect, and browse to  
`https://app.pwn.intigriti.rocks`. That is a real multi-tenant web application you  
cannot meaningfully break — which removes the single biggest source of beginner  
paralysis: fear of damaging a production system.

**Scope is small and tiered.** Five assets, each with a published tier and therefore a  
published payout band. You can exhaustively map the whole thing in a weekend.

| Asset                                   | Type     | Tier   | Payout band   |
| --------------------------------------- | -------- | ------ | ------------- |
| `*.pwn.intigriti.rocks`                 | wildcard | Tier 2 | €50 – €13,337 |
| `www.intigriti.com`                     | URL      | Tier 3 | €50 – €5,000  |
| `*.intigriti.me`                        | wildcard | Tier 3 | €50 – €5,000  |
| `https://vpn.intigriti.rocks/*`         | wildcard | Tier 4 | up to €1,500  |
| `https://metabase.pwn.intigriti.rocks/` | URL      | Tier 4 | up to €1,500  |

**Triage is fast, and they pay you for speed.** Average first response is **under 24  
hours**, average time to a decision is **under 2 days**. Their published validation  
SLA is 2 working days for Critical/Exceptional, 5 for High, 15 for Medium/Low — and  
they pay a **€25 bonus** when they validate faster than that. They also pay up to  
**€50** to verify a fix you reported. For a beginner, fast feedback is worth more than  
a big ceiling: you learn what a "real" finding looks like in days, not months.

**They tell you what they care about.** Their stated worst-case scenarios are:  
unauthorised access to **submission data**, disclosure of **PII** from platform users,  
and **vertical or horizontal privilege escalation**. That is a direct hint at where the  
value is — access control, not XSS popups.

### Run this in parallel: a VDP program

Intigriti hosts Vulnerability Disclosure Programs alongside paid bounties. These  
typically pay nothing or little, but they give you wide scope, unlimited practice, and  
— crucially — **a reputation score**. On Intigriti, reputation is what unlocks private  
program invitations, and private programs are where the real money is. Filter the  
program list for open/public VDPs and treat one as your training ground.

### Backups if the PWN environment is crowded

- **Bugcrowd VDP programs.** A Chinese platform-comparison guide specifically  
  recommends Bugcrowd as a beginner starting point: begin with VDP projects, submit a  
  few valid reports, accumulate Kudos Points, and that unlocks higher-quality private  
  programs. Unpaid, but the reputation mechanics are the same idea.
- **Any Intigriti program with a wide wildcard scope.** Wildcard scope (`*.example.com`)  
  beats a single URL, because asset discovery itself becomes productive work.

---

## 2. How Intigriti actually works

Understanding the mechanics before you hunt saves weeks.

**Severity bands.** Intigriti scores with CVSS-style bands:  
Low 0.1–3.9 · Medium 4.0–6.9 · High 7.0–8.9 · Critical 9.0–9.4 · Exceptional 9.5–10.0.  
Each program maps those bands to money, per tier.

**Tiers.** A tier is attached to each asset in scope. Higher tier = higher payout. On  
Intigriti's own program, Tier 2 pays up to €13,337 while Tier 4 caps at €1,500. Always  
check which tier the asset you're testing sits in before you invest a weekend — the  
same bug is worth ~9× more on a Tier 2 asset than a Tier 4 one.

**Rules of engagement — non-negotiable:**

- **Maximum 10 requests/second.** Exceed it and you risk a ban.
- **Add the header `X-Intigriti-Username: <your username>`** to your traffic so they  
  can attribute it to you.
- Respect the **Community Code of Conduct** and the program's scope.
- **Do not disclose** anything (including PoCs on YouTube or Vimeo) without prior  
  written consent.
- Safe harbour is applied — but only while you stay inside the rules.

**Reputation and the leaderboard.** Submitting valid, well-written reports builds your  
reputation, which drives leaderboard position, which drives private invitations. This  
is the actual progression path on the platform. Volume of *good* reports beats volume  
of reports.

**What counts as a duplicate.** If the vendor already knew about the issue from their  
own testing, it's flagged as a duplicate and unpaid. This is why you hunt in the  
weird corners — the obvious endpoints are already covered by their own QA.

---

## 3. The universal "we don't pay for that" list

This list is near-identical across Intigriti programs, and it's almost identical to the  
list BI.ZONE uses. **Read it twice, because it invalidates most of what tutorials teach  
beginners.**

Unpaid on Intigriti:

- Self-XSS that can't be used against other users
- CSRF with no or low impact
- Clickjacking without proven impact or requiring unrealistic interaction
- Missing cookie flags · missing security headers · CORS misconfig on non-sensitive endpoints
- Bypassing rate-limits, or the absence of rate-limits
- Username / email enumeration
- Banner grabbing and version disclosure
- Subdomain takeover **without actually taking over** the subdomain
- Blind SSRF without proven business impact ("pingbacks aren't sufficient")
- Arbitrary file upload **without proof the uploaded file exists**
- HTTP request smuggling / host header injection without proven impact
- CSV injection · same-site scripting · reverse tabnabbing
- Sessions not invalidated · best-practice violations (password policy etc.)
- SPF/DMARC/DKIM, email spoofing, email bombing, homograph attacks
- XMLRPC enabled · file metadata not stripped · Google Maps API key disclosure
- SSL/TLS scan reports and weak SSL config
- Content injection without being able to modify HTML
- Outdated software without a proof of concept
- Open ports without an accompanying PoC demonstrating a vulnerability

**The strategic conclusion — and this is the most valuable paragraph in this document:**

> Automated scanners produce almost exclusively the *left* column. Which is why the  
> Chinese methodology guide found that newcomers who "scan the whole site and export a  
> few hundred alerts" get "nine out of ten reports rejected." Scanner output is worth  
> zero. The money is in **access control, business logic, and anything where you can  
> demonstrate a concrete impact** — the classes no scanner can reason about.

---

## 4. The workflow, phase by phase

The structure below blends Western recon practice with the Chinese 2026 methodology,  
which emphasises *asset topology* and *manual business-logic testing* over enumeration  
volume.

### Time allocation (from the Chinese methodology guide)

- **30%** reconnaissance and attack-surface mapping
- **50%** manual business-logic and access-control testing
- **20%** automation support and report writing

Most beginners invert this — they spend 80% on tooling and 20% on thinking. Don't.

---

### Phase 0 — Setup and hygiene (do once)

1. Register on Intigriti, complete your profile, download the WireGuard peer config  
   for the PWN environment.
2. Configure Burp to inject `X-Intigriti-Username: <username>` on every request to  
   in-scope hosts (Proxy → Options → Match and Replace).
3. Set a **global throttle of 100 ms** in Burp so you can never breach 10 req/s.
4. Create your evidence directory structure (see section 6) and start a session log.
5. Read the specific program's scope, out-of-scope list and rules — every time, before  
   every session. Scope changes.

---

### Phase 1 — Asset topology, not subdomain enumeration

The 2026 Chinese methodology makes this point sharply: subdomain enumeration, port  
scanning and fingerprinting ("the three-axe approach") is no longer enough. What  
matters is **the relationships between systems — the call graph, the data flows, the  
trust boundaries.** Many companies don't even know how many systems they're running.

Workflow:

1. **Establish what the company actually owns.** Certificate transparency logs, DNS  
   history, WHOIS/registration data, and — if the target is a Russian or Chinese  
   company — corporate registration records and ICP filings. Confirm the root domains  
   rather than assuming.
2. **Expand to the edges.** Subdomain brute-force, DNS history, and third-party service  
   domains reverse-resolved out of JavaScript files.
3. **Classify every host.** Main site / admin back office / API gateway / **test  
   environment** / third-party hosted app. Tag each with its IP range, CDN and cloud  
   provider.
4. **Prioritise test environments.** Hosts containing `test`, `dev`, `staging`, `uat`,  
   `qa`. The Chinese guide is emphatic here: these are frequently less protected and  
   often wired straight into production databases or real user data. A large share of  
   their serious findings came from test environments — weak admin credentials,  
   unauthenticated APIs returning bulk data.

Because Intigriti's own program is a small, well-defined scope, this phase is fast.  
Spend the saved time on Phase 2.

---

### Phase 2 — Content, endpoint and JavaScript discovery

**API-first thinking.** In a 2026 stack, the API documentation *is* an attack surface  
map. A huge share of applications expose their entire backend structure through  
machine-readable specs. Probe for:

```
/swagger-ui.html          /swagger/index.html
/v3/api-docs              /v2/api-docs
/api-docs                 /openapi.json
/graphql                  (and try introspection on it)
```

And watch for these keywords in paths:  
`api` · `v1` · `v2` · `internal` · `private` · `gateway`


When you find a spec, build a table of every endpoint with its parameters, HTTP method  
and auth requirement. Then ask the four questions that matter:

- Which endpoints have **no auth middleware** applied?
- Which ones return **bulk data** (lists, exports)?
- Which ones accept a **file** parameter?
- Which ones perform **state changes** (PUT / PATCH / DELETE)?

**Mine the JavaScript.** This is described in the Chinese guide as "one of the most  
stable information-disclosure sources in 2026," and it's where beginners can genuinely  
outperform. In a bundled SPA, the frontend contains the backend's route table. Search  
the JS for:

- internal API paths: `/internal/`, `/admin/`, `/management/`
- secret patterns: `secret`, `token`, `api_key`, `accessKey`
- storage paths: `oss`, `cos`, `s3`, `storage`, `bucket`

A real documented case: a researcher found an `/internal/`-prefixed API path in a JS  
chunk, discovered the endpoint authenticated via a **custom header** rather than a  
Cookie or Authorization header, supplied a valid header value, then enumerated order  
IDs and read other customers' orders — including shipping addresses and payment  
transaction numbers. Confirmed as High severity within one hour.

**Crawl and collect URLs.** Pull in historical URLs from the Wayback Machine and  
Common Crawl — forgotten endpoints are a rich seam, and version drift  
(`/api/v1/` → `/api/v2/`) often leaves the old handler alive and unpatched.

---

### Phase 3 — Map the authenticated surface

Walk the **entire** application while your proxy records, with the target in scope:

- Registration → email confirmation → login → password reset → 2FA
- Profile editing, file upload, file download
- Every object you can create: submission, report, comment, team, API key, invoice
- Every list view, then the detail view of each item in it

Then build one inventory. The only question at this stage: **which requests carry an  
identifier, and where does that identifier come from?** Sort into:

- **Guessable** — sequential integers, short strings, timestamps, base64 of either
- **Unguessable** — long random UUIDs
- **Self-referential** — derived from your own account

Guessable identifiers on a high-tier asset are your primary targets.

---

### Phase 4 — Hunt: access control first

The Chinese 2026 methodology is blunt about this: **if you can only master one bug  
class, master 越权 — broken access control.** It has direct impact, a clear  
verification path, and it quantifies easily in a report. It remains the most reliable  
source of income in 2026.

**The governing principle**, worth memorising:

> **Authorization is determined by data ownership, not by endpoint path.**

Most backend bugs are not "no auth check" — they're "we checked that you're *logged in*  
but not that you're *entitled to this specific object*."

**Where access-control bugs concentrate:**

- **Bulk/list endpoints** — user lists, order lists, message lists. Change an ID, read  
  someone else's data.
- **Export and download functions** — report exports, file downloads. Frequently they  
  validate the session but never validate data ownership.
- **Admin back office and plugin panels** — a low-privilege user calling admin  
  functions directly: config changes, template edits, user management.
- **Multi-tenant isolation failures** — one company's user reaching another company's  
  data. Usually the most severe class.

**The standard test battery:**

1. **Swap identifier parameters.** Any request carrying an ID, number, phone or email —  
   substitute another account's value and diff the response. This is where  
   `idor_sweep.py` from the SOGAZ work earns its keep; it works on any target.
2. **Apply a normal-user session to admin endpoints.** A 200 where you expected 403 is  
   a finding.
3. **Change the HTTP method.** If `GET` is denied, try `POST`, `PUT`, `PATCH`, `DELETE`.
4. **Fuzz the path.** `/api/orders/123` → `/api/orders/123/`, `/api/orders/123.json`,  
   `/api/orders/123?`, `/api/Orders/123`, `/api/orders/./123`. Authorization is often  
   attached to one route pattern and misses its neighbours.
5. **Try the write path when the read path is protected.** Extremely common.

**Then the second tier of bug classes**, in rough order of return:

- **Business logic flaws** — race conditions, negative quantities, coupon reuse, state  
  machine bypass, price manipulation. Unpaid-list-proof by nature, because impact is  
  obvious.
- **Stored XSS into a privileged interface** — an admin or support console rendering  
  your input. Impact is the report: show what an operator's session yields.
- **SSRF with a readable response** — not blind. Prove you can read the body.
- **File upload with proven execution or proven file existence** — note the unpaid list  
  specifically rejects uploads without proof the file landed.
- **SQL injection** — rare now, but highest value. Read-only enumeration, minimal proof.
- **Cloud misconfiguration** — public buckets, over-permissive roles, exposed managed  
  databases, secrets in infrastructure-as-code.

---

### Phase 5 — Verification

The single most common reason a valid bug gets rejected is that the vendor "cannot  
reproduce it." Run this checklist before writing anything:

1. **Reproduce from a clean state.** Fresh browser session, no cookies, no cached  
   storage. If it only works in your logged-in session, it isn't reproducible.
2. **Make the impact visible.** For access control, show *how many* records you  
   retrieved and *which sensitive fields* they contained. Vague impact = low severity.
3. **Minimise the action.** Show it *can* be exploited, then stop. Do not exfiltrate  
   more than the minimum needed to prove it. Never delete, modify, or download more  
   than a handful of records.
4. **Capture everything.** Request and response pairs, screenshots, timestamps, the  
   account IDs used.
5. **Redact properly.** Mask names, order numbers, phone numbers — but keep enough  
   context that the reviewer can see the data is real. Over-redaction kills severity;  
   under-redaction is a privacy violation.

---

### Phase 6 — Reporting

Report structure that works:

1. **Title** — asset plus vulnerability type, specific. Not "IDOR" but  
   "Authenticated IDOR in `/api/submissions/{id}` exposes other users' submissions."
2. **Summary** — two sentences: what it is, what it affects.
3. **Scope** — exact URL, endpoint, parameter, and environment.
4. **Steps to reproduce** — numbered, each step with request and response.
5. **Evidence** — the proof: the data retrieved, the privilege crossed.
6. **Impact** — concrete business risk, in the vendor's language. Not a CVSS recital.
7. **Remediation** — one or two actionable suggestions.

**Common rejection causes**, from the Chinese guide's experience:

- Duplicate — search the program's disclosed reports first
- No demonstrated impact — "anomalous output" without harm is N/A
- Out-of-scope environment — check whether test environments count for *this* program
- Environment-specific reproduction — if it needs a particular browser or network  
  condition, state it and assess how common that condition is

---

## 5. The toolchain

### Core recon stack (ProjectDiscovery ecosystem)

```bash
# Go 1.22+ required
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
go install -v github.com/projectdiscovery/katana/cmd/katana@latest
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
```

```bash
# URL history and content discovery
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/tomnomnom/waybackurls@latest
go install github.com/ffuf/ffuf/v2@latest
```

Pipeline that works:

```bash
subfinder -d example.com -silent \
  | dnsx -silent \
  | httpx -silent -status-code -title -tech-detect -o live.txt

gau example.com | sort -u > urls.txt
cat live.txt | katana -silent -jc | sort -u >> urls.txt
```

**Note on `nuclei`:** use it for *coverage*, never as a submission source. Anything it  
finds must be manually verified and manually escalated into a real impact story,  
because scanner reports are explicitly unpaid.

### Proxy and interception

- **Burp Suite Community** — free, sufficient. Set the 100 ms throttle and the  
  `X-Intigriti-Username` match-and-replace rule. Save your project per session.
- **Caido** — a lighter modern alternative, popular with researchers who find Burp's  
  Community edition limiting.

### Scope management

- **`bbscope`** (`sw33tLie/bbscope`) — aggregates scope from HackerOne, Bugcrowd,  
  **Intigriti**, YesWeHack and Immunefi into a single list. Avoids hand-copying scope  
  and missing an asset.

### One-liner collections

- **`KingOfBugbounty/KingOfBugBountyTips`** — community-curated recon one-liners with  
  explanations. Read it as a source of ideas rather than running it blind.

### Chinese tooling worth knowing

- **ARL / 灯塔 (Asset Reconnaissance Lighthouse)** — `TophantTechnology/ARL`. A  
  Docker-based asset reconnaissance platform: subdomain enumeration, port scanning,  
  fingerprinting, C-segment discovery, and continuous asset monitoring. Runs on  
  Docker, minimum 2 cores / 4 GB. Pairs with the Osprey PoC framework and CRS. The  
  Chinese community uses it as the backbone of asset collection. **Note:** ARL is a  
  broad automated scanner — on Intigriti it would breach the spirit of the rules if  
  pointed at in-scope assets. Use it on your *own* practice domains, or to understand  
  what passive enumeration surfaces.
- **xray** (Chaitin) — passive scanning proxy. Same caveat.
- **Goby** — attack surface mapping with a large fingerprint library. Same caveat.

The honest guidance: these tools teach you what automated discovery looks like, but on  
a real program you should be using the *passive* half of them (certificate  
transparency, DNS history) and doing the exploitation manually.

---

## 6. Your work environment

### Machine layout

You're on Windows with WSL — keep that, it's the right setup. Recommended layout:

```
Windows host
├── WSL2 (Kali or Ubuntu)      ← all tooling, all Go binaries, all scripts
├── Browser (host)             ← Firefox + FoxyProxy → Burp
└── Evidence folder (shared)   ← C:\Users\<you>\Documents\<project>\

Isolated VMs (VirtualBox / VMware, host-only network)
├── Windows 11 guest           ← for Windows-targeted practice
└── Linux guest                ← for Linux-targeted practice
```


Rules that keep you out of trouble:

- **Never test from your daily-driver browser profile.** Use a dedicated profile or a  
  VM. You will accumulate authenticated sessions to targets and you do not want those  
  mixed with your personal accounts.
- **One directory per program**, with `scope.md`, `notes.md`, `evidence/`, `scripts/`.
- **Snapshot your VMs before installing anything**, so you can roll back.

### The pivot trick you already have

Your `socks5.py` in `C:\Users\sadik\Documents\Shaned` solves a real problem: when the  
agent sandbox can't route to a target, you run that proxy inside WSL and the sandbox  
reaches it at `127.0.0.1:1080`. Keep it — it's reusable for any target.

### Evidence discipline

Create this at the start of every program, not at report time:

```
<program>/
├── scope.md              verbatim scope + rules + tiers
├── notes.md              running log: what you tried, when, what happened
├── evidence/
│   ├── 2026-10-16-idor-submissions/
│   │   ├── request.txt
│   │   ├── response.txt
│   │   ├── screenshot-01.png
│   │   └── manifest.json
└── scripts/
```

**Log the timestamp and account ID from the very first request.** Every program  
demands both, and reconstructing them from memory is how people lose payouts.

### Practice ranges — use these before you hunt

In order of value for a web-focused beginner:

1. **PortSwigger Web Security Academy** — free, and the best structured web-security  
   curriculum that exists. Do the access-control, business-logic and SSRF labs first;  
   they map directly onto what Intigriti pays for.
2. **Intigriti's PWN environment** — your actual target, and safe to break.
3. **OWASP Juice Shop** — a deliberately vulnerable modern SPA. Excellent for practising  
   JS mining and API-first enumeration, because it *has* a full API surface.
4. **PentesterLab** — paid, excellent for specific bug classes and code review.
5. **HackTheBox / TryHackMe** — broader, more infrastructure-focused. Useful, but less  
   directly transferable to web bug bounty than PortSwigger.

---

## 7. The global community map

You asked me to look beyond Europe and the US. This matters, because the regional  
communities have genuinely different emphases, and the non-Western ones are much  
stronger on exactly the skill a beginner needs — systematic asset discovery and manual  
business-logic testing.

### Europe / US (where Intigriti sits)

- **Intigriti blog** — `blog.intigriti.com`. Co-created with researchers. Their monthly  
  **XSS challenge** is a free, well-regarded way to build practical skill.
- **YesWeHack blog** — interview-driven methodology content from named researchers.
- **Bug Bounty Hunting** — `bugbountyhunting.com`, community-curated writeups.
- **`djadmin/awesome-bug-bounty`** — curated program and writeup index.
- **`ngalongc/bug-bounty-reference`** — writeups organised by bug type. The most  
  efficient way to learn a bug class: read ten real reports of it.
- **PortSwigger Research** — the source of much of the field's original technique.
- **BePractical.Tech** — free structured video series.

### China — strongest on asset discovery and business logic

The Chinese bug bounty (众测 / SRC) community is unusually systematic, and its 2026  
literature is the most useful thing I read for this playbook.

- **先知社区** — `xz.aliyun.com`. Alibaba's security community. Their 信息收集  
  (information-gathering) articles are the best practical recon writing anywhere, and  
  they go far beyond subdomain enumeration into corporate registration data, ICP  
  filings, certificate transparency and trust-boundary mapping.
- **安全客** — `anquanke.com`. Translation-heavy, good for keeping up with global research.
- **FreeBuf** — `freebuf.com`. Broad, includes tool writeups like the ARL deployment guide.
- **腾讯云开发者社区** — `cloud.tencent.com/developer`. Practical SRC-hunting articles,  
  including GitHub-based information gathering.
- **跳跳糖** — `tttang.com`. Higher-quality technical deep dives.

**What the Chinese school gets right, that Western beginner content often misses:**

- Asset **topology** over asset **enumeration** — the relationships and trust boundaries  
  matter more than the count of subdomains.
- Test/staging environments as a first-class priority, because they're weaker and often  
  wired to production data.
- API documentation as an attack-surface map.
- JS bundle mining as a primary, not incidental, technique.
- A hard 30/50/20 time split between recon, manual testing, and automation+reporting.
- Explicit instruction on what **not** to automate.

### Russia — deep, and rapidly growing

- **Standoff 365 Bug Bounty** (Positive Technologies) — described as the largest  
  professional cybersecurity community, with 30,000+ specialists from 60 countries. Its  
  top bounty reached 60 million rubles (≈ $680,000). Russian bug bounty expanded sharply  
  after 2022 as sanctions pushed domestic programs.
- **Habr** — `habr.com`. The main venue for Russian-language technical writeups; search  
  for багбаунти and 漏洞-adjacent methodology posts.
- **Securelist** — `securelist.ru`. Kaspersky's research blog. Useful for understanding  
  how a security vendor thinks about attack surface.
- **SecurityLab / Security Center** — Russian security news and analysis.

The Russian school is strong on thorough manual web application testing and on  
kernel/binary work — useful later if you drift toward product targets.

### Japan / Korea / India

- **Japan** — a mature, formalised community. Look for writeups from Yahoo! Japan and  
  Cybozu programs, and the JPCERT/CC coordination ecosystem. Japanese researchers tend  
  toward very precise, well-documented reports — good models for report writing.
- **India** — one of the largest hunter populations. Strong on practical tutorials and  
  YouTube methodology content; also where a lot of the beginner-friendly tooling  
  tutorials originate.
- **Korea** — KISA-run programs and a strong CTF pipeline feeding into bounty work.

### Cross-cutting resources

- **`ARPSyndicate/bug-bounty-domains`** — domains belonging to well-known public  
  programs. Useful for finding targets with real scope.
- **`screetsec/Sudomy`** — subdomain enumeration with a Chinese-authored workflow.
- **BugHunter** — a 2026 AI-orchestrated CLI toolkit with native scope awareness: it  
  pulls current asset lists from HackerOne, Bugcrowd, Intigriti and Immunefi  
  automatically. Worth watching, but treat AI-generated findings as leads, never as  
  submissions — the Chinese guide warns specifically that AI analysis must be  
  human-verified, having seen it link unrelated code into fake vulnerability chains.

---

## 8. Your first 90 days

### Days 1–30 — Build the base, earn nothing

- Complete PortSwigger Academy: **access control, business logic, SSRF, XSS, file  
  upload**. This is the exact subset Intigriti pays for.
- Set up Burp with the header and the 100 ms throttle. Get fluent with Repeater.
- Connect to the Intigriti PWN environment and map it end to end — every page, every  
  request, a written endpoint inventory.
- Submit **one** report, even if you think it's marginal. The feedback loop is the  
  point. Getting triage feedback on a real submission teaches more than a month of labs.
- **Target: one valid submission.**

### Days 31–60 — Go deep on one bug class

- Pick **broken access control** and read every writeup you can find on it  
  (`bug-bounty-reference` sorted by bug type is ideal).
- Re-run your PWN inventory hunting only IDOR. Then only business logic. Then only  
  stored XSS.
- Add JS mining to your routine on every target — build a small script to extract  
  endpoints and secret-shaped strings from bundles.
- Start on a **VDP program** with wider scope for volume practice.
- **Target: two to three valid submissions, one of them Medium.**

### Days 61–90 — Specialise and build reputation

- Choose a niche and own it. Options that pair well with your existing skills: API  
  security, multi-tenant isolation testing, or — given your background — moving back  
  toward product/binary targets later.
- Build your personal knowledge base. The Chinese guide's advice is worth following  
  literally: after every project, write up the assets, the findings and the exploitation  
  paths into a searchable store. Next time you meet a similar target you retrieve  
  instead of rediscovering.
- Keep a public presence — writeups, a blog. Intigriti and the wider community reward  
  visibility, and private invites often follow.
- **Target: leaderboard position on at least one program; a private invite.**

---

## 9. Sources

Everything above is traceable to the following.

**Intigriti**

- Intigriti's own program (scope, tiers, bounties, rules, SLAs):  
  `app.intigriti.com/programs/intigriti/intigriti/detail`
- Intigriti researcher hub: `intigriti.com/researchers`
- Intigriti blog: `blog.intigriti.com`
- Intigriti platform changelog: `intigriti.com/changelog`

**Chinese methodology and community**

- 《2026漏洞挖掘实战：从攻击面梳理到AI与云原生安全》, CSDN, 2026-10-10 —  
  `blog.csdn.net/weixin_29414405/article/details/167518401`. The source for the asset-  
  topology shift, API-first thinking, JS mining, the 越权-first strategy, the 30/50/20  
  time split, the don't-automate list, and the report structure.
- 《三个月拿下5个CVE》 CSDN, 2026-03-11 — beginner experience; top five easy bug classes.
- 先知社区 (xz.aliyun.com) — 信息收集 and 渗透测试 articles.
- FreeBuf ARL deployment guide — `freebuf.com/vuls/249801.html`
- 《从平台选择到自动化项目采集部署》, CSDN, 2026-06-29 — platform comparison;  
  recommends Bugcrowd VDPs as a beginner start.

**Russian**

- Standoff 365 Bug Bounty (Positive Technologies) — community scale and top bounty.
- 安全内参 (secrss.com) — coverage of the Russian bug bounty boom.
- Securelist RU — `securelist.ru`

**Tools and references**

- `sw33tLie/bbscope` — multi-platform scope aggregation
- `KingOfBugbounty/KingOfBugBountyTips` — recon one-liners
- `djadmin/awesome-bug-bounty`, `ngalongc/bug-bounty-reference` — writeup indexes
- `TophantTechnology/ARL` — 灯塔 asset reconnaissance system
- `screetsec/Sudomy` — subdomain enumeration
- `ARPSyndicate/bug-bounty-domains` — public program domains
- ProjectDiscovery suite — subfinder, dnsx, httpx, naabu, katana, nuclei
- BugHunter — 2026 AI-orchestrated recon CLI with platform scope awareness

---

## One last thing

The pattern across every source — Chinese, Russian, European, American — is the same,  
and it's worth stating plainly because it's counterintuitive:

**The tooling is not the differentiator.** Every source independently concluded that  
automation finds noise and humans find bugs. The Chinese guide put it best: scanners  
don't understand business logic, and their false-positive rate means most reports built  
on them get rejected. The Russian community's top payouts come from manual web  
application testing. Intigriti's own unpaid list is essentially a list of things a  
scanner can find.

What differentiates you is: **reading the JavaScript nobody read, understanding the  
business logic well enough to spot the flaw in it, and writing a report so clear the  
vendor can reproduce it on the first try.**
