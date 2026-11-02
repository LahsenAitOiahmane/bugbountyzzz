# DPG Media JavaScript collection

## Current runner

The follow-up live test collected JavaScript from the corporate Next.js website.
The runner uses the exact entry/canonical/consent origins recorded in `scope.md`,
one request start per second, depth one, four page records (including redirects)
and bounded asset/request budgets:

```powershell
./programs/dpgmedia/collect.ps1
```

It creates a new timestamped output directory under `recon/js/` and saves browser
state privately inside that run. To reuse an established session:

```powershell
./programs/dpgmedia/collect.ps1 -StorageState programs/dpgmedia/recon/js/previous-run/storage-state.json
```

`-ManualSeconds 120` opens the isolated browser for manual navigation. POST remains
blocked in this runner; an actual login/consent submission needs a separately
configured exact POST endpoint and the generic collector's session-flow options.
The live public-homepage test did not require registering or logging into an
account. Account-required flows were tested on local fixtures, not DPG accounts.

Raw run manifests and the results report remain under gitignored `recon/`.
Open a run's `inventory.html` for page descriptions, form actions, page/script
relationships and observed versus inferred calls. The runner pauses for a user
session when an authentication boundary is reached. DPG's excluded login hosts
remain blocked. No live login to those providers is part of this validation.

For the earlier single-entry behavior, use `-Depth 0 -MaxPages 8`.

## Initial pilot (historical)

See [scope.md](scope.md) for the supplied policy and the first pilot's bounds.
The pilot target selected by the user is `https://www.dpgmedia.be/`.

From the repository root, using a new output directory each time:

```powershell
node scripts/js-collector/cli.mjs https://www.dpgmedia.be/ --mode hybrid --headers-file programs/dpgmedia/collector-headers.json --delay 1000 --depth 0 --max-pages 3 --max-assets 40 --max-requests 50 --duration 90 --settle 8000 --max-bytes 10485760 --max-total-bytes 52428800 --exclude '^https?://(?:login\.dpgmedia\.(?:be|nl)|visitors\.dpgmedia\.be|actie\.[^/]+|cadeau\.videoland\.com)(?::\d+)?(?:/|$)' --exclude 'qualifio|/logout|/signout|/delete' --out programs/dpgmedia/recon/js/pilot-01
```

All off-origin resources are blocked, even when mentioned by the page. Review
`manifest.json`, `assets.jsonl`, `pages.jsonl` and `skipped.jsonl` after the run.
Do not add a redirected domain or third-party CDN just to make the page work;
first establish that it is eligible under the program's scope.

The first pilot returned an off-origin redirect. The canonical corporate site was
assessed separately in [scope.md](scope.md). The bounded continuation uses the
same options with seed `https://www.dpgmediagroup.com/nl-BE` and a new output
directory `programs/dpgmedia/recon/js/pilot-02`.
