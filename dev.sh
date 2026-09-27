#!/usr/bin/env bash
# Lanza el Sistema Solar en local en macOS o Linux.
# Detecta el sistema, instala lo que falte (Node y, si hace falta compilar, Rust + wasm-pack)
# y arranca el servidor de desarrollo.
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[36m›\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

ask() {
  # En modo no interactivo (CI, tubería) se asume "sí"
  [ -t 0 ] || return 0
  read -r -p "$1 [S/n] " r
  [[ -z "$r" || "$r" =~ ^[sSyY] ]]
}

# ─── Sistema operativo y gestor de paquetes ───
OS="$(uname -s)"
ARCH="$(uname -m)"
PKG=""
case "$OS" in
  Darwin)
    PLATFORM="macOS $(sw_vers -productVersion 2>/dev/null || true) ($ARCH)"
    command -v brew >/dev/null && PKG=brew
    ;;
  Linux)
    DISTRO="Linux"
    if [ -r /etc/os-release ]; then . /etc/os-release; DISTRO="${PRETTY_NAME:-$ID}"; fi
    grep -qi microsoft /proc/version 2>/dev/null && DISTRO="$DISTRO (WSL)"
    PLATFORM="$DISTRO ($ARCH)"
    for p in apt-get dnf yum pacman zypper apk; do command -v "$p" >/dev/null && { PKG=$p; break; }; done
    ;;
  *) fail "Sistema no soportado: $OS. En Windows usa dev.ps1." ;;
esac
bold "Sistema Solar · entorno local"
info "Sistema: $PLATFORM${PKG:+ · gestor: $PKG}"

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null && SUDO=sudo

install_node() {
  case "$PKG" in
    brew) brew install node ;;
    apt-get)
      curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
      $SUDO apt-get install -y nodejs ;;
    dnf|yum) curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash - && $SUDO "$PKG" install -y nodejs ;;
    pacman) $SUDO pacman -Sy --noconfirm nodejs npm ;;
    zypper) $SUDO zypper install -y nodejs22 npm22 ;;
    apk) $SUDO apk add nodejs npm ;;
    *) fail "No encuentro gestor de paquetes. Instala Node 20+ desde https://nodejs.org y vuelve a lanzar." ;;
  esac
}

# ─── Node ───
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if ! node_ok; then
  warn "Hace falta Node 20 o superior$(command -v node >/dev/null && echo " (tienes $(node -v))")."
  ask "¿Lo instalo ahora?" || fail "Instala Node 20+ y vuelve a lanzar."
  install_node
  node_ok || fail "Node sigue sin estar disponible; abre una terminal nueva y reintenta."
fi
info "Node $(node -v)"

# ─── WASM: precompilado (rama COMPILED) o compilar desde Rust (rama DECOMPILED) ───
if [ -f web/src/wasm/astro_wasm_bg.wasm ] && [ ! -d crates ]; then
  info "Motor WebAssembly precompilado: no hace falta Rust."
else
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
  if ! command -v cargo >/dev/null; then
    warn "Para compilar el motor hace falta Rust."
    ask "¿Instalo Rust con rustup (https://rustup.rs)?" || fail "Instala Rust o usa la rama COMPILED."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    . "$HOME/.cargo/env"
  fi
  info "$(rustc --version)"
  rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown
  if ! command -v wasm-pack >/dev/null; then
    info "Instalando wasm-pack…"
    curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh || cargo install wasm-pack --locked
  fi
  info "Compilando el motor Rust → WebAssembly…"
  npm run --silent wasm
fi

# ─── Dependencias JS y arranque ───
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  info "Instalando dependencias (npm ci)…"
  npm ci --no-audit --no-fund
fi

PORT="${PORT:-5173}"
bold "Abriendo http://localhost:$PORT"
OPEN=""
if [ "$OS" = Darwin ] || command -v xdg-open >/dev/null; then OPEN="--open"; fi
exec npx vite --port "$PORT" $OPEN
