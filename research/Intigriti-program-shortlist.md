# Intigriti — paid program shortlist for a beginner (v2)

Revised 2026-10-16. Liferay DXP confirmed **suspended** — removed as a recommendation.
New primary recommendation below.

---

## The answer: Personio

`app.intigriti.com/programs/personio/personio/detail`

**Status: Public · Open · Active.** Business & Professional Services — Personio is
Europe's leading HR software for SMEs.

This is a better beginner program than anything I found earlier, including Intigriti's
own, and the reason is one line in their scope: **you create and own your own test
instance.**

### Why this beats everything else I looked at

| | Personio | Intigriti's own | Liferay DXP | Red Bull |
|---|---|---|---|---|
| Status | **Active** | Active | ❌ Suspended | Open |
| Paid | **Yes** | Yes | Yes | ❌ No money |
| **Minimum bounty** | **€175** | €50 | $100 | — |
| Own dedicated instance | **Yes** | Shared env | Yes (Docker) | No |
| Scope width | Wide wildcards | 5 assets | 5 versions | Wide |
| Published severity examples | **Yes** | No | Partial | No |

The **€175 floor at Tier 2** is the highest minimum I found on the platform. Compare:
Intigriti's own pays €50 for the same severity band. If you find a genuine Low or Medium
on a Tier 2 Personio asset, you are paid at least €175.

### Payout table

| Severity | Tier 2 | Tier 3 |
|---|---|---|
| Low (0.1–3.9) | €175 | €50 |
| Medium (4.0–6.9) | €350 | €100 |
| High (7.0–8.9) | €1,125 | €450 |
| Critical (9.0–9.4) | €3,000 | €1,000 |
| Exceptional (9.5–10.0) | €5,000 | €2,000 |

They also pay **bonuses for high-quality reports** — they say explicitly that reports
with a clear proof of concept, "especially videos," are higher quality and that they
reward those additionally. That is a direct instruction: **record a video of your PoC.**
For a beginner this is the cheapest way to increase a payout.

### The own-instance mechanic — read this carefully

This is the whole reason I'm recommending it:

> "Testers must create their own instances… using **Trial instances** at
> `https://www.personio.com/free-trial/`. The environments come preloaded with
> **realistic user data**… Trial accounts are limited to a 14 day trial period and new
> accounts need to be created when these expire."

Setup, in order:

1. **Register with your `@intigriti.me` address.** This is required by the rules of
   engagement, not optional.
2. Name your company exactly `sec-test-<intigriti handle>-<nn>` — for example, handle
   `l27sen` becomes `sec-test-l27sen-01`. Your instance lands at
   `https://sec-test-l27sen-01.personio.de/`.
3. **Create at least TWO instances.** The bug class they most want is cross-tenant data
   leakage, and you cannot test that with one instance. Two trials = tenant A and
   tenant B = your entire test bed.
4. Recreate them when the 14-day trial expires. Budget for this — it's the one real
   friction point.

What this buys you: a full-featured, real HR SaaS platform, preloaded with realistic
data, at a URL that belongs to you alone. Nobody else is hammering it. You cannot
degrade anyone else's service. You can test destructively within your own tenant.

### What they actually pay for

They publish this directly, which removes all guesswork:

**"We are specifically looking for the following issues:"**

- **Cross-Tenant Data Leakage / Access** ← the big one
- RCE on Personio infrastructure
- Personio production database access
- Personio infrastructure access
- Sensitive Personio company financial or customer information publicly available

And their severity mapping, with examples:

| Rating | Examples they give |
|---|---|
| **Exceptional** | Remote Code Execution · Access to AWS keys |
| **Critical** | Access to all users/accounts · Account takeover · **Multi-tenant PII access** |
| **High** | Stored XSS (**cross-tenant only**) · Access to one user/account · Privilege escalation with account takeover — **"making yourself admin, gaining access to salary info"** |
| **Medium** | Stored XSS (single-tenant) · Reflected XSS with no/limited user interaction · Privilege escalation exposing GDPR data |
| **Low** | Reflected XSS with user interaction · XSS broken in Chrome/Safari/IE · Full path disclosure |

**Note the salary line.** This is HR software. Escalating to a role that exposes salary
data is rated **High — €1,125**. That is a concrete, reachable target: find a
privilege-escalation path inside your own tenant that reveals salary information.

### Scope

**Tier 2 (the higher-paying tier):**

```
*.app.personio.com              *.app.personio-dev.com
*.personio-internal.de          *.personio.tools
api.personio.com                api.personio-dev.com
https://*.personio.de           https://*.personiowhistleblowing.com
https://hug.personio.com
https://sec-test-<intigriti handle>-<nn>.personio.de    ← your instance
```

**Tier 3:** `community.personio.com`, `www.personio.com/free-trial/`,
`www.personio.de/kostenlos-testen/`, and other Personio-owned assets.

**Out of scope (notable):**
- `personio.slack.com`, `statuspage.personio.de`, `support.personio.de`,
  `www.personio.com`, `www.personio.es`, `www.personio.de`
- The **Conversations** product — entirely out of scope
- **Broken access control within the same tenant**, unless it crosses tenant boundaries
  or exposes sensitive data. They define same-tenant first name / last name / email as
  *not* sensitive. So "I hid the employee list but found a coworker's name in an API
  endpoint" earns nothing. **Cross the tenant boundary or don't bother.**
- The standard Intigriti unpaid list (self-XSS, CSRF without impact, clickjacking,
  missing headers, cookie flags, rate-limit bypass, banner grabbing, blind SSRF, etc.)

**Do note the strict traffic limit: maximum 2 requests/second.** That is five times
stricter than Intigriti's own program. Set your throttle to 500 ms before you start, or
you risk a ban. Their SLA for verifying submissions is 10 working days.

---

## Runner-up: Intigriti's own program

Still the best *confirmed-safe* option and the best place to learn mechanics.

- Active · Open · Public · paid
- Tiers: €50–€13,337 (Tier 2) · €50–€5,000 (Tier 3) · up to €1,500 (Tier 4)
- **PWN practice environment** — play "without any restrictions"
- Triage: <24h first response, <2 days to decision · €25 bonus for fast validation,
  €50 for verifying a fix
- Rules: max 10 req/s, header `X-Intigriti-Username: <username>`

Use it alongside Personio: PWN to rehearse safely, Personio to actually earn.

---

## Also on the platform

**Visma** — the world's largest business software network. They run **two** Intigriti
programs: a *Responsible Disclosure* program (swag for Medium+, no money) and a separate
**Public Bug Bounty Program** where monetary rewards apply — but **only to the specific
assets listed in that program's scope**. Their disclosure policy covers "all Visma
services, products or web properties," so the surface is enormous; just don't expect
payment outside the bounty scope. Worth checking once you're logged in.

**Red Bull** — public, wide scope, but explicitly "a responsible disclosure program
**without bounties**." Rewards are trays of Red Bull (1/3/6 by severity). Good for
practice and reputation; zero money. Note: max 5 req/s, `@intigriti.me` required, and
automated domain-enumeration tools are forbidden.

**Adobe** ($75–$15,000) and **GlobalSign** (30+ domains) look attractive but their pages
return "Forbidden" without an account. Check them once logged in — Adobe's $75 floor is
beginner-friendly if you can get access.

---

## Why "own instance" is the pattern to look for

Both of my top two recommendations share one property: **the target is yours, not a
shared production system.** Personio gives you a trial tenant. Liferay gave you a Docker
container. This is the single most valuable filter for a beginner, because it removes
every obstacle that stops beginners:

- No risk of harming real users, so you can test destructively
- No race against 150,000 other researchers on the same endpoints
- No rate-limit anxiety (within reason)
- 14-day renewable trials instead of a one-shot opportunity
- Realistic preloaded data, so your findings look like real findings

**When you browse the directory, look in the scope for:** "create your own", "trial",
"instance", "Docker", "download", "install", or a source repository link. If the scope
hands you your own copy of the software, that's your program.

---

## Your setup, concretely

Run these three in parallel:

1. **Personio** — your money target. Two trial instances, tenant A and tenant B. Hunt
   cross-tenant access control.
2. **Intigriti's own PWN environment** — where you rehearse the technique safely and get
   triage feedback in under 48 hours.
3. **A VDP** — volume and reputation, which unlocks private paid programs later.

**Rules to set before your first request:** throttle to 500 ms (2 req/s), add
`X-Intigriti-Username: l27sen`, and make sure your Personio registration used your
`@intigriti.me` address.

---

## Decision

**Take Personio.** Active, public, €175 minimum, your own instance, wide wildcard scope,
published severity examples with concrete targets (salary-data escalation = €1,125), and
bonuses for good PoC videos. Nothing else I found on the platform combines those.

Say the word and I'll build the environment: the two-trial setup, the throttle and header
configuration, an evidence structure, and the cross-tenant access-control test plan
mapped onto Personio's actual feature set.
