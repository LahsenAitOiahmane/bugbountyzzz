# SCOPE — personio

> Pre-filled from the public program page on **2026-10-16**. **Re-verify before every
> session** — programs change without notice, and a stale scope is how you end up
> testing an out-of-scope host.
>
> Verified fields are marked ✅. Anything blank is for you to complete.

## Program

| Field | Value |
|---|---|
| Platform | Intigriti ✅ |
| Program URL | https://app.intigriti.com/programs/personio/personio/detail ✅ |
| Status | **Active / Open** (as of 2026-10-16) ✅ |
| Public or invite-only | Public ✅ |
| Industry | Business & Professional Services — HR software for SMEs ✅ |
| Date scope captured | 2026-10-16 |
| Re-verified on | |

## Rules of engagement — the compliance block

| Field | Value |
|---|---|
| **Max request rate** | **2 requests/second** ✅ — the strictest on the platform |
| **My throttle setting** | **500 ms fixed delay** (set before your first request) |
| **Required attribution header** | `X-Intigriti-Username: l27sen` ✅ |
| **Required email domain** | **`@intigriti.me` — required, not optional** ✅ |
| **Naming convention for test data** | company name `sec-test-l27sen-<nn>` ✅ |
| Safe harbour | Applied ✅ |
| Response SLA | 10 working days to verify ✅ |
| Disclosure permitted? | No — written consent required first ✅ |

## Payout table

| Severity | Tier 2 | Tier 3 |
|---|---|---|
| Low (0.1–3.9) | **€175** | €50 |
| Medium (4.0–6.9) | €350 | €100 |
| High (7.0–8.9) | €1,125 | €450 |
| Critical (9.0–9.4) | €3,000 | €1,000 |
| Exceptional (9.5–10.0) | €5,000 | €2,000 |

**Tier modifiers:** Tier 3 is intentionally impact-based — they say they can bump the
payout with bonuses when impact is extraordinary, even though Tier 3 has lower minimums.

**Bonuses available:** they pay extra for **high-quality reports**, and state explicitly
that reports with a clear proof of concept — **"especially videos"** — are higher
quality. **Record a video of every PoC.** Cheapest payout increase available.

**Highest-value assets, ranked by payout per bug class:**

1. `*.app.personio.com` — Tier 2, the core product. Cross-tenant access here is the top prize.
2. `https://*.personiowhistleblowing.com` — Tier 2. Whistleblowing = anonymous sensitive reports; confidentiality is the product. Any leak is severe.
3. `api.personio.com` — Tier 2. Direct API access, no UI filtering.
4. `*.personio-internal.de` / `*.personio.tools` — Tier 2, internal-sounding, likely weaker.
5. `*.app.personio-dev.com` / `api.personio-dev.com` — Tier 2, dev environments.

## In-scope assets

| Asset | Type | Tier | Notes |
|---|---|---|---|
| `*.app.personio.com` | wildcard | Tier 2 | Core product |
| `*.app.personio-dev.com` | wildcard | Tier 2 | Dev environment |
| `*.personio-internal.de` | wildcard | Tier 2 | Internal-sounding |
| `*.personio.tools` | wildcard | Tier 2 | |
| `api.personio.com` | URL | Tier 2 | Public API |
| `api.personio-dev.com` | URL | Tier 2 | |
| `https://*.personio.de` | wildcard | Tier 2 | |
| `https://*.personiowhistleblowing.com` | wildcard | Tier 2 | Whistleblowing — high sensitivity |
| `https://hug.personio.com` | URL | Tier 2 | |
| `https://sec-test-l27sen-<nn>.personio.de` | URL | **Tier 2** | **Your own trial instances** |
| `community.personio.com` | URL | Tier 3 | |
| `www.personio.com/free-trial/` | URL | Tier 3 | |
| `www.personio.de/kostenlos-testen/` | URL | Tier 3 | |
| Other Personio-owned assets | URL | Tier 3 | |

## Out-of-scope assets

| Asset | Reason |
|---|---|
| `personio.slack.com` | Third party |
| `statuspage.personio.de` | Third party |
| `support.personio.de` | Zendesk |
| `www.personio.com` | Explicitly OOS |
| `www.personio.es` | Explicitly OOS |
| `www.personio.de` | Explicitly OOS |
| **Conversations product** | **Entire product out of scope** |
| `personio.com/careers` | Do not pollute the hiring queue |

## Program-specific unpaid vulnerability classes

> Beyond the universal list in `HUNTER-WORKFLOW.md` Appendix B.

- **Broken access control within the same tenant** — unless it crosses a tenant boundary
  or exposes sensitive data. Personio defines a colleague's **first name, last name and
  email inside your own tenant as NOT sensitive**. Their examples of non-findings:
  - Hidden employee list, but found a coworker's name in an API endpoint (same tenant)
  - Lost access to Surveys, but can see a previously submitted survey elsewhere in the app
  - Employee marked "Terminated"/"Leave" is hidden from the list, but their name and
    previous position are obtainable elsewhere
  - Can use a feature briefly after it was disabled
- **DoS / CPDoS** — only conditionally in scope, and only against `*.app.personio.com`
  under specific criteria. Do not test DoS otherwise.
- API key disclosure **without proven business impact**
- HTML injection without demonstrated security impact
- Plus the full standard Intigriti list (self-XSS, CSRF, clickjacking, missing headers,
  cookie flags, rate-limit bypass, banner grabbing, blind SSRF, host header injection
  without impact, etc.)

## What they ARE looking for

Published verbatim:

- **Cross-tenant data leakage / access** ← the top priority
- RCE on Personio infrastructure
- Personio production database access
- Personio infrastructure access
- Sensitive Personio company financial or customer information publicly available

## Severity examples they publish

| Rating | Examples |
|---|---|
| Exceptional | Remote Code Execution · Access to AWS keys |
| Critical | Access to all users/accounts · Account takeover · Multi-tenant PII access |
| High | Stored XSS (**cross-tenant only**) · Access to one user/account · Privilege escalation with account takeover — **"making yourself admin, gaining access to salary info"** |
| Medium | Stored XSS (single-tenant) · Reflected XSS with no/limited interaction · Privilege escalation exposing GDPR data |
| Low | Reflected XSS with user interaction · XSS broken in Chrome/Safari/IE · Full path disclosure |

## Test / staging environments

- [x] In scope — `*.app.personio-dev.com`, `api.personio-dev.com` are Tier 2
- [x] You create your own trial instances (Tier 2)

## Accounts

All four addresses are wildcard aliases of `l27sen@intigriti.me` — they all forward to
the inbox registered on the Intigriti account. Fill in passwords as you create them.

| Tenant / role | Email | Password | Notes |
|---|---|---|---|
| sec-test-l27sen-01 / Admin | `<handle>-personio-a@intigriti.me` | | Tenant A — register first, becomes admin. Seed with `AAA-MARKER-*` |
| sec-test-l27sen-01 / Employee | `<handle>-personio-a-emp@intigriti.me` | | Invite after. Low privilege — for vertical escalation tests |
| sec-test-l27sen-02 / Admin | `<handle>-personio-b@intigriti.me` | | Tenant B — register first, becomes admin. Seed with `BBB-MARKER-*` |
| sec-test-l27sen-02 / Employee | `<handle>-personio-b-emp@intigriti.me` | | Invite after. Low privilege — for vertical escalation tests |

**Trial expiry dates:** Tenant A ______ · Tenant B ______ (recreate on day 12)

**Mail setup:** filter everything arriving at `@intigriti.me` into a dedicated folder.
Check spam for the first confirmations.

## First-session checklist

- [ ] Scope re-read today
- [ ] Throttle set to 500 ms
- [ ] `X-Intigriti-Username: l27sen` header active, scoped to Personio hosts only
- [ ] `@intigriti.me` address obtained and used for registration
- [ ] Both trial instances created with the `sec-test-l27sen-<nn>` naming
- [ ] Marker data seeded in both tenants
- [ ] Low-privilege user created in both tenants
- [ ] `notes.md` open and being written as I go
