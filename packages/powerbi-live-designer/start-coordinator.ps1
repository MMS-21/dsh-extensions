param(
    [Parameter(Mandatory = $true)][string]$Project,
    [ValidateRange(1024,65535)][int]$Port = 8765,
    [string]$ModelingServer
)
$ErrorActionPreference = 'Stop'
$authorPackage = '@microsoft/powerbi-report-authoring-cli'
$authorDirectory = Join-Path $PSScriptRoot "node_modules/$authorPackage"
$authorManifest = Join-Path $authorDirectory 'package.json'
$expectedVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).dependencies.$authorPackage
if (!(Test-Path -LiteralPath $authorManifest)) {
    throw 'The bundled Power BI CLI dependency is missing. Run the plugin installer or npm ci --ignore-scripts.'
}
$author = Get-Content -LiteralPath $authorManifest -Raw | ConvertFrom-Json
if ($author.version -ne $expectedVersion) {
    throw "Power BI Live Designer requires authoring CLI $expectedVersion. Run npm ci --ignore-scripts in the bundle directory."
}
$authorEntry = Join-Path $authorDirectory $author.bin.'powerbi-report-author'
if (!(Test-Path -LiteralPath $authorEntry -PathType Leaf)) { throw 'The Power BI CLI executable entry is missing.' }
$resolvedProject = (Resolve-Path -LiteralPath $Project).Path
if ([IO.Path]::GetExtension($resolvedProject) -ne '.pbip' -and -not $resolvedProject.EndsWith('.Report')) {
    throw 'Choose a PBIP file or .Report folder; preserve the original PBIX.'
}
$serviceUrl = "http://127.0.0.1:$Port"
$existing = $null
$occupied = $false
try { $existing = Invoke-RestMethod "$serviceUrl/api/state" -TimeoutSec 2 } catch { $occupied = $null -ne $_.Exception.Response }
if ($occupied) { throw 'This port belongs to another HTTP service. Choose another port; no process was stopped.' }
if ($existing) {
    if ($existing.state.project -ne $resolvedProject -or $existing.state.modelWritesEnabled -ne $false) {
        throw 'This port belongs to a different project or an incompatible coordinator. No process was stopped.'
    }
    Write-Output "Coordinator already available at $serviceUrl"
    exit 0
}
$runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$controlToken = Join-Path $runtime 'control-token'
if (-not (Test-Path -LiteralPath $controlToken)) {
    $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    [IO.File]::WriteAllText($controlToken, [Convert]::ToHexString($bytes).ToLowerInvariant(), [Text.UTF8Encoding]::new($false))
}
$server = Join-Path $PSScriptRoot 'py-service/server.py'
if (-not $ModelingServer) {
    $settings = Join-Path $runtime 'modeling-server.path'
    if (Test-Path -LiteralPath $settings) { $ModelingServer = (Get-Content -LiteralPath $settings -Raw).Trim() }
}
$arguments = @('-B', "`"$server`"", '--project', "`"$resolvedProject`"", '--port', $Port, '--control-token-file', "`"$controlToken`"", '--cli', "`"$authorEntry`"")
if ($ModelingServer) { $arguments += @('--modeling-server', "`"$ModelingServer`"") }
$python = (Get-Command python).Source
$process = Start-Process -FilePath $python -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'coordinator.stdout.log') -RedirectStandardError (Join-Path $runtime 'coordinator.stderr.log')
$process.Id | Set-Content -LiteralPath (Join-Path $runtime 'coordinator.pid')
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($process.HasExited) { throw "Coordinator exited. Read $(Join-Path $runtime 'coordinator.stderr.log')" }
    try {
        $state = Invoke-RestMethod "$serviceUrl/api/state" -TimeoutSec 1
        if ($state.state.project -eq $resolvedProject -and $state.state.modelWritesEnabled -eq $false) {
            $process.Id | Set-Content -LiteralPath (Join-Path $runtime 'coordinator.pid')
            Write-Output "Coordinator started at $serviceUrl (PID $($process.Id))."
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 250
}
throw 'Coordinator did not become ready within the startup window. Check its logs; no report changes were requested.'
