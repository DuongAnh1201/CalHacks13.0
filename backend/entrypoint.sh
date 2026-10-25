#!/bin/sh
# Starts as root only to hand the jobs folder to appuser: a mounted volume
# (RunPod's /workspace) is root-owned, so appuser cannot create JOBS_DIR itself.
set -e
JOBS_DIR="${JOBS_DIR:-/app/jobs}"
if [ "$(id -u)" = 0 ]; then
  mkdir -p "$JOBS_DIR"
  chown -R appuser "$JOBS_DIR"
  exec setpriv --reuid=appuser --regid=appuser --init-groups env HOME=/home/appuser "$@"
fi
exec "$@"
