# Aikido collector pilot

The user clarified that this task may retrieve the app's published CDN assets for
local analysis while keeping CDN infrastructure outside testing scope. The
runner now adds `cdn.aikido.dev` as an **asset-only** origin. Application page/API
scope stays restricted to `app.aikido.dev`; it stops for a user session at login.
The initial strict-scope checks remain documented in `scope.md` for provenance.

See [scope.md](scope.md) for the supplied policy and exact-origin restrictions.
The attribution header is `X-Intigriti`, configured in collector-headers.json.

From the repository root:

```powershell
./programs/aikido/collect.ps1
```

Open the resulting `inventory.html`. Exit 4 / `SCOPE-REQUIRED.md` means an excluded
script dependency needs program clarification. Exit 3 / `AUTH-REQUIRED.md` means collection
has reached a user login or consent boundary. Complete normal login yourself
using the program's account rules and provide a local saved browser state.
Do not paste credentials or session cookies into chat.

To revisit the entry using an authorized saved application session:

```powershell
./programs/aikido/collect.ps1 -StorageState programs/aikido/recon/storage-state-authorized.json
```

Third-party sign-in providers and other Aikido subdomains remain outside the
collector scope. No repository installation or real private-code connection is
part of this pilot.

The completed `recon/js/pilot-04` run saved 184 unique JavaScript files
(13,134,205 bytes), covering all 184 declared first-party script URLs. It made
184 CDN script GETs and one stylesheet GET, with no CDN API/page requests,
no asset/browser errors, and no remaining queued assets. It paused at
`https://app.aikido.dev/login` for a user session. The offline inventory, results,
validation data and JavaScript archive are in that run directory. All 27 local
collector tests passed.
