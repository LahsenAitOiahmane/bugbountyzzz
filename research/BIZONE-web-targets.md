# BI.ZONE — Picking an "easy/middle" web target

Compiled 2026-10-12 from the live program pages on `bugbounty.bi.zone`.
Program statuses change often — re-confirm on your dashboard before committing.

---

## 1. The trap that decides everything

Every BI.ZONE program I read carries the same **"not paid" list**. It kills almost
every classic "easy" web bug:

- Self-XSS, and XSS without impact on sensitive data
- CSRF — including logout CSRF
- Clickjacking / missing framing protection
- SSL/TLS issues, SPF/DMARC complaints
- Open redirect **without** a demonstrated impact chain (e.g. token theft)
- User enumeration, brute-force findings
- Version / stack-trace / technology disclosure without a concrete attack vector
- CSP complaints, tabnabbing, `window.opener`
- MitM, DoS/DDoS, spam
- Anything produced by an automated scanner
- Missing-best-practice reports with no demonstrated security impact

**So "easy" on BI.ZONE does not mean running a scanner.** A scanner report is worth
0 ₽ here. What actually gets paid is: **IDOR / broken access control, stored XSS,
SSRF, SQLi, auth bypass, privilege escalation, business logic.** Adjust your hunting
accordingly — that is the whole game.

---

## 2. What actually pays (real tables, not ceilings)

**АО «СОГАЗ»** — explicit table:

| Vulnerability | Max payout |
|---|---|
| RCE / mass auth bypass / SQLi / unrestricted LFR-RFI-XXE | 200 000 ₽ |
| RCE in isolated test env, LFI/RFI, XXE, SSRF (can read response) | 80 000 ₽ |
| Blind SSRF, **IDOR**, admin/support auth bypass | 30 000 ₽ |
| XSS in admin/support interface | 20 000 ₽ |
| XSS, open redirect | 5 000 ₽ |
| Business logic | individually assessed |

SOGAZ also applies a **scope multiplier**: Critical ×1.0, High ×0.75, Medium ×0.5,
Low ×0.25, Info ×0. A finding on a "Critical"-criticality asset pays 4× the same
finding on a "Low" asset. Check the program's Tasks section for asset criticality.

**GitVerse (СберТех)** — explicit table:

| Vulnerability | Payout |
|---|---|
| RCE | 150 000 ₽ |
| SQLi with access to critical data | 100 000 ₽ |
| SQLi | 50 000 ₽ |
| SSRF/XXE with sensitive info disclosure | 50 000 ₽ |
| Blind SSRF | 20 000 ₽ |
| Server-side info disclosure / IDOR | 9 000 – 60 000 ₽ |
| Stored XSS | 20 000 ₽ |
| XSS (non-self) | 10 000 ₽ |
| Business logic / other confirmed | individually assessed |

Note how low plain XSS pays versus IDOR/SSRF/SQLi. **Chase access-control bugs.**

---

## 3. Candidate comparison

Reports = saturation (lower is better for you). Response = typical first-response time.

| Program | Ceiling | Reports | Triage | Response | Scope |
|---|---|---|---|---|---|
| **АО «СОГАЗ»** | 200 000 ₽ | **34 / 90d** | own | > 1 day | insurance portals, agents, support |
| **SberMarketing** | 80 000 ₽ | **61** | BI.ZONE | > 5 days | 2 domains |
| SberСпасибо (АО «ЦПЛ») | 250 000 ₽ | 98 | BI.ZONE | > 1 day | loyalty platform |
| SberTech | 200 000 ₽ | 114 | BI.ZONE | > 14 days | IT services |
| SberFactoring | 220 000 ₽ | 172 | BI.ZONE | > 7 days | 2 domains, B2B portal |
| Согаз Жизнь | 70 000 ₽ | 165 | own | > 1 day | life insurance |
| Citydrive | 150 000 ₽ | 252 | own | > 1 day | carsharing |
| BeGet | 400 000 ₽ | 494 | BI.ZONE | > 1 day | hosting, control panel |
| GitVerse | 200 000 ₽ | 411 | BI.ZONE | > 3 days | gitverse.ru |
| МКБ (ICD) | 250 000 ₽ | 543 | BI.ZONE | > 7 days | medical IT |
| TIMEWEB | 500 000 ₽ | 1 333 | own | > 1 day | hosting — heavily saturated |
| Alfa-Bank / T-Bank / Ozon / Avito | 1M ₽ | 700–1 200 | mixed | > 1 day | top-tier researchers only |

Regional "vulnerability awareness" programs (Chuvash 25 000 ₽, Tyumen 51 220 ₽,
Tula 15 000 ₽) cover regional government sites. Genuinely legacy and bug-rich, and
Chuvash triages in **under 1 day** — but 257–574 reports means heavy saturation, and
the payouts are small.

---

## 4. Recommendation

### Primary: АО «СОГАЗ»

- **34 reports in 90 days** is by far the lowest competition I found. Most beginner
  heartbreak in bug bounty is duplicates — this minimises that risk.
- Explicit payout table, so you can predict what a finding is worth before writing it up.
- 200 000 ₽ ceiling is respectable.
- Caveats: average actual payout is only ~14 181 ₽; it's "own triage" so consistency
  varies; and the scope multiplier means you should target high-criticality assets.

**Where to look:** the customer portal (личный кабинет), the insurance-agent
interface, and the support/admin panel. Insurance portals are full of IDOR
(`policy_id`, `claim_id`, `client_id` in requests) and broken access control between
"client" and "agent" roles. That maps directly onto the 30 000 ₽ IDOR line and the
200 000 ₽ mass-auth-bypass line.

### Runner-up: SberMarketing

Only 61 reports across just **two** domains (`sbermarketing.ru`,
`platina.sbermarketing.ru`) — small enough that you can map the entire surface
exhaustively instead of spraying. BI.ZONE does the triage, so the process is
consistent. Lower ceiling (80 000 ₽), and marketing sites are often agency-built
and messier, which cuts both ways.

### If you want the richest surface: GitVerse

Code-hosting = lots of web surface: markdown rendering (stored XSS), webhooks
(SSRF), private-repo access control (IDOR), API tokens, CI/CD. Explicit payout table.
Downside: 411 reports = well-picked-over, and confirm it's still active first.

---

## 5. Rules you must follow or your report is void

- **Custom header on every request.** SberMarketing/SberFactoring:
  `X-BIZONE-BUG-BOUNTY: <your_username>`. GitVerse: `X-Bug-Bounty: <username>`.
  GitVerse also requires the BI.ZONE VPN and `xBB` in the name of any entity you
  create (repo, PR, issue).
- **Max 5 requests/second.** No automated scanning tools.
- **Use only your own accounts.** No compromised accounts, no social engineering.
- **RCE testing is restricted** to `ifconfig`/`hostname`/`whoami`, reading
  `/etc/passwd` and `/proc/sys/kernel/hostname` (`drive:/boot.ini`), and creating an
  empty file in your own home dir. Anything else needs prior approval.
- **SQLi testing** is limited to `SELECT database()`, `@@version`, `user()`,
  `system_user()`, `@@hostname`, and schema/table/column enumeration. No data
  extraction beyond that.
- **No post-exploitation.** Minimal PoC only.
- **Duplicate rule:** first complete report wins. If the vendor already started
  fixing it, your report is a duplicate — payout is discretionary.

---

## 6. Report template (they reject incomplete ones)

Every program states reports without a detailed impact and exploitation description
will **not be considered**. Include:

1. Vulnerable service / resource + direct link
2. Vulnerability type
3. Exploitation mechanism — screenshots, video, commands, tools used
4. Reproduction steps
5. Impact — what risk this creates in concrete terms
6. Remediation / mitigation suggestions
7. Timestamps and the account IDs you tested with

A bare "IDOR at `/api/policy?id=2`" gets rejected. "Changing `policy_id` from my own
to another client's returns their full policy PDF, including passport number and
address; here is the request pair and a screenshot" gets paid.

---

## 7. First week, if you take SOGAZ

1. Create an account on the customer portal. Enumerate every authenticated request
   while walking the full funnel: quote → policy → claim → documents.
2. Log every request that carries an ID, and replay each with an ID belonging to a
   second account you control. That is your IDOR sweep.
3. Map roles: client vs agent vs support. Try each role's endpoints with the other
   roles' sessions. That is broken access control.
4. Check the agent/support panel separately — XSS there pays 20 000 ₽ vs 5 000 ₽ in
   the customer UI.
5. Test the document-upload and "request a callback" flows for SSRF and stored XSS.
6. Only then start thinking about SQLi — it pays the most but is the rarest.

Keep requests under 5/second, put the custom header on everything, and record
timestamps as you go. Retrofitting a report from memory is how people lose payouts.
