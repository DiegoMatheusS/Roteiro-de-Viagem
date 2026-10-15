#!/bin/sh
set -eu

# Railway mounts a new volume owned by root, hiding the image's directory owner.
# Initialize only the data directory, then run the application without root.
if [ "$(id -u)" = 0 ]; then
  install -d -m 700 -o node -g node /app/data
  exec gosu node "$@"
fi
exec "$@"
