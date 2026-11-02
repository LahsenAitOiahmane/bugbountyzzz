# js-collect

Collect the client-side JavaScript a scoped application exposes, preserving raw
bundles, inline scripts, dependency references, provenance, and published source
maps for later review. Works on Windows, Linux, and macOS with Node.js 22+.

This is a collection stage. It does not scan for vulnerabilities or submit reports.
No target has to be hardcoded into the tool.

## Install

From the repository root:

```powershell
npm --prefix scripts/js-collector ci
npm --prefix scripts/js-collector run browser:install
```

The browser installation downloads Playwright's Chromium. HTTP-only mode does not
require that download. Versions are recorded in `package-lock.json`.

## Collect

```powershell
node scripts/js-collector/cli.mjs example.com --out recon/example/run-01
```

A hostname-only seed uses HTTPS. It still authorizes only that exact origin; it
does not implicitly include subdomains, a CDN, HTTP or another port.

Default mode combines a real browser session with recursive asset downloads. It
follows HTML links up to depth 2, accepts up to 25 page URLs and 1,000 external
assets, starts requests at least 500 ms apart, and schedules requests for at most
five minutes. Each redirect hop counts as a request. Use a new output directory
per run; an existing directory is never overwritten.

For a static collection without Chromium:

```powershell
node scripts/js-collector/cli.mjs https://app.example.com --mode static --out programs/example/recon/js/static-01
```

For an additional page origin and an asset CDN:

```powershell
node scripts/js-collector/cli.mjs https://app.example.com --origin https://www.example.com --asset-origin https://cdn.example.com --exclude '/(?:logout|signout|delete)(?:[/?#]|$)' --delay 1000 --out recon/example/run-02
```

Scope uses **exact origins**, including scheme and port. Adding `https://example.com`
does not add subdomains, HTTP, or a different port. Asset origins allow script and
supporting resource collection; they do not add page-crawl or XHR/fetch origins.
Out-of-scope references are recorded in `skipped.jsonl`, so you can decide which
additional origins the program permits and include them in a subsequent run.
Exclusion regexes match the complete URL.

The rate and limits are configurable; select values appropriate to the program.
Do not assume a link is harmless just because it uses GET. Exclude logout and any
application-specific action URLs before authenticated crawling.

### Collector options

| Option | Meaning and default |
|---|---|
| `--out DIR` | New output directory; default `recon/js/<host>-<timestamp>`. |
| `--mode hybrid\|static` | Browser plus recursive downloads, or HTTP only; default `hybrid`. |
| `--origin ORIGIN` | Add an exact page/API origin; repeatable. |
| `--asset-origin ORIGIN` | Add an exact asset-only origin; repeatable. |
| `--exclude REGEX` | Reject a complete URL matching the expression; repeatable. |
| `--seeds FILE` | Import URL lines or Katana JSONL discoveries; repeatable. |
| `--headers-file FILE` | JSON headers applied only to the starting origin. |
| `--storage-state FILE` | Load private Playwright cookies and browser storage. |
| `--save-storage-state FILE` | Save updated state to a new private file. |
| `--session-flow FILE` | Run an explicit bounded login/consent flow. |
| `--allow-post-url REGEX` | Permit POST to a matching scoped URL; repeatable. |
| `--researcher HANDLE` | Send the public `X-Intigriti-Username` attribution header to approved origins. |
| `--auth-policy stop\|record` | Pause at authentication or keep mapping other public pages; default `stop`. |
| `--auth-path PATH` | Add a known authentication entry path without guessing; repeatable. |
| `--strict-assets` | Fetch strong dependency evidence from extra asset origins and retain weak strings unfetched. |
| `--headed` | Show the browser window. |
| `--manual-seconds N` | Allow manual navigation for N seconds in hybrid mode. |
| `--depth N` | Page-link depth; default `2`. |
| `--max-pages N` | Page-record limit; default `25`. |
| `--max-assets N` | External and inline asset limit; default `1000`. |
| `--max-requests N` | Shared browser/HTTP request limit; default `2000`. |
| `--delay MS` | Minimum spacing between request starts; default `500`. |
| `--duration SECONDS` | Request scheduling window; default `300`. |
| `--timeout MS` | Per-request/navigation timeout; default `20000`. |
| `--settle MS` | Browser observation window per page; default `1500`. |
| `--max-bytes N` | Per-file decoded-byte limit; default `20971520`. |
| `--max-total-bytes N` | Saved-content limit; default `209715200`. |
| `--max-sources N` | Embedded source-map entry limit; default `5000`. |
| `--no-source-maps` | Skip source-map retrieval and extraction. |
| `--help` | Print canonical CLI usage. |

Repeatable options may appear more than once. Numeric values are integers; `depth`,
`settle` and `manual-seconds` may be zero, while other numeric limits must be positive.

## Authentication and manual exploration

An existing Playwright storage-state JSON can provide scoped cookies and browser
local storage. Keep it in a gitignored `storage-state*.json` file:

```powershell
node scripts/js-collector/cli.mjs https://app.example.com --storage-state storage-state-example.json --headed --out recon/example/auth-01
```

For a session or attribution header, create a gitignored `auth-headers-example.json`:

```json
{
  "X-Intigriti-Username": "your-handle",
  "Authorization": "Bearer YOUR_SESSION_TOKEN"
}
```

```powershell
node scripts/js-collector/cli.mjs https://app.example.com --headers-file auth-headers-example.json --out recon/example/auth-02
```

Explicit headers are attached **only to the starting origin**, even if other page
origins or CDNs are allowed. Cookie storage follows cookie domain/path/expiry
rules. Static mode uses cookies; local-storage-based authentication requires the
browser. An HttpOnly cookie already present in storage state is supported.
Use `--researcher your-handle` when the public `X-Intigriti-Username` attribution
header must reach **every explicitly approved origin**, including a canonical
destination after a redirect. Private headers remain bound to the seed origin.

Updated cookies and local storage can be exported explicitly with
`--save-storage-state recon/storage-state-example.json`. Export refuses to
overwrite an existing file. Keep the file private and gitignored; it can grant
access to the session. Browser state follows Playwright's
[storage-state authentication model](https://playwright.dev/docs/auth), and does
not capture sessionStorage or automatically solve MFA, CAPTCHA, or bot challenges.

To open menus or navigate routes yourself while recording newly loaded scripts:

```powershell
node scripts/js-collector/cli.mjs https://app.example.com --storage-state storage-state-example.json --manual-seconds 120 --duration 300 --out recon/example/manual-01
```

Manual mode opens Chromium, observes your navigation for the specified window,
then downloads the queued references using HTTP. The collector does not click
buttons or submit forms by default. Browser requests using POST, PUT, PATCH, or
DELETE are blocked by default, including requests triggered manually. Use
`--allow-post-url '^https://app\\.example\\.com/session$'` only for a known normal
login/consent endpoint that the program permits. This does not expand origin scope
and does not allow PUT/PATCH/DELETE. The browser is isolated from your regular
browser profile.

For repeatable login or consent on an application you are allowed to use, copy and
adapt [examples/session-flow.json](examples/session-flow.json). Flows support only
`navigate`, `click`, `fill`, `wait-url`, and `wait-selector`; they do not evaluate
arbitrary code. An optional `origin` on an action asserts the expected origin.
`fill` reads a value from the named environment variable; literal passwords are
not part of the flow file or session event log.

```powershell
$env:COLLECTOR_LOGIN_EMAIL = 'your-test-account@example.com'
# Set COLLECTOR_LOGIN_PASSWORD privately in your environment.
node scripts/js-collector/cli.mjs https://app.example.com/dashboard --session-flow my-session-flow.json --allow-post-url '^https://app\.example\.com/session$' --save-storage-state recon/storage-state-example.json --out recon/js/authenticated-01
```

Session steps run once before the collection queue, in the same browser context.
Each navigation and redirect is scope-checked and rate-limited. The collector then
revisits the starting URL with the updated cookies. No account is created unless
you explicitly supply a flow that does that; this tool includes no registration
automation. Do not use login providers excluded by the program. Login behavior
and account access still depend on the target, selectors, credentials and MFA.

## Page inventory and user authentication handoff

The collector follows discovered page links within `--depth` and `--max-pages`.
Recognized login/signup links are scheduled before ordinary links. It does not
guess a list of login paths. If you already know an entry path, add it explicitly
with `--auth-path /login` (repeatable); it still goes through scope checks.

Every run produces a searchable offline `inventory.html`, a full `inventory.json`,
`INVENTORY.md`, and per-page JSON records in `page-index/`. These show:

- Page title, meta description, headings, saved HTML and discovered links.
- Form actions/methods and field names/types, without field values or submitted bodies.
- Directly declared/observed scripts, their module/worker dependencies, broader
  references, scripts shared by pages, and identical-content groups.
- Fetch/XHR requests actually observed from each page.
- Possible `fetch`, literal Axios, XHR-like `open`, and beacon calls inferred from
  downloaded code, with source file/character offsets. These are never requested
  merely because the parser found them. Relative browser calls are resolved for
  each document base, rather than the CDN/script directory.

`usedByPages` means declared in HTML/inline code or observed by the browser;
`observedByPages` is the narrower response-observed set. `referencedByPages`
includes transitive references and manifest catalogs, which can list chunks for
unvisited routes. Neither means the code necessarily executed. The JSON includes
a legend for the relationship types. Descriptions and roles come from page
evidence; the tool does not invent an explanation of server behavior.

The default `--auth-policy stop` pauses further automatic page traversal when it
reaches a login/signup/consent page, an authentication challenge, or a redirect to
a login provider. Public scripts belonging to the current page are retained so
the authentication interface can still be inspected. Queued pages become
`deferred-auth`; protected requests are not retried or bypassed. A plain WAF 403
without authentication evidence remains an access-denied blocker, not a claim
that logging in will fix it.

The CLI prints **USER ACTION REQUIRED**, exits with code **3**, and writes:

- `AUTH-REQUIRED.md`: the user-facing next action and reason.
- `auth-required.json`: URLs, evidence, scope status and resume instructions.
- `resume-seeds.txt`: in-scope entry/deferred/protected URLs to revisit.

Log in normally with your own authorized account, or register it yourself if the
program permits registration, then provide a **local saved browser state**.
Do not paste passwords, session IDs or cookies into chat. The supported session
flow/manual mode can prepare and export state when its endpoints are in scope.
MFA and normal consent choices may require user interaction. A successful state
export alone does not prove that authentication succeeded.

Resume with a new output directory:

```powershell
node scripts/js-collector/cli.mjs https://app.example.com/dashboard --storage-state recon/storage-state-example.json --seeds recon/js/public-01/resume-seeds.txt --out recon/js/authenticated-02
```

A missing/expired/insufficient session produces another handoff. An excluded
login origin is recorded and blocked; it is never added automatically. If normal
account use is allowed outside the collector, supply only an authorized session
for the in-scope application. `--auth-policy record` can keep crawling other
public pages while recording boundaries; it does not grant access to protected
pages or override scope. An explicitly supplied pre-collection `--session-flow`
continues to work for accounts and endpoints the user already authorized.

Static references are bounded heuristics: dynamically computed URLs, aliases,
worker-relative URLs and branches behind interaction may need browser exploration
or manual source review. Browser prefetch/XHR activity counts against the request
budget even when the page-record limit prevents crawling those documents.

### Script dependencies blocked by scope

An application can serve its HTML from an allowed host while loading the actual
application code from an excluded CDN. If a page declares excluded script
entries and none of its directly referenced external scripts was collected, the
run reports `blocked` / `out-of-scope-script-dependency` instead of `empty`.
The CLI exits **4**, prints **SCOPE CLARIFICATION REQUIRED**, and writes
`SCOPE-REQUIRED.md` / `scope-required.json`. The inventory retains the excluded
script URLs and labels them as not fetched.

This reflects the collection configuration, not a conclusion that normal
retrieval of an app's published dependencies is itself CDN infrastructure
testing. Authorized published-asset retrieval is configured separately with
`--asset-origin`; it does not enable CDN page crawling or API calls. Follow the
user's authorized task and the program context when setting these roles. If that
distinction is unclear, resolve it rather than automatically expanding testing
origins. Logging in alone does not change the configured origins.

Use `--strict-assets` for extra asset origins when only published dependencies
should be fetched: HTML declarations, browser-observed scripts, literal imports,
worker/script-source references, bundler chunk maps and explicit source maps.
Heuristic filename strings found in comments, debug messages or examples remain
in the discovery graph as unfetched references. CDN APIs and pages stay blocked.
Browser speculative prefetch requests are deferred by default; their discovered
asset references remain queued so startup/login code can load first and files
can be downloaded once.

Rendered DOM snapshots are kept separately from raw HTTP HTML. Client-side route
changes such as `history.replaceState(..., '/login')` receive their own page
record, with inherited HTTP status explicitly labeled rather than inventing a
document request. Browser JavaScript errors are recorded in browser-errors.jsonl.
HTML-source links open derived `.html.txt` copies as text rather than executing
the captured application. Inspect the source in that view or a code editor;
the preserved raw snapshot still contains its original script links.

## Discovery stages

1. Parse source HTML and rendered DOM: external scripts, module preloads,
   prefetches, inline scripts, event handlers, JavaScript URLs, page links, frames,
   and basic import-map mappings.
2. Observe browser script responses, including extensionless scripts, runtime
   injection, workers when observable, and dynamic imports loaded during the visit.
3. Parse downloaded scripts with Acorn: imports/re-exports, worker URLs, literal
   script references, escaped Next Flight references, and Turbopack chunk strings.
   Recognize the usual Vite `assets/` dependency-map layout.
4. For Next Pages Router, read `__NEXT_DATA__` build IDs and asset prefixes, then
   collect the public build/SSG manifests and their referenced chunks. No server
   build directories or private manifests are guessed.
5. Resolve common Webpack `.u` filename functions from published chunk IDs and
   hash maps using a restricted AST interpreter. Downloaded JavaScript is never
   evaluated in Node. Unsupported runtime functions produce metadata warnings.
6. Follow explicit source-map comments and `SourceMap`/`X-SourceMap` headers.
   Support inline data maps, indexed maps, and embedded `sourcesContent`. Preserve
   original source names in metadata and write sources under generated safe names.

Framework files remain separate, retaining their original bytes. Joining chunks
would break module boundaries and obscure provenance. SHA-256 deduplication
stores identical bodies once while retaining each discovered URL and graph edge.
Query-string variants remain distinct URLs.
Bare filename strings inside JavaScript are not assumed to be downloadable URLs;
explicit imports, worker references and script-source assignments still discover
bare filenames. This avoids treating configuration names and minified code text
as public assets.

## Output

```text
run-01/
  manifest.json       run settings, limits, counts, stop reason, warnings
  SUMMARY.md          human-readable run summary
  assets.jsonl        URL -> local path, hash, status, parent, parsing warnings
  pages.jsonl         page snapshots, redirects, navigation errors
  discovery.jsonl     parent -> reference edges with discovery method
  skipped.jsonl       out-of-scope URLs, exclusions and limit-related skips
  network.jsonl       response metadata for browser and HTTP requests; no bodies/headers
  session.json        session steps and redirect events; no filled field values
  urls.txt            saved external asset URLs
  scripts/<host>/    raw downloaded bundles and chunks
  inline-script/     inline JavaScript
  inline-handler/    inline event handlers / javascript: URLs
  inline-data/       embedded JSON and other script data
  maps/<host>/       published external/inline source maps
  sources/<host>/    embedded original sources recovered from maps
  pages/<host>/      raw HTML snapshots
```

Paths are relative to the output directory in metadata. The original URL lives in
the index; a URL hash distinguishes filenames and avoids unsafe remote paths.
Duplicate URLs may point to the same saved path. Look at each asset's `state`:
`saved`, `error`, `http-error`, `not-javascript`, `not-map`, `redirect`, or `queued`.
`saved` source maps may still have parsing warnings or absent original sources.
`manifest.json` distinguishes `collected`, `partial`, `needs-auth`, `blocked`,
`empty`, and `failed` outcomes. Limits and navigation blockers produce a partial outcome when
some scripts were saved. It also lists scripts by origin and asset errors. Page
records include title, password-field count, and form action/method signals;
these are hints about session needs, not proof that an account is required.
For session failures or HTTP 401/403/429 pages, `browser-last.html` and
`browser-last.png` provide a private diagnostic checkpoint when available.

Read `manifest.json` together with `pages.jsonl`, `skipped.jsonl`, and asset
warnings before assessing coverage. `discovery-exhausted` means the reachable queue
was exhausted; limits, errors and unsupported patterns can still leave gaps.

All collection outputs should remain under a gitignored `recon/` directory. Raw
HTML, inline data, scripts and URLs can contain session information or private
application data. Request headers and storage state are not copied into manifests.

## Offline JavaScript mapping and review

Analyze a completed run without making target requests or executing its bundles:

```powershell
node scripts/js-collector/analyze.mjs recon/example/run-01 --out recon/example/analysis-01
```

The analysis verifies each original hash, formats a derived copy with Prettier,
parses it with Acorn and writes `map.html`, `map.json`, per-module JSON and source,
`endpoints.json`, grouped `endpoint-summary.json`, `routes.json`, `review-cues.json`, `decoded-strings.json` and
`ANALYSIS.md`. It maps static/dynamic imports, exports and simple cross-module
import bindings. It also indexes literal API paths and review cues such as HTML
sinks, navigation, browser storage and cross-window messaging.

These are bounded syntax heuristics. They do not prove reachability, data flow,
server behavior, authorization failure or vulnerability impact. Re-export chains,
computed calls and lexical shadowing can be incomplete or noisy. Formatting does
not recover original variable names, and literal decoding is not an obfuscator
runtime. Original files remain unchanged.

Analyzer options:

- `--out DIR`: required-new output directory; default is a timestamped directory
  inside the collection.
- `--no-beautify`: analyze original bodies without formatted source copies.
- `--max-bytes N`: maximum bytes read from one source file; default 20 MiB.
- `--help`: print analyzer usage.

Use `node scripts/js-collector/analyze.mjs --help` for the canonical list.

## Existing-tool integration

Playwright provides browser rendering and network observation; Acorn provides
JavaScript parsing, parse5 provides HTML parsing, and tough-cookie manages static
HTTP cookies. The orchestration and output index are the custom layer.

Existing Katana output can extend the seed set. Accepts either one URL per line or
Katana JSONL with `request.endpoint` fields:

```powershell
node scripts/js-collector/cli.mjs https://app.example.com --seeds katana.jsonl --out recon/example/katana-01
```

All imported URLs go through this collector's scope rules and budgets. Katana is
not launched automatically; its own requests, headers, rate and scope need their
own configuration. Once collected, `urls.txt`, `scripts/` and `sources/` can feed
the subsequent analysis tools you choose.

## Coverage boundaries

No URL-only collector can guarantee every script. Feature flags, user roles,
unvisited routes, interactions, inaccessible files and server-only Next.js code
can leave material gaps. Browser/manual coverage complements static extraction.
There is no brute-force chunk enumeration or automatic arbitrary interaction.

Webpack runtime recognition is a bounded heuristic, not a full JavaScript
interpreter. Turbopack and Vite support follows discoverable literal references;
custom public paths, import-map scopes and computed filenames may need explicit
seed URLs or a browser interaction. HTML inline handlers and non-JS data may have
parse warnings. Source maps must actually be exposed; minified code alone cannot
reconstruct the original sources.

Browser redirects are fetched one hop at a time without automatic redirect
following. Approved navigation destinations are opened in the same browser
context, retaining normal cookies. Repeated URLs without cookie progress are
reported as redirect loops, and chains are capped at ten hops. Disallowed
destinations remain blocked. A redirecting script may still fail to execute during
that visit; its destination is queued for collection. POST-preserving HTTP
307/308 redirects require a pre-established/manual session rather than automatic
POST replay. Start from the final canonical URL for best browser coverage.
Navigation waits for the response commit separately from script loading. The
observation window waits for throttled browser requests to settle, bounded by the
run duration, so a page with many chunks does not need to finish loading inside
the individual navigation timeout.

Service workers and WebSockets are blocked. Images, media, fonts, EventSource,
downloads and non-read HTTP methods are blocked except explicitly allowed scoped
POST URLs. Stylesheets are allowed to help
the browser render, but are not saved. Browser requests go through Playwright's
request interception/fetch layer, which can differ from an ordinary browsing
session. Chromium's own user agent is used in browser mode. Client-side redirects
and page links still obey scope checks. This tool
does not bypass authentication, challenges or bot protection.

HTTP downloads enforce decoded byte limits while streaming. Browser interception
checks declared size before reading the body and decoded size before saving, but
Playwright may already have buffered a large response. `--max-total-bytes` bounds
saved content, not all network traffic or browser memory. Duration limits request
scheduling; in-flight requests and output finalization can take additional time.

## Checks

```powershell
npm --prefix scripts/js-collector test
node scripts/js-collector/cli.mjs --help
```

The tests use local HTTP fixtures, including Next-style manifests and runtime
maps, dynamic browser loading, import resolution, source maps, redirect escape
attempts, scope enforcement, credential separation, deduplication and budgets.
Session coverage includes a scoped POST/callback, password fields filled from an
environment variable, cookie export/reuse, loop detection and denial diagnostics.
Browser tests skip if Chromium is absent; install Chromium to run them.

Exit codes: `0` collection has saved script records, `1` fatal/configuration error,
`2` no scripts saved, `3` user authentication/consent handoff required, `4` excluded
script dependencies require scope clarification. A successful exit does not certify complete coverage or absence of
errors; consult the output indexes.

Upstream documentation:
[Playwright networking](https://playwright.dev/docs/network),
[Acorn](https://github.com/acornjs/acorn),
[Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading),
[Katana](https://github.com/projectdiscovery/katana).

## Feedback

Please feel free to open a GitHub issue about errors, unsupported frameworks or
non-working elements. Include the Node.js version, a sanitized command and a small
local reproduction. Remove target URLs, extracted code, credentials, cookies,
session state and personal information before sharing.
