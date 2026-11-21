$ErrorActionPreference = 'Stop'
if (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
    throw 'Quit DeepSeek Harness before installing Extension Update Manager.'
}
$profileDir = if ($env:DSH_PROFILE_DIR) { $env:DSH_PROFILE_DIR } else { Join-Path $env:USERPROFILE '.dsh/profiles/desktop' }
$manifest = Join-Path $profileDir 'package.json'
$source = [IO.Path]::GetFullPath($PSScriptRoot)
$original = [IO.File]::ReadAllText($manifest)
$package = $original | ConvertFrom-Json
if ($package.name -ne 'dsh-profile-desktop' -or !$package.dsh.profile.bundles) { throw 'Unexpected Desktop profile manifest.' }
$name = '@local/dsh-plugin-update-manager'
$link = Join-Path $profileDir 'node_modules/@local/dsh-plugin-update-manager'
$spec = 'link:' + $source.Replace([char]92,[char]47)
if ($package.dependencies.PSObject.Properties.Name -contains $name) {
    if ($package.dependencies.$name -ne $spec) { throw 'Extension Update Manager already points to a different source; review it before replacing.' }
}
if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link
    if ($item.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath(@($item.Target)[0]) -ne $source) { throw 'Destination exists and is not this package junction.' }
} else {
    New-Item -ItemType Directory -Path (Split-Path -Parent $link) -Force | Out-Null
    New-Item -ItemType Junction -Path $link -Target $source | Out-Null
}
$backup = $manifest + '.bak-update-manager-' + [guid]::NewGuid().ToString('N')
Copy-Item -LiteralPath $manifest -Destination $backup
if ([IO.File]::ReadAllText($manifest) -ne $original) { throw 'Profile changed during installation.' }
$package.dependencies | Add-Member -MemberType NoteProperty -Name $name -Value $spec -Force
if ($name -notin $package.dsh.profile.bundles) { $package.dsh.profile.bundles = @($package.dsh.profile.bundles) + $name }
try {
    [IO.File]::WriteAllText($manifest, ($package | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
    $verified = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    if ($verified.dependencies.$name -ne $spec -or $name -notin $verified.dsh.profile.bundles) { throw 'Installed manifest verification failed.' }
} catch {
    [IO.File]::WriteAllText($manifest, $original, [Text.UTF8Encoding]::new($false))
    throw
}
Write-Output 'Extension Update Manager bundle registered. Restart DSH, then open Plugins → Extension Updates.'
Write-Output "Profile backup: $backup"
