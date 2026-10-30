#!/usr/bin/env bash
# new-program.sh — scaffold a hunting workspace for a new program.
#
# Usage:
#   bash new-program.sh <program-name> [program-url]
#
# Example:
#   bash new-program.sh personio https://app.intigriti.com/programs/personio/personio/detail
#
# Creates hunting/programs/<program-name>/ with the full directory layout and the
# templates copied in. Refuses to overwrite an existing workspace.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES="$KIT_DIR/templates"

if [ $# -lt 1 ]; then
    echo "usage: bash new-program.sh <program-name> [program-url]" >&2
    exit 1
fi

NAME="$1"
URL="${2:-}"
DEST="$KIT_DIR/programs/$NAME"

if [ -e "$DEST" ]; then
    echo "!! workspace already exists: $DEST" >&2
    echo "   remove it first, or pick another name." >&2
    exit 1
fi

if [ ! -d "$TEMPLATES" ]; then
    echo "!! templates directory not found: $TEMPLATES" >&2
    exit 1
fi

mkdir -p "$DEST/recon/js" "$DEST/evidence" "$DEST/scripts"

for f in scope notes hypotheses findings report-template; do
    if [ -f "$TEMPLATES/$f.md" ]; then
        cp "$TEMPLATES/$f.md" "$DEST/$f.md"
    else
        echo "   warning: missing template $f.md" >&2
    fi
done

# Substitute the program name into the working documents
for f in scope notes hypotheses findings; do
    [ -f "$DEST/$f.md" ] && sed -i "s/<program name>/$NAME/g" "$DEST/$f.md"
done

# Seed the program URL into the scope table, if supplied
if [ -n "$URL" ] && [ -f "$DEST/scope.md" ]; then
    sed -i "s#^| Program URL |.*#| Program URL | $URL |#" "$DEST/scope.md"
fi

# Keep the empty directories visible
for d in recon recon/js evidence scripts; do
    touch "$DEST/$d/.gitkeep"
done

cat <<EOF

Workspace created: $DEST

  scope.md              <- FILL THIS IN COMPLETELY FIRST. No requests before it is done.
  notes.md              <- session log, write as you go
  hypotheses.md         <- claim / endpoint / test / result
  findings.md           <- confirmed findings
  report-template.md    <- report skeleton
  recon/                <- assets.md, endpoints.md, identifiers.md, js/
  evidence/             <- one directory per finding
  scripts/              <- your per-program scripts

Next steps:
  1. Read the program page and fill in scope.md completely.
  2. Set your proxy throttle BELOW the program's limit, and add the attribution header.
  3. Create your accounts, following any naming convention the program requires.
  4. Start at Phase 1 of HUNTER-WORKFLOW.md.

Reminder: re-read the scope at the start of every session. Programs change.
EOF
