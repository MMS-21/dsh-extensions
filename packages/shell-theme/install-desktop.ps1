$ErrorActionPreference='Stop'
$packageName='@local/dsh-shell-theme'
$profileRoot=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))
$manifestPath=Join-Path $profileRoot 'package.json'
$profile=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($profile.dependencies.$packageName -and (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)) {
 throw 'Close DSH before replacing an already installed shell-theme extension.'
}
$targets=@((Join-Path $profileRoot 'plugins/shell-theme'),(Join-Path $profileRoot 'node_modules/@local/dsh-shell-theme'))
foreach($target in $targets){if(-not [IO.Path]::GetFullPath($target).StartsWith($profileRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target escapes the desktop profile.'}}
$files=@('index.js','client.js','package.json','cordis.patch.yml','README.md','THIRD-PARTY-NOTICES.md','MOTION-LICENSES.txt')
foreach($file in $files){$null=Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file)}
$backup=Join-Path $PSScriptRoot ('desktop-backup-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $backup 'profile-package.json')
$written=@()
try {
 foreach($target in $targets){
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  foreach($file in $files){
   $destination=Join-Path $target $file
   $saved=Join-Path $backup ([IO.Path]::GetRelativePath($profileRoot,$destination))
   if(Test-Path -LiteralPath $destination){New-Item -ItemType Directory -Path (Split-Path $saved) -Force|Out-Null;Copy-Item -LiteralPath $destination -Destination $saved}
   $written+=@{Destination=$destination;Saved=$saved}
   Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $destination -Force
   if((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file)).Hash){throw "Verification failed: $file"}
  }
 }
 $profile.dependencies | Add-Member -MemberType NoteProperty -Name $packageName -Value 'file:./plugins/shell-theme' -Force
 if($packageName -notin $profile.dsh.profile.bundles){$profile.dsh.profile.bundles=@($profile.dsh.profile.bundles)+$packageName}
 $temporary=Join-Path $profileRoot 'package.json.shell-theme.tmp'
 [IO.File]::WriteAllText($temporary,($profile|ConvertTo-Json -Depth 40)+"`n",[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temporary -Destination $manifestPath -Force
 $verified=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
 if($packageName -notin $verified.dsh.profile.bundles){throw 'Bundle registration was not persisted.'}
 Write-Output 'Installed and verified shell-theme extension in both desktop profile copies.'
 Write-Output 'Shell theme installed. Restart DSH to activate.'
 Write-Output "Backup: $backup"
} catch {
 foreach($item in $written){if(Test-Path -LiteralPath $item.Saved){Copy-Item -LiteralPath $item.Saved -Destination $item.Destination -Force}else{Remove-Item -LiteralPath $item.Destination -ErrorAction SilentlyContinue}}
 Copy-Item -LiteralPath (Join-Path $backup 'profile-package.json') -Destination $manifestPath -Force
 throw
}
