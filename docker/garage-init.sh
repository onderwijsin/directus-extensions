#!/bin/sh
set -eu

apk add --no-cache wget >/dev/null

case "$(uname -m)" in
  x86_64) GARAGE_ARCH='x86_64-unknown-linux-musl' ;;
  aarch64|arm64) GARAGE_ARCH='aarch64-unknown-linux-musl' ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

wget -q -O /usr/local/bin/garage \
  "https://garagehq.deuxfleurs.fr/_releases/v2.3.0/${GARAGE_ARCH}/garage"
chmod +x /usr/local/bin/garage

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if garage status >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

NODE_ID=$(garage status | awk '/HEALTHY NODES/{getline; getline; print $1; exit}')
test -n "$NODE_ID"

if ! garage layout show | grep -q "$NODE_ID"; then
  garage layout assign -z "$STORAGE_REGION" -c 15G "$NODE_ID"
  garage layout apply --version 1
fi

if ! garage bucket list | grep -q "$STORAGE_BUCKET"; then
  garage bucket create "$STORAGE_BUCKET"
fi

if ! garage key list | grep -q "${STORAGE_BUCKET}-key"; then
  garage key import --yes -n "${STORAGE_BUCKET}-key" "$GARAGE_ACCESS_KEY_ID" "$GARAGE_SECRET_ACCESS_KEY"
fi

garage bucket allow --read --write "$STORAGE_BUCKET" --key "${STORAGE_BUCKET}-key"
