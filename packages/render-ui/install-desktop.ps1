$ErrorActionPreference = 'Stop'

if (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
    throw 'Quit DeepSeek Harness before installing this update.'
}

$profile = Join-Path $env:USERPROFILE '.dsh/profiles/desktop'
$profilePackage = Get-Content -LiteralPath (Join-Path $profile 'package.json') -Raw | ConvertFrom-Json
if ($profilePackage.dependencies.'@local/dsh-plugin-render-ui' -ne 'file:./plugins/render-ui') {
    throw 'The Desktop profile does not reference the expected local render-ui package.'
}

$targets = @(
    (Join-Path $profile 'plugins/render-ui/lib'),
    (Join-Path $profile 'node_modules/@local/dsh-plugin-render-ui/lib')
)
$files = @('client.js', 'index.js', 'validate.js', 'openui-validate.js', 'dashboard-validate.js', 'data-snapshot.js', 'tool-execution.js', 'openui-instructions.json', 'openui-schema.json', 'dashboard-instructions.json', 'dashboard-schema.json', 'THIRD_PARTY_NOTICES.txt')
$source = Join-Path $PSScriptRoot 'lib'
$backup = Join-Path $PSScriptRoot ('desktop-backup-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))

foreach ($file in $files) {
    $localCopy = Join-Path $targets[0] $file
    $installedCopy = Join-Path $targets[1] $file
    $localExists = Test-Path -LiteralPath $localCopy
    $installedExists = Test-Path -LiteralPath $installedCopy
    if ($localExists -ne $installedExists -or ($localExists -and
        (Get-FileHash -LiteralPath $localCopy).Hash -ne (Get-FileHash -LiteralPath $installedCopy).Hash)) {
        throw "The two Desktop copies of $file differ. Installation stopped before writing."
    }
    $null = Get-FileHash -LiteralPath (Join-Path $source $file)
}

New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($file in $files) {
    $original = Join-Path $targets[0] $file
    if (Test-Path -LiteralPath $original) { Copy-Item -LiteralPath $original -Destination $backup }
}

try {
    foreach ($target in $targets) {
        foreach ($file in $files) {
            $original = Join-Path $source $file
            $destination = Join-Path $target $file
            Copy-Item -LiteralPath $original -Destination $destination -Force
            if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath $original).Hash) {
                throw "Verification failed for $destination."
            }
        }
    }
} catch {
    foreach ($target in $targets) {
        foreach ($file in $files) {
            $saved = Join-Path $backup $file
            $destination = Join-Path $target $file
            if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $destination -Force }
            elseif (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
        }
    }
    throw
}

Write-Output "Installed and verified all $($files.Count) updated files in both Desktop plugin copies."
Write-Output "Backup: $backup"
