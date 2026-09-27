# Lanza el Sistema Solar en local en Windows (PowerShell 5.1+ o PowerShell 7).
# Detecta el sistema, instala lo que falte (Node y, si hace falta compilar, Rust + wasm-pack)
# y arranca el servidor de desarrollo.
#   powershell -ExecutionPolicy Bypass -File .\dev.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Info($m) { Write-Host "› $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "✗ $m" -ForegroundColor Red; exit 1 }
function Ask($q) {
  if (-not [Environment]::UserInteractive) { return $true }
  $r = Read-Host "$q [S/n]"
  return ($r -eq '' -or $r -match '^[sSyY]')
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User') + ";$env:USERPROFILE\.cargo\bin"
}

# PowerShell 7 también corre en macOS/Linux: allí mejor dev.sh
if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) {
  Info 'No estás en Windows: usando dev.sh'
  & bash ./dev.sh
  exit $LASTEXITCODE
}

$os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue)
$arch = $env:PROCESSOR_ARCHITECTURE
Write-Host 'Sistema Solar · entorno local' -ForegroundColor White
Info "Sistema: $($os.Caption) $($os.Version) ($arch) · PowerShell $($PSVersionTable.PSVersion)"
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
$hasChoco = [bool](Get-Command choco -ErrorAction SilentlyContinue)

# ─── Node ───
function Node-Ok {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  return ([int]((node -p "process.versions.node.split('.')[0]"))) -ge 20
}
if (-not (Node-Ok)) {
  Warn 'Hace falta Node 20 o superior.'
  if (-not (Ask '¿Lo instalo ahora?')) { Fail 'Instala Node 20+ desde https://nodejs.org y vuelve a lanzar.' }
  if ($hasWinget) { winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements }
  elseif ($hasChoco) { choco install nodejs-lts -y }
  else { Fail 'No hay winget ni choco. Instala Node desde https://nodejs.org' }
  Refresh-Path
  if (-not (Node-Ok)) { Fail 'Node sigue sin estar disponible; abre una terminal nueva y reintenta.' }
}
Info "Node $(node -v)"

# ─── WASM: precompilado (rama COMPILED) o compilar desde Rust (rama DECOMPILED) ───
if ((Test-Path 'web/src/wasm/astro_wasm_bg.wasm') -and -not (Test-Path 'crates')) {
  Info 'Motor WebAssembly precompilado: no hace falta Rust.'
} else {
  Refresh-Path
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Warn 'Para compilar el motor hace falta Rust.'
    if (-not (Ask '¿Instalo Rust con rustup?')) { Fail 'Instala Rust o usa la rama COMPILED.' }
    if ($hasWinget) {
      winget install -e --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements
    } else {
      $init = Join-Path $env:TEMP 'rustup-init.exe'
      Invoke-WebRequest 'https://win.rustup.rs/x86_64' -OutFile $init
      & $init -y --profile minimal
    }
    Refresh-Path
    Warn 'Rust en Windows necesita las Build Tools de Visual Studio (C++). Si falla el enlazado, instálalas: winget install Microsoft.VisualStudio.2022.BuildTools'
  }
  Info (rustc --version)
  if (-not ((rustup target list --installed) -match 'wasm32-unknown-unknown')) { rustup target add wasm32-unknown-unknown }
  if (-not (Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
    Info 'Instalando wasm-pack…'
    cargo install wasm-pack --locked
  }
  Info 'Compilando el motor Rust → WebAssembly…'
  npm run --silent wasm
  if ($LASTEXITCODE -ne 0) { Fail 'Falló la compilación del WASM.' }
}

# ─── Dependencias JS y arranque ───
if (-not (Test-Path 'node_modules') -or ((Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item 'node_modules').LastWriteTime)) {
  Info 'Instalando dependencias (npm ci)…'
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci falló.' }
}

$port = if ($env:PORT) { $env:PORT } else { 5173 }
Write-Host "Abriendo http://localhost:$port" -ForegroundColor White
npx vite --port $port --open
