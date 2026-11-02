# bugbountyzzz

A personal bug bounty workspace: a reusable hunting methodology, the tooling to run it,
and a per-program scaffold.

Built around **Intigriti**, currently targeting **Personio** (Public · Open · Active ·
€175 minimum bounty). The workflow itself is program-agnostic.

---

## Start here

| Document | What it is |
|---|---|
| **[HUNTER-WORKFLOW.md](HUNTER-WORKFLOW.md)** | The methodology. Six phases with gates. Program-agnostic — read this first. |
| [REPOS.md](REPOS.md) | Curated repos and tools, plus the warning about AI tooling. |
| [PERSONIO-SETUP.md](PERSONIO-SETUP.md) | Environment: two trial tenants, proxy, throttle, accounts. |
| [PERSONIO-TEST-PLAN.md](PERSONIO-TEST-PLAN.md) | What to test on Personio, in priority order. |
| [programs/personio/scope.md](programs/personio/scope.md) | Pre-filled scope, payout table, out-of-scope list. |
| [scripts/js-collector/README.md](scripts/js-collector/README.md) | Browser/static JS collector: chunks, manifests, source maps, provenance and scope controls. |

---

## Layout

```
.
├── HUNTER-WORKFLOW.md         the methodology (phases 0-6 + appendices A-E)
├── REPOS.md                   curated repos, by purpose
├── PERSONIO-SETUP.md          environment setup for Personio
├── PERSONIO-TEST-PLAN.md      Personio test batteries
├── templates/                 blank scaffolding, copied per program
│   ├── scope.md               intake + compliance record
│   ├── notes.md               session log
│   ├── hypotheses.md          claim / endpoint / test / result
│   ├── findings.md            confirmed findings
│   └── report-template.md     report skeleton
├── scripts/
│   ├── new-program.sh         scaffold a new program workspace
│   ├── install-tools.sh       install the Go recon toolchain
│   └── idor_sweep.py          rate-limited IDOR replay harness
├── programs/
│   └── personio/
│       └── scope.md           pre-filled; working notes are gitignored
└── research/                  background research that informed the workflow
    ├── Intigriti-beginner-playbook.md
    ├── Intigriti-program-shortlist.md
    ├── BIZONE-web-targets.md
    └── SOGAZ-recon-playbook.md
```

---

## Quick start

Collect a site's JavaScript (Node.js 22+, Windows/Linux/macOS):

```bash
npm --prefix scripts/js-collector ci
npm --prefix scripts/js-collector run browser:install
node scripts/js-collector/cli.mjs https://app.example.com --out programs/example/recon/js/run-01
```

See the [collector guide](scripts/js-collector/README.md) for exact scope origins,
CDNs, authentication, manual browsing, HTTP-only mode and Katana seed imports.

```bash
# install the recon toolchain (WSL / Kali / Debian)
bash scripts/install-tools.sh

# scaffold a new program
bash scripts/new-program.sh <program-name> <program-url>

# run an IDOR sweep against a chosen endpoint
python3 scripts/idor_sweep.py \
  --url 'https://target/api/v1/items/{id}' \
  --ids 1001,1002,1003 \
  --baseline 1003 \
  --cookie 'SESSION=...' \
  --header 'X-Intigriti-Username: <handle>' \
  --delay 0.5 \
  --out ./evidence/sweep
```

---

## The rules this repo is built on

**1. Compliance before requests.** Read the scope, set the throttle below the program's
limit, add the attribution header, use accounts you registered yourself. Every session.

**2. Scanner output is worth zero.** Every platform's unpaid list is essentially a list of
things a scanner can find. Tools expand coverage; judgement finds bugs.

**3. Authorization is about data ownership, not endpoint path.** The identifier is the
attack surface. Any request carrying an ID, email, slug or filename is a candidate.

**4. AI output is a lead, never a finding.** AI-generated low-quality reports caused cURL
to end its programme, HackerOne to close Internet Bug Bounty submissions, and Liferay to
suspend its programme in 2026. Never submit anything you have not personally reproduced.

See [HUNTER-WORKFLOW.md](HUNTER-WORKFLOW.md) Appendix E for where AI actually fits.

---

## A note on what is *not* in this repo

Working documents — `notes.md`, `hypotheses.md`, `findings.md`, `evidence/`, `recon/` —
are **gitignored on purpose**. Most programmes forbid disclosing findings without written
consent, and publishing evidence to a public repository would breach the rules and could
void safe harbour protection.

The email aliases in the Personio documents appear as `<handle>` placeholders for the same
reason: publishing live forwarding addresses invites spam.

---

## Status

- [x] Methodology, tooling, templates, scaffold script
- [x] Personio selected and scoped
- [ ] Personio trial tenants created and seeded
- [ ] Identifier inventory built
- [ ] First submission
