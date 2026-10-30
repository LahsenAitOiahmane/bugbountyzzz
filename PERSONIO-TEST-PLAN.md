# PERSONIO — test plan

Run this after Phase 3 of `HUNTER-WORKFLOW.md`, once you have a populated
`recon/identifiers.md`. Prerequisites: both trials created, marker data seeded, 500 ms
throttle and `X-Intigriti-Username` header active.

---

## What Personio actually pays for

They publish it. In priority order:

| Priority | Bug class | Rating | Tier 2 payout |
|---|---|---|---|
| 1 | **Cross-tenant data leakage / access** | Critical if multi-tenant PII | **€3,000** |
| 2 | RCE on Personio infrastructure | Exceptional | €5,000 |
| 3 | Production database access | Exceptional | €5,000 |
| 4 | Infrastructure access | Exceptional | €5,000 |
| 5 | Sensitive company financial / customer data public | Critical | €3,000 |
| 6 | Privilege escalation **exposing salary data** | **High** | **€1,125** |
| 7 | Cross-tenant stored XSS | High | €1,125 |
| 8 | Access to one user/account | High | €1,125 |
| 9 | Privilege escalation exposing GDPR data | Medium | €350 |
| 10 | Stored XSS (single-tenant) | Medium | €350 |

**Read the trap in #9 and #10 carefully.** Single-tenant findings are Medium at best,
and same-tenant access control to non-sensitive fields earns *nothing*. Your entire
strategy should be organised around **crossing the tenant boundary** or **reaching
salary data**.

---

## The single most important setup detail

Seed both tenants with unambiguous marker strings before you test:

```
Tenant A  →  a department named  AAA-MARKER-DEPT
Tenant B  →  a department named  BBB-MARKER-DEPT

Tenant A  →  employee  Alice Marker   alice.marker@sec-test-l27sen-01...
Tenant B  →  employee  Bob Marker     bob.marker@sec-test-l27sen-02...
```

Now, when Tenant B's session returns data containing `AAA-MARKER-DEPT`, you have
unambiguous, screenshot-friendly proof of cross-tenant access. This turns a fuzzy
finding into an undeniable one, and it is the difference between €350 and €3,000.

---

## Test battery 1 — horizontal cross-tenant access (the money)

**Hypothesis:** an object identifier from Tenant A is accepted by Tenant B's session.

For every identifier in `recon/identifiers.md`:

1. Log in as an **admin in Tenant B**.
2. Capture a request that carries a Tenant A object ID.
3. Replay it from Tenant B's session.
4. Look for `AAA-MARKER-*` in the response.

Use `idor_sweep.py` — it throttles correctly, records timestamps, and groups responses
so outliers stand out:

```bash
python3 idor_sweep.py \
  --url 'https://sec-test-l27sen-02.personio.de/api/v1/employees/{id}' \
  --ids <tenant-A-ids> \
  --baseline <your-own-id-in-tenant-B> \
  --cookie 'SESSION=<tenant-B cookie>' \
  --header 'X-Intigriti-Username: l27sen' \
  --delay 0.5 \
  --out ./evidence/cross-tenant-employees
```

**Endpoints to sweep, by Personio feature:**

| Feature | What to enumerate | Why it matters |
|---|---|---|
| Employees | `/employees/{id}`, `/employees/{id}/profile` | PII, home address, bank details |
| Compensation | salary / compensation endpoints | **Salary data = High, €1,125** |
| Documents | `/documents/{id}`, download URLs | Contracts, payslips — often direct-file URLs |
| Absence | `/absences/{id}`, `/absence-requests/{id}` | Medical leave is GDPR-sensitive |
| Attendance | time entries by employee ID | |
| Recruiting | `/applicants/{id}`, `/candidates/{id}` | Applicant PII, often the weakest area |
| Reports | `/reports/{id}`, export endpoints | Bulk data, frequently ownership-unchecked |
| Onboarding | task lists by employee | |
| Workflows | `/workflows/{id}`, automation configs | May leak other tenants' config |

**Special attention — export and download endpoints.** These validate the session but
very often skip the ownership check. A report export that accepts an arbitrary tenant or
date-range parameter is the classic Critical. Also check whether document download URLs
are **direct-file links with guessable paths** — a pre-signed URL that never expires, or
a path built from a sequential ID, is a Critical.

**Special attention — the whistleblowing product.** `https://*.personiowhistleblowing.com`
is in scope at Tier 2. Whistleblowing systems hold anonymous, highly sensitive reports
where confidentiality is the entire product promise. Any cross-tenant or unauthorised
access there is likely to be rated at the top of the scale. Worth dedicated time.

---

## Test battery 2 — vertical privilege escalation

**Hypothesis:** a low-privilege user can reach a high-privilege function.

You created a low-role user in each tenant. Use them.

1. Capture every request an **Admin** makes.
2. Replay each from the **Employee** session.
3. A 200 where you expected 403 is a finding.

**Highest-value targets, because of how Personio rates them:**

- **Anything exposing salary or compensation** — this is explicitly listed as High
  (€1,125). Reaching salary data from a non-admin role is your single best
  effort-to-payout ratio on this program.
- Role and permission management endpoints — can you elevate yourself?
- Reports and exports an Employee should not run
- Other employees' documents
- Tenant-wide settings and integrations
- Audit logs

**Also test the escalation chain:** can an Employee modify their own role field, add
themselves to a privileged group, or self-approve a permission request? Self-escalation
is often overlooked because the endpoint looks harmless.

---

## Test battery 3 — path, method and parameter bypasses

When a check exists but you are blocked, try to get around it. Apply to every
403 you encounter:

```
/api/v1/employees/123        →  /api/v1/employees/123/
                             →  /api/v1/employees/123.json
                             →  /api/v1/employees/123?
                             →  /api/v1/Employees/123
                             →  /api/v1/employees/./123
                             →  /api/v1/employees/%31%32%33
                             →  /api/v1/employees/123/../123
```

Method swaps: if `GET` is denied, try `POST`, `PUT`, `PATCH`, `DELETE`, and
`X-HTTP-Method-Override: PUT`.

Parameter tricks: send the ID twice (`?id=own&id=other`), as an array
(`?id[]=own&id[]=other`), with a null byte, or omit the parameter entirely and see what
the default is.

**Check for a separate tenant identifier.** If requests carry both an object ID *and* a
tenant/company/organisation ID, swap each independently. A backend that trusts the
tenant header while validating the object ID is a common and severe flaw.

---

## Test battery 4 — stored XSS into a privileged interface

Cross-tenant stored XSS is rated **High (€1,125)**; single-tenant is only Medium
(€350). So aim for input that a user in *another* tenant will render.

Fields a human will read in another tenant's session — this is where to try:

- Support messages and comments
- Document names and descriptions
- Applicant names and cover-letter fields (recruiters in other tenants may see them in
  shared pipelines)
- Free-text fields in workflows and automation configs
- Uploaded filenames
- Integration display names

Payloads that survive naive sanitisation:

```html
<img src=x onerror=alert(document.domain)>
<svg/onload=alert(document.domain)>
<details open ontoggle=alert(document.domain)>
```

**Impact is the report.** A popup is worth little. Show what the victim's session gives
you — their session token, their ability to read their own tenant's salary data.

---

## Test battery 5 — second-order and indirect identifiers

The most-missed category. Identifiers that don't look like identifiers:

- **Email addresses** in URL paths or parameters
- **Filenames** used as storage keys
- **Slugs** derived from company or employee names
- **Numeric IDs inside exported CSV/PDF/XLSX reports**
- **IDs in email notification links** — password resets, invitations, approval links
- **IDs in calendar or Slack integration payloads**

For each: does changing it return someone else's data? Invitation and approval links are
particularly fruitful — they frequently carry a signed-looking token that is either
unsigned, weakly signed, or not bound to the intended recipient.

---

## Test battery 6 — API keys and integrations

Personio has a public API. Check:

- Can an API key from Tenant B be used against Tenant A's data?
- Are API keys scoped to the tenant, or to the user who created them?
- Do integrations (Slack, calendar, SSO) carry a tenant identifier you can tamper with?
- Is there a webhook configuration that fetches an attacker-controlled URL? → SSRF

**Note:** "API key disclosure without proven business impact" is on their unpaid list.
Finding a key is not a finding. **Using it to reach another tenant's data is.**

---

## Ruled-out register

Keep this current. It stops you retesting the same thing.

| Tested | Endpoint | Result | Date |
|---|---|---|---|
| | | | |

---

## Session plan

| Session | Focus | Output |
|---|---|---|
| 1 | Both tenants seeded, full funnel walked, identifiers inventoried | `recon/identifiers.md` |
| 2 | Horizontal cross-tenant sweep — employees, documents | `hypotheses.md` |
| 3 | Vertical escalation — salary and role endpoints | `hypotheses.md` |
| 4 | Path/method bypasses on every 403 collected | `hypotheses.md` |
| 5 | Exports, downloads, direct-file URLs | `hypotheses.md` |
| 6 | Stored XSS into cross-tenant surfaces | `hypotheses.md` |
| 7 | Second-order identifiers, invitations, API keys | `hypotheses.md` |
| 8 | Verification and report writing for anything confirmed | `findings.md` + evidence |

**Stop rule:** one session per endpoint group, then move on. Log why and don't return
without new information.

---

## Before you submit anything

- [ ] The finding **crosses a tenant boundary** or **exposes salary/GDPR data** — or it
      is worth very little
- [ ] It is not on their unpaid list (`HUNTER-WORKFLOW.md` Appendix B)
- [ ] It is not the Conversations product, and not one of the out-of-scope domains
- [ ] It reproduces from a **clean session** in under five steps
- [ ] I have a **video** of the PoC running end to end — they pay bonuses for this
- [ ] Marker strings (`AAA-MARKER-*`) appear in the evidence, proving the tenant
- [ ] Timestamps and both account IDs are recorded
- [ ] Evidence lives **inside the report** — external hosting breaches the rules
- [ ] I have not accessed more data than the minimum needed to prove it
