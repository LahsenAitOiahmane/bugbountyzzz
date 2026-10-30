#!/usr/bin/env bash
# install-tools.sh — install the recon toolchain inside WSL / Kali / Debian.
#
# Usage:
#   bash install-tools.sh            # install Go tools
#   bash install-tools.sh --wordlists  # also clone SecLists (large)
#
# Idempotent: safe to re-run. Installs to ~/go/bin, which is added to PATH.
#
# REMINDER: these tools are for expanding coverage on targets you are authorised to
# test, and for the passive half of recon. Automated scanning is BANNED by most
# programs and scanner output is explicitly unpaid. Read HUNTER-WORKFLOW.md Rule 1.

set -euo pipefail

WITH_WORDLISTS=0
[ "${1:-}" = "--wordlists" ] && WITH_WORDLISTS=1

echo "==> checking Go"
if ! command -v go >/dev/null 2>&1; then
    echo "    Go not found."
    if command -v apt-get >/dev/null 2>&1; then
        echo "    attempting: apt-get install golang-go"
        sudo apt-get update -qq
        sudo apt-get install -y golang-go || {
            echo "!! apt install failed. Install Go manually from https://go.dev/dl/" >&2
            exit 1
        }
    else
        echo "!! no apt-get available. Install Go from https://go.dev/dl/ and re-run." >&2
        exit 1
    fi
fi
echo "    $(go version)"

# Make sure ~/go/bin is on PATH
GOBIN_DIR="$(go env GOPATH)/bin"
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$GOBIN_DIR"; then
    echo "==> adding $GOBIN_DIR to PATH in ~/.bashrc"
    # shellcheck disable=SC2016
    grep -qxF 'export PATH="$PATH:$(go env GOPATH)/bin"' "$HOME/.bashrc" 2>/dev/null || \
        echo 'export PATH="$PATH:$(go env GOPATH)/bin"' >> "$HOME/.bashrc"
    export PATH="$PATH:$GOBIN_DIR"
fi

TOOLS=(
    "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
    "github.com/projectdiscovery/dnsx/cmd/dnsx@latest"
    "github.com/projectdiscovery/httpx/cmd/httpx@latest"
    "github.com/projectdiscovery/naabu/v2/cmd/naabu@latest"
    "github.com/projectdiscovery/katana/cmd/katana@latest"
    "github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest"
    "github.com/lc/gau/v2/cmd/gau@latest"
    "github.com/tomnomnom/waybackurls@latest"
    "github.com/ffuf/ffuf/v2@latest"
)

echo
echo "==> installing ${#TOOLS[@]} Go tools (this takes a few minutes)"
for tool in "${TOOLS[@]}"; do
    name="${tool##*/}"
    name="${name%@*}"
    printf '    %-14s ' "$name"
    if go install -v "$tool" >/dev/null 2>&1; then
        echo "ok"
    else
        echo "FAILED"
    fi
done

if [ "$WITH_WORDLISTS" -eq 1 ]; then
    echo
    echo "==> cloning SecLists (this is large, ~1GB)"
    if [ -d "$HOME/tools/SecLists" ]; then
        echo "    already present at ~/tools/SecLists"
    else
        mkdir -p "$HOME/tools"
        git clone --depth 1 https://github.com/danielmiessler/SecLists.git "$HOME/tools/SecLists" \
            && echo "    cloned to ~/tools/SecLists"
    fi
fi

echo
echo "==> installed versions"
for t in subfinder dnsx httpx naabu katana nuclei gau waybackurls ffuf; do
    if command -v "$t" >/dev/null 2>&1; then
        printf '    %-14s %s\n' "$t" "$("$t" -version 2>/dev/null | head -1 || echo present)"
    else
        printf '    %-14s %s\n' "$t" "NOT ON PATH (open a new shell)"
    fi
done

cat <<'EOF'

Done.

Open a new shell (or `source ~/.bashrc`) so PATH picks up ~/go/bin.

You still need:
  - Burp Suite Community (or Caido) as your proxy
  - A dedicated Firefox profile with FoxyProxy
  - The throttling and attribution header configured BEFORE your first request

See HUNTER-WORKFLOW.md Phase 0 for the compliance gates.
EOF
