# REPOS — the ones actually worth your time

Curated 2026-10-30. Every entry here was either verified during research or is a
long-established project. Organised by what you need it for, not alphabetically.

**Read the warning first:** the tools marked 🤖 are AI-driven. Section 6 explains why
using them naively will get you rejected, and why that matters more than the tools
themselves.

---

## 1. Learn the craft — start here

| Repo | What it is |
|---|---|
| `EdOverflow/bugbounty-cheatsheet` | Payloads, tips and tricks, organised by bug class. The classic starting reference. |
| `ngalongc/bug-bounty-reference` | **Writeups organised by vulnerability type.** The single most efficient way to learn a bug class: read ten real reports of it. |
| `djadmin/awesome-bug-bounty` | Curated index of programs and writeups. |
| `KingOfBugbounty/KingOfBugBountyTips` | Community recon one-liners with explanations. Read for ideas, not to run blind. |
| `swisskyrepo/PayloadsAllTheThings` | The payload encyclopedia. Web, API, cloud. |
| `reddelexc/hackerone-reports` | Searchable archive of disclosed HackerOne reports. Use it to check for duplicates before you submit. |
| `0xRadi/OWASP-Web-Checklist` | A testing checklist that maps to the OWASP WSTG. Good for making sure you didn't skip a category. |

**Not a repo but the highest-value thing on this list:** PortSwigger Web Security
Academy. Free, and the access-control and business-logic labs map directly onto what
programs actually pay for.

---

## 2. Recon and asset discovery

| Repo | What it is |
|---|---|
| `projectdiscovery/subfinder` | Passive subdomain enumeration. |
| `projectdiscovery/dnsx` | DNS toolkit — resolve, filter, probe. |
| `projectdiscovery/httpx` | HTTP probing with status, title, tech detection. |
| `projectdiscovery/katana` | Crawler with JS parsing (`-jc`). Feeds your JS-mining. |
| `projectdiscovery/naabu` | Port scanning. |
| `projectdiscovery/nuclei` | Template-based scanning. **Coverage only — never a submission source.** |
| `owasp-amass/amass` | Deeper asset mapping and DNS intelligence. |
| `lc/gau` | Fetch known URLs from AlienVault, Wayback, Common Crawl. |
| `tomnomnom/waybackurls` | Wayback URL fetch. Simpler than gau. |
| `ffuf/ffuf` | Content and parameter discovery. Fast. |
| `TophantTechnology/ARL` | 灯塔 — Chinese asset reconnaissance platform. Docker, 2C4G. Excellent for understanding what systematic asset topology looks like. Broad scanner: use on your own targets, or for its passive half only. |
| `screetsec/Sudomy` | Subdomain enumeration with a Chinese-authored workflow. |

---

## 3. Scope management — do this, don't hand-copy scope

| Repo | What it is |
|---|---|
| `sw33tLie/bbscope` | Aggregates scope from HackerOne, Bugcrowd, **Intigriti**, YesWeHack, Immunefi into one list. |
| `rix4uni/scope` | GitHub Actions crawler that keeps scope lists fresh. |
| `ARPSyndicate/bug-bounty-domains` | Domains belonging to well-known public programs. |

Hand-copying scope is how you miss an asset or test an out-of-scope host. Automate it.

---

## 4. JavaScript and secrets — where beginners can genuinely win

| Repo | What it is |
|---|---|
| `m4ll0k/SecretFinder` | Extracts API keys and secrets from JS. |
| `GerbenJavado/LinkFinder` | Pulls endpoint paths out of JavaScript. |
| `xnl-h4ck3r/xnLinkFinder` | LinkFinder's more capable successor. |
| `trufflesecurity/trufflehog` | Secret scanning across repos and filesystems. |

This category is underrated. A JS bundle contains the backend route table, and finding
an `/internal/` endpoint nobody documented is a repeatable, learnable technique — not
luck.

---

## 5. Wordlists

| Repo | What it is |
|---|---|
| `danielmiessler/SecLists` | The standard. Large. |
| `assetnote/wordlists` | High-quality, maintained, often better than SecLists for modern targets. |
| `fuzzdb-project/fuzzdb` | Older but still useful for edge cases. |

**Build your own from the target's vocabulary.** Product names, feature names, the terms
you found in the JS. Default wordlists are a starting point, not a strategy.

---

## 6. 🤖 AI and MCP tooling — read the warning

The ecosystem is real and moving fast. These are the projects that came up repeatedly in
research across English and Chinese sources.

| Repo | What it is | Honest assessment |
|---|---|---|
| `0x4m4/hexstrike-ai` | MCP server exposing **150+ security tools** to Claude/GPT/Copilot. 12+ autonomous agents, decision engine, visual dashboard. MIT, Python. | The most complete MCP bridge available. **Tools are not bundled** — you install all 150+ yourself. Self-reported metrics (98.7% detection, 2.1% FP) are unverified. |
| `Armur-Ai/Pentest-Swarm-AI` | Open-source autonomous pentest swarm, explicitly positioned as the open alternative to XBOW's closed SaaS. | Ambitious. Expect rough edges. |
| `transilienceai/communitytools` | Claude Code skills and agents for pentesting, bug bounty, AI threat testing, recon. | Closest to "plug into your existing CLI agent". |
| `shuvonsec/claude-bug-bounty` | AI-orchestrated CLI (BugHunter) with native scope awareness — pulls live asset lists from HackerOne, Bugcrowd, Intigriti, Immunefi. | The scope-awareness is genuinely useful. Treat its findings as leads. |
| `PentestMCP` / `Pentest-AI` | MCP servers for nmap/curl/nuclei/metasploit; the latter claims to "prove every finding" via machine oracles. | The proof-oriented design is the right instinct. |
| `frohoff/ysoserial` | Not AI — but the gadget-chain generator you'll need when an LLM flags Java deserialization. | Essential companion. |

**Commercial reference point:** XBOW topped the HackerOne US leaderboard in June 2025
and raised $75M Series B ($117M total). It is closed and hosted. That matters: the open
projects above exist precisely because researchers wanted the same capability without
renting it.

### The warning that matters more than the tool list

**AI-generated low-quality reports have damaged the bug bounty ecosystem badly, and
programs are reacting.** Verified in research:

- **cURL ended its bug bounty program** on 31 January 2026 (Daniel Stenberg announced it
  on the 26th).
- **HackerOne stopped accepting new submissions to the Internet Bug Bounty** from
  27 March 2026.
- **Apple limited the number of reports** a researcher can submit (June 2026).
- **Intel and Google adjusted their rules** in response to low-quality AI submissions.
- **Liferay DXP suspended its program** in March 2026, citing verbatim "the massive
  worldwide increase in AI-assisted submissions."

This is why the programs we looked at have such brutal unpaid lists, and why Liferay
reopened with a statement saying they specifically want "bugs that require deep logic and
manual testing — things that AI often misses."

**The operational rule:** AI output is a *lead*, never a *finding*. A plausible LLM
explanation is not proof of impact. If you submit an AI-generated report you have not
personally reproduced, you will be rejected, and repeat offences get you banned.

See `HUNTER-WORKFLOW.md` Appendix E for where AI actually fits.

---

## 7. Program directories — finding targets

| Resource | What it is |
|---|---|
| `bbradar.io` | Cross-platform public program comparison — rewards, scope tags, launch dates. ~1,500 programs indexed. |
| Intigriti public directory | `intigriti.be/public/programs` |
| HackerOne directory | `hackerone.com/opportunities/all` |
| `ARPSyndicate/bug-bounty-domains` | Domains for well-known public programs |

Use these to find programs where the scope mentions **"create your own", "trial",
"instance", "Docker", "download", "install"** or a source repo. Those are the ones where a
beginner has an actual advantage.

---

## 8. If you only install five things

```bash
# 1. The recon backbone
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/httpx/cmd/httpx@latest
go install github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/ffuf/ffuf/v2@latest
```

Plus **Burp Suite Community** as your proxy, and **SecLists** for wordlists. That is a
complete beginner toolkit. Everything else is optimisation.

The kit's `scripts/install-tools.sh` installs the full ProjectDiscovery set if you want
it in one command.

---

## A note on repo hygiene

Star counts are not quality signals. Several of the most-starred "AI hacker" repos are
demos that fall over on a real target. Judge a tool by whether it makes *you* better at
one specific phase of the workflow — and by whether it respects rate limits, which most
of them do not.

**Before you run any of these against a live program, check it against the program's
rules.** Most ban automated scanning outright, and several cap the request rate. An
eager agent at 50 req/s will get your account banned in minutes.
