param(
    [string]$OutputPath,
    [ValidateSet('hybrid', 'static')][string]$Mode = 'hybrid',
    [string]$StorageState,
    [ValidateRange(0, 600)][int]$ManualSeconds = 0,
    [ValidateRange(0, 3)][int]$Depth = 1,
    [ValidateRange(1, 25)][int]$MaxPages = 4,
    [ValidateRange(1, 300)][int]$MaxRequests = 190
)

$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
if (-not $OutputPath) {
    $OutputPath = Join-Path $PSScriptRoot ('recon/js/run-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$collectorArgs = @(
    (Join-Path $repoPath 'scripts/js-collector/cli.mjs'),
    'https://www.dpgmedia.be/',
    '--mode', $Mode,
    '--origin', 'https://www.dpgmediagroup.com',
    '--origin', 'https://myprivacy.dpgmediagroup.net',
    '--researcher', 'l27sen',
    '--delay', '1000', '--depth', [string]$Depth, '--max-pages', [string]$MaxPages,
    '--max-assets', '120', '--max-requests', [string]$MaxRequests, '--duration', '300',
    '--auth-policy', 'stop',
    '--settle', '8000', '--max-bytes', '10485760', '--max-total-bytes', '52428800',
    '--exclude', '^https?://(?:login\.dpgmedia\.(?:be|nl)|visitors\.dpgmedia\.be|actie\.[^/]+|cadeau\.videoland\.com)(?::\d+)?(?:/|$)',
    '--exclude', 'qualifio|/logout|/signout|/delete',
    '--out', $OutputPath
)
if ($StorageState) { $collectorArgs += @('--storage-state', $StorageState) }
if ($Mode -eq 'hybrid') {
    $collectorArgs += @('--save-storage-state', (Join-Path $OutputPath 'storage-state.json'))
}
if ($ManualSeconds) {
    if ($Mode -ne 'hybrid') { throw 'Manual browsing requires hybrid mode.' }
    $collectorArgs += @('--manual-seconds', [string]$ManualSeconds)
}
& node @collectorArgs
exit $LASTEXITCODE
