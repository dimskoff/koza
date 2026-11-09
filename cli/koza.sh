#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# ─────────────────────────────────────────────────────────────────────
# koza cli — talk to any koza server from the terminal.
#
#   chmod +x koza.sh
#   KOZA_HOST=https://koza.click ./koza.sh shorten https://github.com gh
#   KOZA_HOST=http://localhost:8787 ./koza.sh list
#
# env: KOZA_HOST       server to talk to      (default https://koza.click)
#      KOZA_ADMIN_KEY  needed for burn/close  (if the server has one)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${KOZA_HOST:-https://koza.click}"
API="$HOST/api/v1"
AUTH=()
[ -n "${KOZA_ADMIN_KEY:-}" ] && AUTH=(-H "x-koza-key: ${KOZA_ADMIN_KEY}")

# Escape a string for safe inclusion inside JSON quotes
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

usage() {
  cat <<EOF
koza cli — ${API}

  shorten <url> [slug] [password]    mint a short link
  list                               every link on the server
  info <slug>                        one link — clicks, lock state
  burn <slug>                        delete a link
  room [password]                    open a box line, get the code
  close <code>                       close a box line
  stats                              server health, active lines & counts
  open <slug>                        where a link points (server side)

env: KOZA_HOST, KOZA_ADMIN_KEY
EOF
}

cmd="${1:-}"
[ -z "$cmd" ] && { usage; exit 0; }
shift

case "$cmd" in
  shorten)
    url="${1:?usage: shorten <url> [slug] [password]}"
    slug="${2:-}"
    pw="${3:-}"
    e_url="$(json_escape "$url")"
    e_slug="$(json_escape "$slug")"
    e_pw="$(json_escape "$pw")"
    body="{\"url\": \"${e_url}\""
    [ -n "$slug" ] && body="${body}, \"slug\": \"${e_slug}\""
    [ -n "$pw" ] && body="${body}, \"password\": \"${e_pw}\""
    body="${body}}"
    curl -sS -X POST "${API}/shorten" -H 'content-type: application/json' -d "${body}"
    echo
    ;;
  list)
    curl -sS "${API}/links"
    echo
    ;;
  info)
    curl -sS "${API}/links/${1:?usage: info <slug>}"
    echo
    ;;
  stats)
    curl -sS "${API}/stats" "${AUTH[@]+"${AUTH[@]}"}"
    echo
    ;;
  open)
    curl -sS "${API}/links/${1:?usage: open <slug>}" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
    ;;
  burn)
    curl -sS -X DELETE "${API}/links/${1:?usage: burn <slug>}" "${AUTH[@]+"${AUTH[@]}"}"
    echo
    ;;
  room)
    pw="${1:-}"
    if [ -n "$pw" ]; then
      e_pw="$(json_escape "$pw")"
      curl -sS -X POST "${API}/box/rooms" -H 'content-type: application/json' -d "{\"password\": \"${e_pw}\"}"
    else
      curl -sS -X POST "${API}/box/rooms" -H 'content-type: application/json' -d '{}'
    fi
    echo
    ;;
  close)
    curl -sS -X DELETE "${API}/box/rooms/${1:?usage: close <code>}" "${AUTH[@]+"${AUTH[@]}"}"
    echo
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
