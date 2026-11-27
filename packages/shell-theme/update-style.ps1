$ErrorActionPreference='Stop'
$profileRoot=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json
$targets=@((Join-Path $profileRoot 'plugins/shell-theme'),(Join-Path $profileRoot 'node_modules/@local/dsh-shell-theme'))
foreach($target in $targets){
 if(-not [IO.Path]::GetFullPath($target).StartsWith($profileRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target escapes profile.'}
 $installed=Get-Content -LiteralPath (Join-Path $target 'package.json') -Raw | ConvertFrom-Json
 if($installed.name -ne $source.name -or ($installed.dsh|ConvertTo-Json -Depth 30 -Compress) -ne ($source.dsh|ConvertTo-Json -Depth 30 -Compress) -or ($installed.exports|ConvertTo-Json -Compress) -ne ($source.exports|ConvertTo-Json -Compress)){
  throw 'Module configuration changed. Close DSH and use the full installer.'
 }
}
$backup=Join-Path $PSScriptRoot ('style-backup-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
$written=@()
try {
 for($index=0;$index -lt $targets.Count;$index++){
  $destination=Join-Path $targets[$index] 'client.js'
  $saved=Join-Path $backup ('client-'+$index+'.js')
  Copy-Item -LiteralPath $destination -Destination $saved
  $temporary=Join-Path $targets[$index] ('client-'+[guid]::NewGuid().ToString('N')+'.tmp')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'client.js') -Destination $temporary
  $written+=@{Destination=$destination;Saved=$saved;Temporary=$temporary}
  [IO.File]::Replace($temporary,$destination,($temporary+'.bak'))
  if((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'client.js')).Hash){throw 'Style hash verification failed.'}
  Remove-Item -LiteralPath ($temporary+'.bak')
 }
 Write-Output 'Installed and hash-verified style-only update in both copies. Profile configuration and installed manifest unchanged.'
 Write-Output "Backup: $backup"
} catch {
 foreach($item in $written){Copy-Item -LiteralPath $item.Saved -Destination $item.Destination -Force;Remove-Item -LiteralPath $item.Temporary -ErrorAction SilentlyContinue;Remove-Item -LiteralPath ($item.Temporary+'.bak') -ErrorAction SilentlyContinue}
 throw
}
