# SCOPE — Aikido Security

Captured 2026-11-02 from the program text supplied by the user in this chat.
Program: https://app.intigriti.com/programs/aikido/aikido/detail

## Rules relevant to this collector pilot

| Field | Supplied policy / configuration |
|---|---|
| Status | Public / Open |
| In-scope application | `https://app.aikido.dev` only |
| Other `*.aikido.dev` hosts | Out of scope |
| Required header | `X-Intigriti: l27sen` |
| Automated tooling cap | 5 requests/second |
| Pilot request spacing | At least 1,000 ms between scheduled starts |
| Account creation | User may create a trial with `@intigriti.me` |
| SSO exception | If the alias cannot be used through SSO, include `Intigriti` in the workspace name |
| Disclosure | Written consent required before disclosure |
| Safe harbour | Applied according to the supplied text |
| Program eligibility | ID check required |

The application page/API origin is `https://app.aikido.dev`. Following the user's
clarification below, `https://cdn.aikido.dev` is an asset-only origin for retrieving
published application JavaScript, its referenced chunks/maps and rendering
dependencies. It is not a page/API/testing origin. Other sibling subdomains,
identity providers, Intercom, Chargebee and marketing origins remain blocked.

This is a JavaScript/page inventory test, not a vulnerability scan. No form is
submitted, account registered, repository connected or workspace modified. The
default authentication policy is `stop`: collect the public interface and its
scripts, then request a user-completed normal login and a local saved session
before entering protected areas. Never put credentials or session tokens in chat.

## Initial pilot budgets (historical)

- Seed: `https://app.aikido.dev/`.
- Hybrid browser/static collection, depth one, at most five page records.
- At most 90 external script records and 100 request starts.
- 150-second scheduling window; five-second minimum browser observation window.
- Maximum 10 MiB per response and 50 MiB total saved content.
- Explicit source-map references only; no guessed endpoint or chunk brute force.
- No automatic clicks, registration, login submission or non-read HTTP methods.
- Raw output and browser state remain in gitignored `recon/`.

The program is impact-based. An API path, API key, missing header or speculative
code issue is not a vulnerability finding by itself. This pilot does not submit
reports or exercise any vulnerability.

## Live result — 2026-11-02

Two bounded checks each made one GET request to the allowed application origin,
with `X-Intigriti: l27sen`, and received HTTP 200 / a 21,998-byte HTML shell.
No other origin was requested by the collector.

The HTML declares its main module at
`https://cdn.aikido.dev/assets/index-BLsQciQb.js` and lists 184 script/preload
references on that CDN. Since `cdn.aikido.dev` falls under the supplied excluded
wildcard, every such reference was recorded and blocked. The CSS dependency was
also blocked. No JavaScript was downloaded, login UI could not render, and no
account was created or authenticated.

`pilot-01` exposed a reporting defect: this case initially appeared as `empty`.
The collector now classifies it as `blocked` with stop reason
`out-of-scope-script-dependency`, a scope handoff (exit 4), explicit excluded
dependency records in the inventory, and `SCOPE-REQUIRED.md`. `pilot-02` verified
the corrected result live. Twenty-five local tests passed, including blocked-CDN
non-egress and an explicitly allowed CDN fixture.

Under the initial conservative configuration, collection was stopped for scope
clarification. This historical interpretation is superseded by the user's
published-asset clarification below. No message was sent to the program team.

## User clarification — published asset retrieval

The user clarified that the CDN exclusion concerns testing CDN infrastructure,
while this task retrieves the application's published JavaScript for local
analysis. The configuration now implements that distinction explicitly with
`--asset-origin https://cdn.aikido.dev`, not `--origin`.

Only GET retrieval of references discovered from app HTML, loaded scripts and
explicit source-map comments is performed. No CDN page crawl, API calls,
directory/path guessing, vulnerability probes, authentication attempts or
non-read requests are configured. Static API call references remain metadata and
are not requested merely because they occur in code. This records the user's
instruction; it is not represented as a newly received message from the program.

The bounded continuation uses at most 300 external asset records, 220 request
starts at one-second intervals, and a 260-second scheduling window. It retains
the user-authentication handoff and the other original limits. Browser speculative
prefetches are suppressed to let startup/login dependencies load first; their
published references remain queued for normal deduplicated downloading.

## Final validation

`recon/js/pilot-04` saved 184 unique JavaScript files (13,134,205 bytes),
covering all 184 first-party script URLs declared in captured HTML/DOM.
The run made 187 GETs: 184 CDN scripts, one CDN stylesheet, one application
document and one application session-status XHR. There were zero CDN API/page
requests, zero non-read requests, zero asset/browser errors and zero queued
assets. It paused at `https://app.aikido.dev/login` for user authentication.
All 186 saved-record hashes were verified and all 27 local tests passed.
