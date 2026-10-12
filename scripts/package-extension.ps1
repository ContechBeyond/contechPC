$ErrorActionPreference = 'Stop'
$extensionRepository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$extensionSource = Join-Path $extensionRepository 'extensions\contech-syscom'
$extensionArchive = Join-Path $extensionRepository 'assets\contech-syscom-extension.zip'
if (-not (Test-Path -LiteralPath (Join-Path $extensionSource 'manifest.json'))) { throw 'No se encontró el manifiesto de la extensión.' }
Compress-Archive -LiteralPath $extensionSource -DestinationPath $extensionArchive -Force
Write-Output "Paquete creado: $extensionArchive"
