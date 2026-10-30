# PERSONIO — environment setup

Program: `app.intigriti.com/programs/personio/personio/detail`
Status at time of writing: **Public · Open · Active**
Companion documents: `HUNTER-WORKFLOW.md` (methodology) · `PERSONIO-TEST-PLAN.md` (what to test)

---

## 0. The facts you must not get wrong

| Item | Value |
|---|---|
| **Max request rate** | **2 requests/second** — throttle to 500 ms |
| **Required header** | `X-Intigriti-Username: l27sen` |
| **Required email** | an `@intigriti.me` address — mandatory, not optional |
| **Instance naming** | company name `sec-test-l27sen-<nn>` |
| **Trial lifetime** | 14 days, then recreate |
| **SLA** | 10 working days to verify |
| **Minimum bounty** | **€175** (Tier 2, Low severity) |

The 2 req/s limit is the strictest I have seen on the platform — five times stricter than
Intigriti's own program. **Set the throttle before you send a single request.**

---

## 1. Your `@intigriti.me` address

**Confirmed: `l27sen@intigriti.me`** — it forwards transparently to the email registered
on your Intigriti account, so you never need a separate mailbox.

The important part is that **wildcards are supported**: you can add a `+` or `-` suffix
to the local part, in any combination, and it still forwards to you. From Intigriti's own
documentation:

> "yournickname+32@intigriti.me will forward to your registered e-mail address at
> intigriti but so will yournickname-programname@intigriti.me etc. This enables you to
> create multiple test accounts on a program to be able to test different attack vectors
> on **different account levels** without having to create multiple intigriti accounts."

That is exactly the capability Personio requires — you need four accounts across two
tenants and two privilege levels, and this gives you all four from one inbox.

### Your addresses for this program

| Purpose | Address |
|---|---|
| Tenant A — admin (registration) | `<handle>-personio-a@intigriti.me` |
| Tenant A — low-privilege employee | `<handle>-personio-a-emp@intigriti.me` |
| Tenant B — admin (registration) | `<handle>-personio-b@intigriti.me` |
| Tenant B — low-privilege employee | `<handle>-personio-b-emp@intigriti.me` |

The suffixes encode which tenant and role each account belongs to. That matters more than
it sounds: when you write the report, the reviewer needs to see clearly which account did
what, and a self-describing address removes all ambiguity.

**Set up a mail filter now.** Create a rule in your mail client that labels anything
arriving at `@intigriti.me` into a folder. Both Personio trials will generate a stream of
confirmation, invitation and notification emails, and you do not want them buried in your
inbox. **Check the spam folder** for the first confirmations — Intigriti notes they've
taken precautions, but deliverability still varies by provider.

**Note the registration order:** the address you register a trial with becomes that
tenant's admin. Invite the `-emp` addresses afterwards as low-privilege users.

---

## 2. Create TWO trial instances

Two, not one. The bug class Personio most wants is **cross-tenant data leakage**, and
that is untestable with a single tenant. Tenant A and Tenant B is your entire test bed.

1. Go to `https://www.personio.com/free-trial/`
2. Register using your **`@intigriti.me`** address
3. When asked for a company name, use exactly this format:

   ```
   sec-test-l27sen-01      ← Tenant A
   sec-test-l27sen-02      ← Tenant B
   ```

4. Your instances will be reachable at:

   ```
   https://sec-test-l27sen-01.personio.de/
   https://sec-test-l27sen-02.personio.de/
   ```

   These URLs are explicitly in scope as **Tier 2** assets.

5. Both come **preloaded with realistic user data** — employees, departments,
   documents, absence records. This is deliberate and it is a gift: your findings will
   look like real findings.

**Practical notes:**

- Populate both tenants with *recognisably different* data — e.g. give Tenant A a
  department called `AAA-Marker` and Tenant B `BBB-Marker`. When you are testing cross-
  tenant access, a marker string in the response is unambiguous proof of which tenant
  the data came from. This single trick makes cross-tenant findings far easier to write
  up and far harder to dispute.
- Create a second user inside each tenant with a **lower role** (e.g. Employee, not
  Admin). You need this for vertical privilege-escalation testing. Give them distinct
  names so you can tell the sessions apart in your proxy history.
- **Set a calendar reminder for day 12** of each trial. Recreating instances is the one
  real friction point in this program.

---

## 3. Configure your proxy

### Burp Suite

**Throttle — do this first:**

```
Settings → Network → Connections → HTTP
  → enable "Throttle" → Fixed delay: 500 ms
```

500 ms per request = 2 req/s, exactly at the limit. If you also run any tool in parallel,
increase the delay further. Compliance beats speed.

**Attribution header — scope it to Personio only:**

```
Settings → Network → Connections → Match and Replace → Add
  Type:        Request header
  Match:       (leave empty)
  Replace:     X-Intigriti-Username: l27sen
  Comment:     Personio attribution
```

Then set **Target → Scope** to `.*\.personio\.(de|com|tools)$` and enable
"Use suite scope" for your header rule if your Burp version supports it. Do not send
this header to unrelated hosts.

**Also worth setting:** Proxy → Options → disable "Follow redirects" for manual testing
so you can see the raw 302s — a redirect to login is itself a signal.

### Browser

- Use a **dedicated Firefox profile** — never your daily-driver profile. You will
  accumulate authenticated sessions to targets and you do not want them mixed with
  personal accounts.
- Install **FoxyProxy** and point it at Burp for `*.personio.de` and `*.personio.com`
  only.
- Keep one window per tenant, with different container tabs or profiles, so you never
  confuse which session you are in. Mixing up sessions produces false positives.

---

## 4. Workspace

Run the scaffold script:

```bash
bash hunting/scripts/new-program.sh personio https://app.intigriti.com/programs/personio/personio/detail
```

Then create your tenant notes immediately:

```
hunting/programs/personio/
├── scope.md            ← fill this in from the program page
├── notes.md            ← session log, written as you go
├── hypotheses.md       ← claim / endpoint / test / result
├── findings.md         ← confirmed findings
├── recon/
│   ├── assets.md       ← Phase 1 output
│   ├── endpoints.md    ← Phase 2 output
│   ├── identifiers.md  ← Phase 3 output
│   └── js/             ← downloaded JavaScript bundles
├── evidence/
└── scripts/
```

---

## 5. Scope reference

### In scope — Tier 2 (higher payouts)

```
*.app.personio.com                    *.app.personio-dev.com
*.personio-internal.de                *.personio.tools
api.personio.com                      api.personio-dev.com
https://*.personio.de                 https://*.personiowhistleblowing.com
https://hug.personio.com
https://sec-test-l27sen-<nn>.personio.de        ← your instances
```

### In scope — Tier 3

```
community.personio.com
www.personio.com/free-trial/
www.personio.de/kostenlos-testen/
other Personio-owned assets
```

### Out of scope — read these twice

- `personio.slack.com` · `statuspage.personio.de` · `support.personio.de`
- `www.personio.com` · `www.personio.es` · `www.personio.de`
- **The Conversations product — entirely out of scope**
- **Same-tenant broken access control**, unless it crosses a tenant boundary or exposes
  sensitive data. Personio defines a colleague's first name, last name and email
  *within your own tenant* as **not sensitive**. So "I hid the employee list but found a
  coworker's name in an API endpoint" earns **nothing**.
- DoS/CPDoS — only conditionally in scope, and only against `*.app.personio.com` under
  specific criteria. Do not test DoS otherwise.
- The standard platform unpaid list — see `HUNTER-WORKFLOW.md` Appendix B.

### Payout table

| Severity | Tier 2 | Tier 3 |
|---|---|---|
| Low (0.1–3.9) | €175 | €50 |
| Medium (4.0–6.9) | €350 | €100 |
| High (7.0–8.9) | €1,125 | €450 |
| Critical (9.0–9.4) | €3,000 | €1,000 |
| Exceptional (9.5–10.0) | €5,000 | €2,000 |

**They pay bonuses for high-quality reports and say explicitly that reports with a clear
proof of concept — "especially videos" — are higher quality.** Record a video of every
PoC. It is the cheapest available increase to your payout.

---

## 6. Your first session, in order

1. Confirm the scope and rules are unchanged on the program page. Record in `scope.md`.
2. Get the `@intigriti.me` address sorted.
3. Create both trials, populate with marker data, create the low-privilege user in each.
4. Set the 500 ms throttle and the attribution header **before** anything else.
5. Open both tenants in separate containers, log in, and walk the full funnel in each
   with the proxy recording.
6. Build `recon/identifiers.md` — every request carrying an ID, sorted by guessability.
7. Run the identifier sweep per `PERSONIO-TEST-PLAN.md`.

**Do not start testing before step 6 is complete.** The inventory is what makes the
testing efficient; without it you are guessing.
