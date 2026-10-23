#!/usr/bin/env bash
# Builds the panel and packs it into one executable per OS, in ./release.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/go/bin:$PATH"

npm run build
mkdir -p release
GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o release/rclone-painel-linux .
# Windows icon and file details (winres/icon.png is public/favicon.svg
# rendered at 256 px). Go links the .syso into Windows builds only.
GOWINRES="$(go env GOPATH)/bin/go-winres"
[ -x "$GOWINRES" ] || go install github.com/tc-hib/go-winres@latest
"$GOWINRES" simply --icon winres/icon.png --manifest gui --arch amd64 \
  --product-name "Painel do rclone" --file-description "Painel do rclone" \
  --product-version 1.0.0 --file-version 1.0.0 --original-filename rclone-painel.exe
# -H windowsgui: no console window; errors are shown in a message box.
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o release/rclone-painel.exe .
ls -lh release
