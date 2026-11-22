$ErrorActionPreference = 'Stop'
# Optional dependencies are local to this plugin; no global Python changes.
$target = Join-Path $PSScriptRoot '.runtime/python'
python -m pip install --target $target --upgrade --ignore-installed --requirement (Join-Path $PSScriptRoot 'requirements-save.txt')
if ($LASTEXITCODE -ne 0) { throw 'Optional Desktop save dependency installation failed.' }
python -B (Join-Path $PSScriptRoot 'py-service/desktop_save.py') --probe
if ($LASTEXITCODE -ne 0) { throw 'Desktop save dependency probe failed.' }
