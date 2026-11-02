# SCOPE — DPG Media

Captured on 2026-11-02 from the program text supplied by the user in this chat.
This is a record of that supplied policy, not an independently refreshed program
page. Recheck the live program before future sessions.

## Program and collection rules

| Field | Supplied policy / pilot setting |
|---|---|
| Platform | Intigriti |
| Status | Public / Open |
| Program URL | Not included in the pasted text |
| Automated tooling limit | Maximum 5 requests/second |
| Pilot throttle | One request start per 1,000 ms |
| Required request header | `X-Intigriti-Username: l27sen` |
| Required account email | `@intigriti.me` when registering accounts |
| User agent requirement | Not applicable |
| Automatic scanners | Prohibited; no automatic vulnerability scanning for this pilot |
| Safe harbour | Applied according to the supplied text |
| Disclosure | Prior written consent required, including public PoCs |
| Program-specific eligibility | ID check required; no program-provided role credentials |

## Assets

| Asset | Tier | Conditions |
|---|---|---|
| `*.dpgmedia.be` | 2 | Excludes `login.dpgmedia.be` and the exclusions below |
| `*.dpgmedia.nl` | 2 | Excludes `login.dpgmedia.nl` and the exclusions below |
| Other related DPG domains | 3 | Must be 100% DPG-owned; do not automatically expand collection scope |

Excluded: `login.dpgmedia.be`, `login.dpgmedia.nl`, `visitors.dpgmedia.be`,
Qualifio subdomains, `actie.*.*`, and `cadeau.videoland.com`. Partly owned projects
whose infrastructure is not DPG's responsibility are outside scope.

## First pilot

User selected `https://www.dpgmedia.be/` in chat on 2026-11-02.

- Only `https://www.dpgmedia.be` is allowed for pages and assets.
- No additional domains, CDN origins, or authentication origins are allowed.
- One starting page; link depth zero; at most three page records to accommodate
  same-origin redirect hops. Browser-created documents also consume these limits.
- Up to 40 external asset records, 50 total request starts, and a 90-second request
  scheduling window. Browser observation window: 8 seconds.
- Maximum 10 MiB per saved response; 50 MiB total saved content.
- Collect exposed JavaScript and explicit public source-map references only.
- No automatic clicks, form submissions, account creation, vulnerability probes,
  brute force, paywall bypass, or changes to application data.
- Off-origin redirects are logged and blocked. Ownership/scope for a different
  destination must be established before a later run can include it.
- Attribution header is in `collector-headers.json`; this contains no credential.
- Raw responses, downloaded scripts and session notes stay in gitignored paths.

The program states both a tooling rate cap and a ban on automatic scanners. This
pilot is limited to a small asset collection; the rate cap is not treated as
permission for vulnerability scanning or arbitrary automation.

## Canonical destination assessment — 2026-11-02

The first pilot sent one request. `https://www.dpgmedia.be/` returned HTTP 301 to
`https://www.dpgmediagroup.com/nl-BE`. The collector blocked the new origin and
saved no JavaScript in `recon/js/pilot-01/`.

The destination's [official corporate privacy policy](https://www.dpgmediagroup.com/en-BE/privacy-policy)
expressly names `www.dpgmediagroup.com` as its corporate website and identifies
DPG Media Group NV, Mediaplein 1, 2018 Antwerp, company 0440.653.281, as the entity
responsible for data processing. The [official terms](https://www.dpgmediagroup.com/en-NL/terms-of-use)
also identify that company. Together with the in-scope `.be` redirect, this is the
basis for treating the canonical corporate site as a related DPG-owned Tier 3
asset for the bounded public asset collection. This is an ownership inference
from official statements; it is not a claim of an unredacted registry match.

The [registry RDAP](https://rdap.verisign.com/com/v1/domain/dpgmediagroup.com)
refers to [registrar RDAP](https://rdap.registrar.eu/v1/domain/DPGMEDIAGROUP.COM).
The registrar record redacts the registrant name and does not independently
establish corporate ownership.

The continuation starts directly at `https://www.dpgmediagroup.com/nl-BE`, with
only `https://www.dpgmediagroup.com` allowed. No wildcard, CDN, authentication
origin, or other DPG brand is added. All original pilot budgets and exclusions
remain. Attribution headers now attach to this canonical seed origin. Output:
`recon/js/pilot-02/`.

## Live pilot results — 2026-11-02

1. `pilot-01`: one request to the selected `.be` URL; HTTP 301 to the canonical
   corporate domain; destination blocked pending the assessment above.
2. `pilot-02`: one request to the canonical `/nl-BE` page; HTTP 302 to the separate
   origin `https://myprivacy.dpgmediagroup.net`; blocked by exact-origin scope.
3. `pilot-03`: one request to the canonical `/en-BE/privacy-policy` public route
   as an alternative same-origin entry point; it also redirected to the consent
   origin and was blocked. Request budget for this continuation was reduced to 48
   so the three runs together remained within the planned 50-request ceiling.

Total: three collector request starts; zero JavaScript downloads, zero saved
response bodies. No request was sent by the collector to the consent origin or
any additional asset/CDN origin. The canonical ownership checks above used
separate public documentation/RDAP reads, not vulnerability tests.

The first live test confirmed redirect scope enforcement, but did not establish
successful collection against this application. Continuing requires establishing
scope for the consent service and normal consent/session handling, or selecting
another directly accessible in-scope application. No consent cookies were forged
and no privacy-gate endpoints were manipulated.

## Follow-up session testing — 2026-11-02

The user explicitly requested exercising redirects and login/session handling on
this target. The continuation allows the three exact origins in the observed
normal entry flow: `https://www.dpgmedia.be`,
`https://www.dpgmediagroup.com`, and `https://myprivacy.dpgmediagroup.net`.
The consent host is assessed as DPG-operated from the official corporate
redirect to it and DPG's [description of its self-developed privacy gate](https://www.dpgmediagroup.com/en-NL/about-dpg-media/social-commitment/responsible-data-usage/good-host).
The .net registry/registrar records redact the registrant name, so this remains
an operational inference from official evidence rather than a registry ownership
certification. No wildcard expansion or unrelated login/CDN origin is included.

A single ordinary HTTP request to the consent page returned a DPG WAF denial.
Follow-up browser testing uses the real Chromium user agent, normal public
navigation and explicitly scoped requests, without challenge solving, IP/proxy
rotation, forged consent tokens, or WAF fingerprint spoofing. A denial is recorded
as a blocker. `--researcher l27sen` identifies all requests to approved origins;
private session headers remain restricted to the seed origin.

Follow-up collection budget: at most 120 request starts at least 1 second apart,
180-second scheduling window, 80 asset records, depth zero. Later reruns are
limited to testing specific fixes or a successfully completed ordinary consent
session; budgets are recorded separately in their manifests.

The first successful follow-up (`pilot-04`) obtained HTTP 200 for the canonical
homepage using Chromium's own user agent. It saved 79 external scripts and two
inline scripts in 90 requests, then hit the 80-asset discovery cap. No account was
created and no privacy-gate endpoint was manipulated.

The bounded rerun (`pilot-05`) reused the exported browser state and raised the
asset limit to 120 / request limit to 160, at the same one-second request spacing.
It saved 88 external scripts and two inline scripts, exposing additional
collector issues: navigation timeout under throttled script loading, and loose
string matching that produced a few invalid candidate URLs. Those issues were
fixed and exercised against local fixtures before `pilot-06`, the final live
validation. Final raw results and the consolidated report are in ignored
`recon/`; none of this constitutes a vulnerability finding.

`pilot-06` successfully saved 88 external JavaScript URL records pointing to 87
unique downloaded JS files, plus four inline-script records. Total saved data
including HTML/JSON: 4,182,333 bytes. All 98 response-bearing requests were logged;
minimum recorded scheduling spacing was 1,000 ms. There were no asset or
navigation errors. No explicitly referenced public source maps were found.
The run remained partial by design: depth zero skipped 41 linked-page URLs, and
other origins remained blocked. One runtime filename wrapper remained flagged
as not independently enumerable by static analysis. Original runtime maps and
browser-observed scripts were still collected.

The output contains an analysis-only `javascript-corpus.zip`, excluding cookies,
storage state, session logs, raw HTML and screenshots. The consolidated private
report is `recon/js/pilot-06/RESULTS.md`. Eighteen local tests passed and the
dependency audit reported no known vulnerabilities at verification time.

Browser login/session handling was validated with local HTTP fixtures, including
password input from environment variables, a scoped POST, cross-origin callback,
cookie export/reuse and private-header isolation. This is not evidence that a
DPG account login or its excluded login providers were tested.

## Page inventory and authentication handoff validation — 2026-11-02

The user requested page-to-script/call correlation and an explicit pause when
login/signup or a session is needed. The default auth policy is now `stop`:
public auth-page assets are retained, other queued pages are deferred, CLI exit
3 requests a user-completed authorized login and local saved browser state, and
excluded identity providers remain blocked. No account is registered by default.

The bounded `pilot-07` used depth one, four page records including redirects,
at most 190 request starts with a one-second scheduling interval, and the same
exact-origin/exclusion configuration. It saved the corporate homepage, About DPG
Media and Working at DPG Media (three HTML pages) plus the initial .be redirect.
It recorded 88 external JavaScript URLs (87 unique external files), 12 inline
script records, 26 scripts directly declared/observed on multiple pages, 26
observed fetch/XHR calls and three static call references. Static calls were not
requested merely because the parser found them.

All 166 responses were logged, with a minimum recorded scheduling interval of
1,000 ms. Zero non-read requests were sent. There were zero asset or navigation
errors; 109 saved-record hashes matched the captured bytes. Page/depth caps
remained active, so coverage is intentionally partial.

No authentication boundary was encountered on these visited pages, and zero
requests were sent to the excluded DPG login hosts. The actual live DPG account
login/signup/dashboard flow remains untested. Twenty-four tests cover the
collector, including local authenticated fixtures that verify login-page
inventory, default pause, user-facing handoff, valid-session resume,
expired-session handoff, scoped POST/callback flows and excluded-provider stops.

Searchable local review: `recon/js/pilot-07/inventory.html`. Full relationships:
`inventory.json` and `page-index/`; validation: `VALIDATION.md`. The local review
bundle includes captured public HTML and scripts but excludes browser storage,
session logs and screenshots. Derived reports were rebuilt offline from saved
evidence after the final correlation/presentation fixes; original raw bytes and
their indexes were preserved.

## Reporting notes (policy)

Tier 2 payouts in the supplied text: Low EUR 50; Medium EUR 100; High EUR 150;
Critical EUR 300; Exceptional EUR 500. Tier 3: EUR 25 / 50 / 100 / 200 / 300.

API-key disclosure without business impact, paywall bypass, privacy-consent open
redirects, unused-domain redirect hijacking, and findings without a demonstrated
impact are among the exclusions. The pasted policy contains the full unpaid list;
consult it and the live program before evaluating or submitting any finding.
