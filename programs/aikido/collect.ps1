param(
    [string]$OutputPath,
    [string]$StorageState
)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
if (-not $OutputPath) {
    $OutputPath = Join-Path $PSScriptRoot ('recon/js/run-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$collectorArgs = @(
    (Join-Path $repoPath 'scripts/js-collector/cli.mjs'),
    'https://app.aikido.dev/',
    '--asset-origin', 'https://cdn.aikido.dev',
    '--strict-assets',
    '--headers-file', (Join-Path $PSScriptRoot 'collector-headers.json'),
    '--auth-policy', 'stop', '--delay', '1000', '--depth', '1', '--max-pages', '5',
    '--max-assets', '300', '--max-requests', '220', '--duration', '260', '--settle', '5000',
    '--max-bytes', '10485760', '--max-total-bytes', '52428800',
    '--exclude', '/(?:logout|signout|delete)(?:[/?#]|$)',
    '--save-storage-state', (Join-Path $OutputPath 'storage-state.json'),
    '--out', $OutputPath
)
if ($StorageState) { $collectorArgs += @('--storage-state', $StorageState) }
& node @collectorArgs
exit $LASTEXITCODE
