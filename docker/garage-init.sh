#!/bin/sh
set -eu

log() {
  printf '[garage-init] %s\n' "$*"
}

READY=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  log "Waiting for Garage RPC (attempt ${attempt}/10)"
  if garage status >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 2
done

if [ "$READY" = "false" ]; then
  echo 'Garage RPC was not ready after 10 attempts' >&2
  exit 1
fi
log 'Garage RPC is ready'

NODE_ID=$(garage status | awk '/HEALTHY NODES/{getline; getline; print $1; exit}')
if [ -z "$NODE_ID" ]; then
  echo 'Could not determine the Garage node ID' >&2
  exit 1
fi

if ! garage layout show | grep -q "$NODE_ID"; then
  log 'Assigning Garage layout'
  garage layout assign -z "$STORAGE_REGION" -c 15G "$NODE_ID"
  CURRENT_VERSION=$(garage layout show | awk -F: '/Current cluster layout version:/ {gsub(/[[:space:]]/, "", $2); print $2; exit}')
  CURRENT_VERSION=${CURRENT_VERSION:-0}
  garage layout apply --version $((CURRENT_VERSION + 1))
fi

if ! garage bucket list | grep -q "$STORAGE_BUCKET"; then
  log "Creating bucket ${STORAGE_BUCKET}"
  garage bucket create "$STORAGE_BUCKET"
fi

KEY_NAME="${STORAGE_BUCKET}-key"
if ! garage key list | grep -q "$KEY_NAME"; then
  log "Importing key ${KEY_NAME}"
  garage key import --yes -n "$KEY_NAME" "$GARAGE_ACCESS_KEY_ID" "$GARAGE_SECRET_ACCESS_KEY"
fi

KEY_ID=$(garage key list | awk -v key_name="$KEY_NAME" '$0 ~ key_name {print $1; exit}')
if [ -z "$KEY_ID" ]; then
  echo "Could not determine the Garage key ID for $KEY_NAME" >&2
  exit 1
fi

if ! garage bucket info "$STORAGE_BUCKET" | grep -q "$KEY_ID"; then
  log "Granting access to ${KEY_NAME}"
  garage bucket allow --read --write "$STORAGE_BUCKET" --key "$KEY_NAME"
fi

log 'Garage initialization completed'
