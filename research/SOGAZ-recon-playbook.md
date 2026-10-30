# SOGAZ (АО «СОГАЗ») — recon & IDOR playbook

Program: `bugbounty.bi.zone/companies/sogaz` · Active · own triage · 34 reports / 90 days
Compiled 2026-10-12. Re-check the Tasks section before you start — scope changes.

---

## 0. Scope, verbatim from the Tasks section

| Asset | What it is | Criticality | Paid |
|---|---|---|---|
| `sogaz.ru` | Main site | **critical** | yes |
| `secret.sogaz.ru` | **Secret transfer service** | **critical** | yes |
| `edo.sogaz.ru` | Electronic document management | high | yes |
| `b2b.sogaz.ru` | Corporate client portal | high | yes |
| `shop.sogaz.ru` | Insurance product purchase | medium | yes |
| `direct.sogaz.ru` | OSAGO quote & registration | medium | yes |
| `claim.sogaz.ru` | Claims handling | medium | yes |
| `lk.sogaz.ru` | Personal cabinet | medium | yes |
| `adinsure.sogaz.ru` | Insurance platform | medium | yes |
| `medonline.sogaz.ru` | Electronic medical registry | medium | yes |
| `discount.sogaz.ru` | Partner cabinet | medium | yes |
| `opros.sogaz.ru` | Customer surveys | medium | yes |
| `go.sogaz.ru` | Short-link service | medium | yes |
| `sanatorium.sogaz.ru` | Sanatorium landing | medium | yes |
| `pl.sogaz.ru` | «Первые лица» | medium | yes |
| `parusa.sogaz.ru` | Special project | medium | yes |
| `data.sogaz.ru` | File-exchange cloud | low | yes |
| `omnichat.sogaz.ru` | Support messaging | low | yes |
| `*.sogaz.ru` | Everything else | low | yes |
| `tc.sogaz.ru` | Video conferencing | info | **no** |

### The multiplier is the whole game

Payout = base reward for the bug class × scope-criticality multiplier.

| Criticality | Multiplier | IDOR (30 000 ₽ base) | SSRF w/ read (80 000 ₽) | SQLi (200 000 ₽) |
|---|---|---|---|---|
| critical | ×1.00 | 30 000 ₽ | 80 000 ₽ | 200 000 ₽ |
| high | ×0.75 | 22 500 ₽ | 60 000 ₽ | 150 000 ₽ |
| medium | ×0.50 | 15 000 ₽ | 40 000 ₽ | 100 000 ₽ |
| low | ×0.25 | 7 500 ₽ | 20 000 ₽ | 50 000 ₽ |
| info | — | 0 | 0 | 0 |

**Never hunt a low-criticality host when the same bug class exists on a critical one.**
The identical finding is worth 4× more on `secret.sogaz.ru` than on `data.sogaz.ru`.

---

## 1. Priority targets, ranked

### 🥇 `secret.sogaz.ru` — critical ×1.0

A "secret transfer service" is a one-time-secret-link product (OneTimeSecret /
PrivateBin class). This is the single best target in the program, and not because
it's exotic — because secret-sharing services have a well-known, recurring bug class:

- **Predictable or sequential secret IDs.** Generate three or four secrets in a row
  and look at the identifiers. If they increment, or are short, or are base64 of a
  counter, you can enumerate other people's secrets.
- **The "viewed" flag not enforced.** Create a secret, view it once, then fetch the
  raw URL again. If it still returns the secret, the one-time property is broken.
- **Expiry not enforced server-side.** Set a 1-minute expiry, wait, fetch again.
- **Missing authorization on the read endpoint.** Create a secret while logged in,
  then fetch it from a clean incognito session. If it returns without auth, that may
  be by design (secret links are often unauthenticated) — but if the *management* or
  *list* endpoints leak, that's a real finding.
- **Secrets in the referrer or in server logs.** Check whether the secret ID appears
  in a `Referer` header sent to third parties.

Impact framing matters: reading one other person's secret is IDOR (30 000 ₽). If you
can enumerate them at scale, argue **"массовый обход авторизации" / mass auth bypass
— 200 000 ₽**, because that row is explicitly in the table.

### 🥈 `b2b.sogaz.ru` — high ×0.75

Corporate portal. Multi-tenant by nature, which means cross-tenant access control is
the interesting question. Two corporate accounts you register yourself → try to read
company A's policies, documents, and invoices as company B. Classic IDOR on
`contract_id` / `policy_id` / `invoice_id`. Also look for role confusion: a
"manager" role vs a "viewer" role inside the same company.

### 🥉 `edo.sogaz.ru` — high ×0.75

Electronic document management. Document-exchange systems are IDOR-rich by design —
document IDs, attachment IDs, signature IDs. Check whether you can fetch a document
that isn't routed to you, and whether a signed document can be substituted after
signing.

### Then, in order

- `lk.sogaz.ru` + `claim.sogaz.ru` (medium ×0.5) — personal cabinet and claims. The
  easiest IDOR wins in the program. Claim IDs are frequently sequential.
- `medonline.sogaz.ru` (medium ×0.5) — medical registry. Medical data is sensitive
  by default, so a disclosure here is easier to argue as real impact.
- `discount.sogaz.ru` (medium ×0.5) — partner cabinet. Cross-partner data access.
- `adinsure.sogaz.ru` (medium ×0.5) — insurance platform.
- `go.sogaz.ru` (medium ×0.5) — short links. Enumeration and destination tampering.
  Open redirect alone is only 5 000 ₽ and needs a demonstrated impact chain.
- `data.sogaz.ru` (low ×0.25) — file cloud. Very IDOR-rich, but the multiplier hurts.
- `omnichat.sogaz.ru` (low ×0.25) — support chat. Stored XSS into the operator
  console hits the "XSS in admin/support interface" line (20 000 ₽ base).

**Skip `tc.sogaz.ru` entirely — info criticality, no payment.**

---

## 2. Pre-flight

1. **Register two accounts per target** — you need A and B for cross-account testing.
   Use addresses you control. Registering yourself is explicitly allowed.
2. **Put the BI.ZONE header on every request.** In Burp: Proxy → Options → Match and
   Replace, add a request header on all URLs in `sogaz.ru`:
   `X-BIZONE-BUG-BOUNTY: l27sen`
3. **Throttle to ≤5 req/s.** Burp: Throttle → 250 ms fixed delay. Never enable active
   scanning — scanner output is worth 0 ₽ and may breach the rules.
4. **Create an evidence directory** and keep a running log of timestamps and account
   IDs from the first request. The report requires both, and reconstructing them
   afterwards is how people lose payouts.
5. **Read the rules once more.** Minimal PoC only, no post-exploitation, no social
   engineering, own accounts only.

---

## 3. Phase 1 — unauthenticated recon (per host)

Cheap, safe, and it tells you what you're dealing with.

```bash
# one host at a time, throttled — not a scanner, just a handful of probes
for h in secret b2b edo lk claim medonline discount adinsure go data omnichat; do
  echo "=== $h ==="
  curl -sS -o /dev/null -w "%{http_code} %{size_download} %{redirect_url}\n" \
    -H "X-BIZONE-BUG-BOUNTY: l27sen" "https://$h.sogaz.ru/"
  sleep 1
done
```

Then, per host: fetch `/robots.txt`, `/sitemap.xml`, `/manifest.json`, and the main
JS bundle. **Mine the JS for API paths** — SPAs leak their entire backend route table:

```bash
curl -sS -H "X-BIZONE-BUG-BOUNTY: l27sen" https://lk.sogaz.ru/ \
  | grep -oE '/[a-zA-Z0-9_/-]+\.js' | sort -u
# then pull each bundle and grep for paths
curl -sS https://lk.sogaz.ru/static/app.js \
  | grep -oE '"/(api|v[0-9])/[a-zA-Z0-9_/{}.-]+"' | sort -u
```

Also check the Wayback Machine for old endpoints that may still be live but
unlinked — `/api/v1/`, `/api/v2/` version drift is a common source of forgotten,
unpatched handlers. Keep the request rate low; this is a few dozen requests, not a
crawl.

---

## 4. Phase 2 — authenticated surface mapping

Walk the **entire** user funnel while Burp records, with the target host as the only
scope in Proxy → Scope:

- Registration → email confirmation → login → password reset
- Profile edit → document upload → download
- Every object you can create: policy, claim, application, chat, file, short link
- Every list view, then every detail view of an item in that list

Then export the request log and build an inventory. The only question you're asking
at this stage is: **which requests carry an identifier, and where does that
identifier come from?** Sort them into:

- **Guessable** — sequential integers, short strings, timestamps, base64 of either
- **Unguessable** — long random UUIDs
- **Self-referential** — IDs that appear to be derived from your own account

Guessable IDs on a critical or high host are your primary targets.

---

## 5. Phase 3 — the IDOR sweep

Use the companion script `idor_sweep.py` (in this workspace). It is deliberately
**not a scanner** — it replays one endpoint you already chose against a short list of
IDs, at a hard-capped rate, and groups the responses so outliers stand out.

```bash
# 1. Capture your own object's ID (the baseline) and a couple of neighbours.
# 2. Replay as account B against account A's IDs.
python3 idor_sweep.py \
  --url 'https://lk.sogaz.ru/api/v1/policies/{id}' \
  --ids 555001,555002,555003,555004 \
  --baseline 555004 \
  --cookie 'SESSION=<account B cookie>' \
  --header 'X-BIZONE-BUG-BOUNTY: l27sen' \
  --delay 0.25 \
  --out ./evidence/lk-policies
```

It writes every raw response to `./evidence/...`, logs a CSV with timestamps, and
prints the responses grouped by (status, length) so that the one response that looks
different is obvious.

**How to read the output:**

| What you see | What it means |
|---|---|
| All IDs return `403`/`404`, yours returns `200` | Correctly enforced. Move on. |
| Another ID returns `200` with real data | **IDOR.** Save the request/response pair. |
| Another ID returns `200` but with *your* data | Not IDOR — the server ignores the ID. Look elsewhere. |
| Another ID returns a different error than "denied" | Partial leak — worth following up. |
| One ID is a clear outlier in size | Investigate that one first. |

Then repeat the sweep for **every** guessable-ID endpoint you inventoried. Write up
each confirmed IDOR separately if the root cause differs — but note the program pays
**once** for multiple bugs sharing a single root cause.

---

## 6. Phase 4 — broken access control and role confusion

This is where the 200 000 ₽ "mass auth bypass" row lives, so it deserves real time.

- **Vertical**: take a client session and call agent / support / admin endpoints
  found in the JS bundles. A `200` where you expected `403` is a finding.
- **Horizontal**: same role, different tenant — company A vs company B on
  `b2b.sogaz.ru`, partner A vs partner B on `discount.sogaz.ru`.
- **Method and path tricks**: if `GET /api/orders/123` is denied, try
  `POST`, `PUT`, `DELETE`; try `/api/orders/123/`, `/api/orders/123.json`,
  `/api/orders/123?`, `/api/orders/./123`, `/api/Orders/123`, and case/encoding
  variations of the path. Authorization checks are often attached to one route
  pattern and miss its neighbours.
- **Missing authorization on write paths**: the read is protected but the
  `PUT`/`DELETE` isn't. This is extremely common and easy to prove.

---

## 7. Phase 5 — stored XSS into the admin/support console

The "XSS in admin/support interface" row pays 20 000 ₽ base — 4× a normal XSS.

`omnichat.sogaz.ru` is the obvious surface: you send a support message, an operator
reads it in a back-office console. If the console renders your message unescaped,
that's stored XSS in a privileged interface.

Payloads that survive naive sanitisation:

```html
<img src=x onerror=alert(document.domain)>
<svg/onload=alert(document.domain)>
<details open ontoggle=alert(document.domain)>
```

Also try the same payloads in every field that a human will later read: claim
descriptions on `claim.sogaz.ru`, document names on `edo.sogaz.ru` and
`data.sogaz.ru`, partner names on `discount.sogaz.ru`, free-text in
`opros.sogaz.ru`.

**Impact is the whole report.** A popup on its own is worth little. Show what an
operator's session gives you — their token, their ability to read other customers'
claims. That is what turns a 5 000 ₽ XSS into a 20 000 ₽ one.

---

## 8. Phase 6 — SSRF (30 000 – 80 000 ₽)

Look for anywhere the server fetches a URL or a remote resource on your behalf:

- `go.sogaz.ru` — short-link creation and destination preview
- Document/avatar upload from URL on `data.sogaz.ru` and `edo.sogaz.ru`
- Webhook or callback configuration in the partner cabinet
- "Send me this page" / import / preview features

Use a **Burp Collaborator or interactsh** callback to prove outbound requests, and
try to reach cloud metadata (`169.254.169.254`), `localhost`, and internal hostnames.
Blind SSRF is 30 000 ₽, but SSRF where you can read the response body is 80 000 ₽ —
push for the latter. Note the program explicitly will not pay blind SSRF without a
demonstrated threat.

---

## 9. Phase 7 — SQLi (200 000 ₽) — last, and read-only

Only after everything above. Test carefully and manually. The program restricts you
to `SELECT database()`, `@@version`, `user()`, `system_user()`, `@@hostname`, and
schema/table/column enumeration. **No data extraction beyond that.**

Good hunting grounds: search fields, sort/order parameters, filters, report exports,
and anything numeric in a query string. Prefer error-based or boolean-based
detection over anything that modifies data.

---

## 10. Evidence and report assembly

Collect as you go, not afterwards:

- Raw request and response pairs (Burp: right-click → Copy to file, or save items)
- Screenshots and a short screen recording of the exploit running end to end
- **Timestamps** for each request (the script logs these to CSV automatically)
- **Account IDs** used for testing — both accounts, clearly labelled
- The exact commands or exploit code you used

Required report sections (they reject incomplete ones):

1. Vulnerable service / resource, with a direct link
2. Vulnerability type
3. Exploitation mechanism — screenshots, video, commands
4. Reproduction steps
5. Impact — concrete risk, not a CVSS recital
6. Remediation / mitigation
7. Timestamps and test account identifiers

All evidence must live **inside the report**. Posting it to an external host is a
rules violation.

---

## 11. Compliance checklist

- [ ] `X-BIZONE-BUG-BOUNTY: l27sen` on every request
- [ ] ≤ 5 requests/second, no active scanners
- [ ] Only accounts I registered myself
- [ ] No social engineering, no DoS, no brute-force
- [ ] Minimal PoC only — no post-exploitation, no touching other users' data beyond
      what proves the bug
- [ ] SQLi limited to the permitted enumeration queries
- [ ] RCE testing limited to `whoami` / `hostname` / `ifconfig` and reading
      `/etc/passwd`
- [ ] Nothing published or shared externally
- [ ] `tc.sogaz.ru` avoided (info criticality, unpaid)

---

## Where to start tomorrow

1. Register two accounts on `lk.sogaz.ru` and one on `secret.sogaz.ru`.
2. Spend an hour on `secret.sogaz.ru` doing the four tests in section 1. It is the
   highest-value, lowest-effort target in the program.
3. Then map `lk.sogaz.ru` and run the IDOR sweep on every guessable-ID endpoint.
4. Keep the header on, keep the throttle on, log everything.
