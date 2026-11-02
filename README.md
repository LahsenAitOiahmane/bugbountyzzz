# js-collect

Collect and map the client-side JavaScript exposed by an authorized web application.
Give it a hostname or URL; it saves original bundles, inline scripts, discoverable
chunks and published source maps, with page and dependency relationships. An offline
analysis command formats the saved code and indexes imports, exports, API references
and security review cues.

Works with Node.js 22+ on Windows, Linux and macOS. Playwright renders the application;
Acorn and parse5 parse its code and HTML. No target is hardcoded.

## Prepare the workspace

Install Node.js 22+ and Git, then run these commands from a terminal:

```sh
git clone https://github.com/LahsenAitOiahmane/bugbountyzzz.git
cd bugbountyzzz
npm --prefix scripts/js-collector ci
npm --prefix scripts/js-collector run browser:install
```

On Linux, if Chromium needs operating-system libraries:

```sh
cd scripts/js-collector
npx playwright install --with-deps chromium
cd ../..
```

The browser download is optional for HTTP-only collection. All examples below run
from the repository root and use a new output directory for each run.

## Start recon and extraction

```sh
node scripts/js-collector/cli.mjs example.com --out recon/example/public-01
```

A hostname uses HTTPS. The exact starting origin is allowed; subdomains, other ports
and external CDNs are added explicitly. For an application that publishes its scripts
on a separate asset origin:

```sh
node scripts/js-collector/cli.mjs https://app.example.com --asset-origin https://cdn.example.com --strict-assets --delay 1000 --out recon/example/public-02
```

Asset origins permit published dependency retrieval; they do not permit page crawling
or API calls on the CDN. Set the origins, exclusions, attribution headers, rate and
budgets to match the authorization for your target. Open the run's `inventory.html`
to inspect pages, forms, scripts and observed network relationships.

No URL-only run guarantees every script. Login, roles, feature flags and unvisited
interactions can expose additional code. The default authentication policy pauses at
login or consent and writes `AUTH-REQUIRED.md`. Complete normal login yourself and
resume with a local saved session; never post passwords or cookies in an issue.

## Map and review the saved JavaScript

```sh
node scripts/js-collector/analyze.mjs recon/example/public-02 --out recon/example/analysis-01
```

Open `recon/example/analysis-01/map.html`. The analysis makes no target requests and
does not execute downloaded bundles. It preserves original evidence and writes
formatted views, module relationships, endpoint references and review cues. A cue is
a lead for manual validation, not a confirmed vulnerability or a ready-to-submit report.

## Commands and full reference

```sh
node scripts/js-collector/cli.mjs --help
node scripts/js-collector/analyze.mjs --help
npm --prefix scripts/js-collector test
node scripts/check-public-files.mjs
node scripts/export-tool.mjs --out recon/releases/js-collect
```

See the **[complete command and parameter reference](scripts/js-collector/README.md)**
for every flag, default, authentication flow, exit code, output format and integration.
The release command copies only the tool and its generic documentation into a new
directory. It includes no program workspaces, captured JavaScript, account state,
local machine details or Git history. It does not publish anything.

## Keep research private

This repository's public tree is limited to the automation tool, generic examples,
tests and documentation. Store captures, reports, headers and sessions under `recon/`;
that directory and local program workspaces are ignored. A publication check rejects
tracked files outside the tool allowlist and obvious embedded credentials or local
user paths. Ignoring a file does not remove it from an earlier Git commit. Use the
clean release export when sharing the tool without older repository history.

## Feedback

Please feel free to [open an issue](https://github.com/LahsenAitOiahmane/bugbountyzzz/issues)
about errors, unsupported frameworks or non-working elements. Include your Node.js
version, a sanitized command, the error and a minimal local reproduction when possible.
Remove target-sensitive URLs, extracted code, credentials, session data and personal
information before sharing.
