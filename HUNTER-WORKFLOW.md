# HUNTER-WORKFLOW — a reusable bug bounty methodology

Version 1.0 · 2026-10-16

This is **program-agnostic**. It works on Personio, on Intigriti's own program, on any
BI.ZONE target, on HackerOne — anything. It is the workflow you run every time, with a
per-program `scope.md` layered on top for the specifics.

Everything here is distilled from European, American, Chinese and Russian practice
(see the Sources section of `research/Intigriti-beginner-playbook.md`).

---

## How to use this

1. Run `scripts/new-program.sh <program-name> <program-url>` to scaffold a workspace.
2. Fill in `scope.md` completely. Do not skip a single field.
3. Run the phases in order. Each phase has a **Goal**, **Actions**, **Output** and a
   **Gate** — do not pass a gate until its output exists.
4. Log continuously in `notes.md`. Never reconstruct from memory later.
5. When you find something, follow Phase 5 and 6 exactly. Most rejections are
   process failures, not technical ones.

---

## The prime directive

**Compliance is not optional, and it is not a formality.** You are one rate-limit
breach or one out-of-scope host away from a ban, a rejected report, or losing safe
harbour protection. Every phase below has a gate that includes a compliance check.

Before your **first request** on any program, all of these must be true:

- [ ] I have read the current scope, and it is recorded in `scope.md`
- [ ] I have read the out-of-scope list, including the program's own unpaid-vuln list
- [ ] I know the **maximum request rate** and my tooling is throttled below it
- [ ] I have added the **required attribution header** to all traffic
- [ ] I am using **accounts I registered myself**, with the required email domain
- [ ] I know the program's **status** (active / paused / suspended) and it is active
- [ ] I know whether **test/staging environments are in scope** for this program

---

## The three rules that actually decide your outcomes

Everything else is detail. These three, learned the hard way across every community:

### 1. Scanner output is worth zero

Every platform's unpaid list is essentially a list of things a scanner can find. Self-XSS,
missing headers, cookie flags, version disclosure, rate-limit absence, clickjacking,
blind SSRF, CORS on non-sensitive endpoints. Automated output also breaches the rules of
engagement on most programs.

**Use tools to expand coverage. Use your brain to find bugs.** A Chinese methodology
guide put it plainly: newcomers who "scan the whole site and export a few hundred
alerts" get nine out of ten reports rejected, because scanners don't understand business
logic and their false-positive rate is enormous.

### 2. Authorization is about data ownership, not endpoint path

This single sentence is the highest-value idea in bug bounty. Most access-control bugs
are not "no auth check" — they are "we verified you are *logged in* but never verified
you are *entitled to this specific object*."

Consequence: **the identifier is the attack surface.** Any request carrying an ID,
number, email, phone or slug is a candidate. Sort them, rank them, test them.

### 3. The target you own beats the target you share

Programs where you create your own instance, download the software, or get a dedicated
trial tenant are worth more to a beginner than a bigger bounty on a shared production
system. No risk of harming users, no racing the crowd, renewable, and often white-box.
**Always prefer these when the option exists.**

---

## Time budget

Per hunting session, and per program overall:

| Activity | Share | Why |
|---|---|---|
| Recon and attack-surface mapping | 30% | Decides the ceiling of everything after |
| Manual testing and business logic | 50% | Where every real bug comes from |
| Automation support and report writing | 20% | Force multiplier, not the point |

Most beginners invert this — 80% tooling, 20% thinking. It does not work.

**Hard rule:** if you have spent more than a full session on one endpoint without a
result, move on. Record why in `notes.md` and never return unless new information
appears.

---

# Phase 0 — Intake and guardrails

**Goal:** eliminate every reason a valid finding could be rejected or land you in trouble.

**Actions:**

1. Read the program page. Extract into `scope.md`:
   - Program URL, status, whether public or invite-only
   - Every in-scope asset, with its **tier** and therefore its payout band
   - Out-of-scope assets and the unpaid vulnerability classes
   - Maximum request rate · required header · required email domain · SLA
   - Whether test/staging hosts are in scope
2. Configure your proxy:
   - **Throttle below the limit.** If the limit is 2 req/s, set a 500 ms fixed delay.
     If 10 req/s, set 100 ms. Never set it to "just under" — set it comfortably below.
   - **Add the attribution header** globally via Match and Replace, scoped to in-scope
     hosts only.
3. Note the payout table and the **multiplier or tier system**. Write the ranked list of
   which assets are worth the most per bug class.
4. Scaffold the workspace: `scripts/new-program.sh`.

**Output:** a complete `scope.md`, a configured proxy, a scaffolded workspace.

**Gate:** every checkbox in the prime directive above is ticked.

---

# Phase 1 — Asset topology

**Goal:** know what the organisation actually owns, and how the pieces trust each other.

Not just "enumerate subdomains." The 2026 Chinese methodology is emphatic: asset
*relationships* and *trust boundaries* now matter more than the count of hosts, because
companies frequently don't know their own estate.

**Actions:**

1. **Establish ownership.** Certificate transparency logs, DNS history, WHOIS and
   corporate registration records. Confirm root domains rather than assuming. If the
   program gives you a scope list, that is authoritative — but verify the wildcards
   resolve.
2. **Expand the edges.** Passive subdomain sources first. If the program permits active
   enumeration, brute-force within the rate limit. Reverse-resolve third-party service
   domains out of JavaScript.
3. **Classify every host.** Tag each with a type:

   | Type | Why it matters |
   |---|---|
   | Main site | Usually hardened, low yield |
   | Admin / back office | High-value target, often weaker auth |
   | API gateway | The real attack surface |
   | **Test / staging / dev** | **Highest priority** — weaker controls, often wired to production data |
   | Third-party hosted | Usually out of scope — check first |

4. **Prioritise anything named** `test`, `dev`, `staging`, `uat`, `qa`, `internal`,
   `preprod`. These are the hosts where serious bugs live, because they were stood up
   for convenience rather than security.

**Output:** `recon/assets.md` — every host, its type, its tier, and its priority.

**Gate:** every in-scope asset is accounted for, classified, and ranked.

---

# Phase 2 — Surface discovery

**Goal:** turn hosts into endpoints, and endpoints into a ranked inventory.

**Actions, in this order of value:**

### 2a. API documentation — the fastest win

Machine-readable API specs *are* an attack-surface map. A huge share of modern stacks
expose their entire backend structure this way. Probe, per host:

```
/swagger-ui.html      /swagger/index.html
/v3/api-docs          /v2/api-docs
/api-docs             /openapi.json
/graphql              (then try introspection)
/actuator             /actuator/mappings
```

Watch for path keywords: `api` · `v1` · `v2` · `internal` · `private` · `gateway` ·
`admin` · `debug`.

When you find a spec, build a table: endpoint · method · parameters · auth requirement.
Then ask the four questions that generate hypotheses:

- Which endpoints have **no auth middleware**?
- Which return **bulk data** (lists, exports, reports)?
- Which accept a **file**?
- Which perform **state changes** (POST / PUT / PATCH / DELETE)?

### 2b. JavaScript bundle mining — the most underrated technique

In a bundled SPA, the frontend contains the backend's route table. This is described in
Chinese methodology writing as "one of the most stable information-disclosure sources."
Download every bundle and grep for:

| Pattern | Looking for |
|---|---|
| `/internal/`, `/admin/`, `/management/`, `/debug/` | Hidden route namespaces |
| `secret`, `token`, `api_key`, `accessKey`, `apikey` | Credentials and key names |
| `oss`, `cos`, `s3`, `storage`, `bucket` | Cloud storage endpoints |
| `graphql`, `/api/v`, `/rest/` | API roots |
| `feature`, `flag`, `beta`, `preview` | Unreleased functionality |

A documented real case: a researcher found an `/internal/`-prefixed path in a JS chunk,
noticed the endpoint authenticated via a **custom header** rather than a Cookie or
Authorization header, supplied a valid value, enumerated order IDs, and read other
customers' orders including shipping addresses and payment references. Rated High,
confirmed within an hour — from a JavaScript file.

**This is the single highest-leverage skill in this document.** Spend real time here.

### 2c. Historical URLs

Pull from the Wayback Machine and Common Crawl. Forgotten endpoints are a rich seam:
version drift (`/api/v1/` → `/api/v2/`) frequently leaves the old handler alive and
unpatched.

### 2d. Content discovery

Directory and file brute-force with a custom wordlist, throttled. Default wordlists are
a starting point, not a strategy — build yours from the target's own vocabulary
(product names, feature names, the terms you found in the JS).

**Output:** `recon/endpoints.md` — a ranked endpoint inventory, with the
no-auth / bulk-data / file / state-change flags marked.

**Gate:** you can name the ten most interesting endpoints and say why.

---

# Phase 3 — Authenticated surface mapping

**Goal:** know every request the application makes on behalf of a logged-in user, and
every identifier it carries.

**Actions:**

1. **Create your accounts**, following the program's rules exactly. If it requires a
   specific email domain or a naming convention for instances, follow it — these are
   often how the program attributes your traffic and finds your test data.

   **On Intigriti, use the `@intigriti.me` alias system.** Your address is
   `<your-username>@intigriti.me` and it forwards transparently to the email registered
   on your Intigriti account — no second mailbox needed. Crucially, **wildcards work**:
   appending a `+` or `-` suffix to the local part creates a distinct address that still
   reaches you. So `<handle>@intigriti.me`, `<handle>-personio-a@intigriti.me` and
   `<handle>-personio-b-emp@intigriti.me` all land in the same inbox.

   This is how you create as many test accounts as the program needs, at as many
   privilege levels as it needs. **Encode the tenant and the role in the suffix** — when
   you write the report, the reviewer must be able to see unambiguously which account did
   what, and a self-describing address removes all doubt.

   Filter `@intigriti.me` mail into its own folder, and check spam for the first
   confirmations.

2. **Create a second account if the program involves multi-tenancy.** Cross-tenant access
   is usually the most valuable bug class, and you cannot test it with one account. Many
   programs expect you to do this.
3. **Walk the entire funnel** with the proxy recording:
   - Registration → email confirmation → login → password reset → 2FA
   - Profile edit → upload → download
   - Every object you can create: record, document, invoice, key, message, link
   - Every list view, then the detail view of each item in that list
   - Every settings screen, especially permissions, roles and sharing
4. **Build the identifier inventory.** Sort every identified request:

   | Class | Meaning | Priority |
   |---|---|---|
   | **Guessable** | Sequential integers, short strings, timestamps, base64 of either | Highest |
   | **Self-referential** | Derived from your own account, but other people's exist too | Highest |
   | **Unguessable** | Long random UUIDs | Lower — try to *leak* one instead |
   | **Indirect** | Filenames, slugs, emails | Medium — often overlooked |

**Output:** `recon/identifiers.md` — every request carrying an identifier, classified.

**Gate:** you know exactly which endpoints to test first, and why.

---

# Phase 4 — Hypothesis-driven hunting

**Goal:** convert the inventory into confirmed findings.

Work in this order. It is ordered by (likelihood of success) × (payout).

## 4a. Access control — always first

The most reliable bug class in 2026, with the clearest verification path. Concentrates in:

- **Bulk and list endpoints** — change an ID, read someone else's data
- **Export and download functions** — frequently validate the session but never the data
  ownership
- **Admin and support interfaces** — a normal user calling privileged functions
- **Multi-tenant boundaries** — one tenant reaching another. Usually the most severe
- **Write paths where the read path is protected** — extremely common
- **Role and permission settings** — escalating your own role

**The standard battery, per candidate endpoint:**

1. **Swap the identifier.** Substitute another account's value and diff the response.
   Use `idor_sweep.py` — it throttles, records timestamps, and flags outliers.
2. **Apply a low-privilege session to a privileged endpoint.** A 200 where you expected
   403 is a finding.
3. **Change the HTTP method.** If GET is denied, try POST, PUT, PATCH, DELETE.
4. **Fuzz the path.** `/api/x/123` → `/api/x/123/`, `/api/x/123.json`, `/api/x/123?`,
   `/api/X/123`, `/api/x/./123`, `/api/x/%31%32%33`. Authorization is often attached to
   one route pattern and misses its neighbours.
5. **Remove the authorization parameter entirely** — sometimes the check is
   `if (param && !authorized)`.
6. **Test the tenant header.** If the request carries a tenant, organisation or company
   ID separate from the object ID, swap that too. This is where cross-tenant bugs live.

## 4b. Business logic

Highest-value class that scanners can never find, because impact is self-evident.
Look for: race conditions (parallel requests on a one-time action), negative or
overflowing quantities, coupon and referral reuse, state machine bypass (skipping a
payment step), price and currency manipulation, self-approval in an approval workflow,
and any "one per account" limit.

## 4c. Stored XSS into a privileged interface

If an admin, support agent or operator will later read your input, that is a target.
Rate it by *what the privileged session yields*, not by the popup. Submit payloads in
every field a human will read: support messages, document names, profile fields, free
text, uploaded filenames.

## 4d. SSRF

Anywhere the server fetches a URL for you: link previews, webhooks, import-from-URL,
avatars, PDF generators, site checkers. Prove it with a callback (Burp Collaborator or
interactsh), then push for a **readable response** — blind SSRF is usually unpaid or
paid at the bottom band.

## 4e. File upload

Only worth reporting with **proof the file landed** (most programs say so explicitly) or
proof of execution. Check: extension filtering, content-type trust, path traversal in
the filename, and whether the upload directory is web-reachable.

## 4f. SQL injection

Rare now, but the highest-paying. Manual, careful, read-only, and stay inside whatever
enumeration the program permits.

## 4g. Cloud and configuration

Public buckets, over-permissive roles, exposed managed databases, secrets in
infrastructure-as-code, unauthenticated cloud functions. Check response headers, URL
patterns and storage domains for the cloud provider, then test the specific
misconfiguration.

**For every hypothesis, write in `hypotheses.md`:** the claim, the endpoint, the test,
the result. Including the negative results — knowing what you already ruled out is worth
as much as what you found.

**Output:** entries in `findings.md` for anything confirmed; `hypotheses.md` complete.

**Gate:** every guessable-identifier endpoint from Phase 3 has been tested.

---

# Phase 5 — Verification

**Goal:** make the finding impossible to dispute and impossible to misread.

The most common reason a valid bug is rejected is that the vendor "cannot reproduce it."
Run this every time:

1. **Reproduce from a clean state.** Fresh browser profile, no cookies, no storage. If
   it only works in your logged-in session, it is not reproducible.
2. **Make the impact visible.** For access control: how many records, which sensitive
   fields. For injection: how far you got. Vague impact means low severity.
3. **Do the minimum.** Show it *can* be exploited, then stop. Do not exfiltrate more
   than a few records. Never delete, modify or download beyond the proof.
4. **Capture everything.** Request and response pairs, screenshots, a **screen
   recording of the exploit running end to end** (many programs pay bonuses for video),
   timestamps, and the account IDs used.
5. **Redact properly.** Mask names, numbers, emails — but keep enough context that the
   reviewer can see the data is real. Over-redaction kills severity; under-redaction is
   a privacy violation.

**Output:** `evidence/<date>-<bug-class>-<target>/` containing the raw pair, media and
a `manifest.json`.

**Gate:** you can reproduce it from a clean session, in under five steps, from your
written notes alone.

---

# Phase 6 — Reporting

**Goal:** get paid.

**Structure that works:**

1. **Title** — asset plus vulnerability plus impact. Not "IDOR", but "Authenticated IDOR
   in `/api/documents/{id}` exposes other tenants' HR documents."
2. **Summary** — two sentences: what it is, what it affects.
3. **Scope** — exact URL, endpoint, parameter, environment, and account used.
4. **Steps to reproduce** — numbered, each with request and response.
5. **Evidence** — the proof.
6. **Impact** — concrete business risk, in the vendor's language. Not a CVSS recital.
7. **Remediation** — one or two actionable suggestions.

**Before submitting, check:**

- [ ] Is it a duplicate? Search the program's disclosed reports and the vendor's
      advisories first.
- [ ] Is it on the unpaid list? Re-read it.
- [ ] Is the impact demonstrated, not asserted?
- [ ] Is the environment in scope?
- [ ] Does it reproduce from a clean state?
- [ ] Are all timestamps and account IDs present?

**Rejection causes to pre-empt:** duplicates; "anomalous output" without harm;
out-of-scope environment; environment-specific reproduction you failed to state;
missing PoC.

**Output:** the submitted report, archived in `findings.md`.

---

# Appendix A — What never to automate

Do not put these in a script, on any program:

- Large POST bodies containing payloads
- ID enumeration that could export bulk data or trigger alerts
- Authenticated modules
- Repeated requests to payment, login or SMS endpoints
- Anything that deletes, overwrites or changes configuration
- Anything against a host you have not confirmed is in scope

# Appendix B — The universal unpaid list

Near-identical across Intigriti, BI.ZONE and most other platforms. Assume it applies
unless the program says otherwise:

self-XSS · CSRF without impact · logout CSRF · clickjacking without impact · missing
security headers · missing cookie flags · CORS misconfiguration on non-sensitive
endpoints · rate-limit bypass or absence · username/email enumeration · banner grabbing
and version disclosure · subdomain takeover *without* takeover · blind SSRF without
impact · arbitrary file upload without proof the file exists · HTTP request smuggling
without impact · host header injection without impact · CSV injection · same-site
scripting · reverse tabnabbing · sessions not invalidated · best-practice violations ·
SPF/DMARC/DKIM · email bombing · homograph attacks · XMLRPC enabled · file metadata not
stripped · API keys for third-party services · SSL/TLS scan reports · content injection
without HTML modification · outdated software without a PoC · open ports without a PoC

**If your finding is on this list, either escalate it to demonstrated impact or drop it.**

# Appendix C — Decision rules

| Situation | Do this |
|---|---|
| All identifiers return 403/404 | Access control is enforced. Move to a different endpoint. |
| Response is identical to your own object | The server ignores the identifier. Not an IDOR. |
| One response differs from the rest | That is your lead. Investigate it first. |
| A full session on one endpoint, no result | Stop. Log why. Move on. |
| You found something on the unpaid list | Escalate to impact, or drop it. |
| You can enumerate at scale | Argue the higher tier (mass auth bypass / multi-tenant access). |
| You cannot reproduce from a clean session | You do not have a finding yet. Keep digging. |

# Appendix D — Session checklist

Print this. Run it every session.

```
[ ] Scope re-read today (it can change)
[ ] Proxy throttle set below the limit
[ ] Attribution header active
[ ] notes.md open and being written as I go
[ ] Working on one hypothesis at a time
[ ] Timestamps and account IDs captured
[ ] No automation against authenticated or destructive paths
[ ] Stopping rule: one session per endpoint, then move
```

---

# Appendix E — Where AI fits, and where it gets you banned

You asked whether AI can automate this work. It can automate a lot of it. But you need to
understand what happened to the ecosystem in 2026 first, because it changes the answer.

## The situation

AI-generated low-quality reports have damaged bug bounty badly enough that programs are
shutting down:

- **cURL ended its bug bounty program** — 31 January 2026
- **HackerOne stopped accepting new Internet Bug Bounty submissions** — 27 March 2026
- **Apple limited the number of reports** a researcher may submit — June 2026
- **Intel and Google adjusted their rules** in response to low-quality AI submissions
- **Liferay DXP suspended its program**, citing verbatim "the massive worldwide increase
  in AI-assisted submissions" — March 2026

This is the context for every brutal unpaid list you will read. It is also why Liferay
reopened with a statement saying they want "bugs that require deep logic and manual
testing — things that AI often misses."

**So the answer to "can AI automate this?" is: yes, and that is precisely the problem.**
The automation is easy. The judgement is the scarce thing, and it is still yours.

## The one rule

> **AI output is a lead, never a finding.**

A plausible LLM explanation is not proof of impact. Never submit anything you have not
personally reproduced from a clean session. If you do, you will be rejected — and repeat
offences get you banned. This rule is not negotiable, and it is the difference between
using AI well and being the reason a program shuts down.

## Role assignment — what the testing actually showed

YesWeHack ran Claude Code, Codex and Gemini CLI against blind PortSwigger labs in 2026.
The results are worth knowing because they're counterintuitive:

| Agent | Strength | Weakness |
|---|---|---|
| **Claude Code** (Opus 4.8) | Best at reconnaissance, application reasoning and vulnerability **discovery** | Stalled on exploitation — missed a redirect and looped for ~20 min; server-side result took 34 min and needed manual confirmation |
| **Codex** (GPT-5.6 Sol) | Strongest **autonomous exploitation and validation** — DOM XSS in under 4 min; forged an admin JWT via a `kid` path traversal to `/dev/null` in 1 min 14 s | Narrow sample; no evidence it generalises |
| **Gemini CLI** (Flash-3.5) | Fastest **passive analyst** — found leads in captured traffic within seconds | Refused active testing entirely, even when told the lab was authorised |

Their recommended division of labour, which I'd adopt as-is:

1. Use **Claude Code or Codex** to map the application and form testable hypotheses
2. Use **Gemini CLI** for a separate passive review of code and captured traffic
3. Require **reproducible requests, responses and state changes** before accepting anything
4. Keep a **human** responsible for scope, safety, evidence quality and the final report

## Where AI genuinely helps, phase by phase

| Phase | Use AI for | Do not use it for |
|---|---|---|
| **0 — Intake** | Extracting rules into `scope.md` from a long program page | Deciding what is in scope. Read that yourself. |
| **1 — Topology** | Classifying a host list; spotting patterns in subdomain names | Enumerating — it will invent hosts |
| **2 — Discovery** | ⭐ **JS bundle analysis** — paste a bundle, ask for endpoints, params, secret-shaped strings and route namespaces | Running scans |
| **3 — Mapping** | ⭐ **Turning a Burp export into an identifier inventory** | Deciding which identifiers matter |
| **4 — Hunting** | Generating hypotheses from an endpoint list; explaining unfamiliar frameworks | Executing exploits against live targets unreviewed |
| **5 — Verification** | Adversarial review: "what would make this a false positive?" | Confirming impact — that's your job |
| **6 — Reporting** | Drafting structure, tightening the impact narrative | The final submission text. It must be yours. |

The two starred rows are where the real return is. **JS bundle analysis** and **Burp
export triage** are exactly the tedious, high-volume, pattern-matching tasks that LLMs do
well and humans do slowly — and neither one risks touching the target.

## Where AI must never go

- **Deciding scope.** An LLM will confidently tell you a host is in scope when it isn't.
  That's how you lose safe harbour.
- **Unreviewed active exploitation.** An agent at 50 req/s will get your account banned in
  minutes, and some programs treat that as a rules breach regardless of intent.
- **The final report text.** Reviewers can tell. Write it yourself.
- **Volume.** Generating many low-confidence submissions is the exact behaviour that
  killed cURL's program.

## Prompt patterns that work

**Give it the artefact, not the goal.** "Find me a bug" produces hallucination. Pasting a
JS bundle and asking a specific question produces insight.

```
Here is a JavaScript bundle from an in-scope target.
List every API path, query parameter and string that looks like a
secret, key or storage bucket. Group by namespace. Output as a table.
Do not speculate about vulnerabilities.
```

```
Here is a Burp request log (method, path, params). For each request
that carries an identifier, classify the identifier as sequential,
short-string, UUID, email or slug. Flag any endpoint that looks like
a list, export or download. Output as a ranked table.
```

**Ask it to attack your own conclusion.** After you think you have a finding:

```
Here is my evidence. Argue the strongest case that this is NOT a
vulnerability, and list what I would need to prove to make it
undeniable.
```

That prompt has caught more false positives for me than any scanner.

## The honest expected value

AI will not find your first bug. On a well-tested target, an agent that "scans everything"
will return noise you then have to triage — which is slower than thinking.

What it *will* do is make the boring 30% of the workflow — asset classification, JS
mining, request-log triage — roughly five times faster. That compounds: you get to spend
more of your time on the 50% that is manual business-logic testing, which is where every
real bug actually comes from.

Use it as a research assistant that never gets tired. Not as a hunter.
