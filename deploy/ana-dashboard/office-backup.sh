#!/bin/sh
# Office Berlin backup and restore (tickets, history, pictures).
#
#   office-backup.sh backup            one consistent snapshot into $DEST, keeps $KEEP_DAYS days
#   office-backup.sh restore <archive> puts a snapshot back (stop the dashboard first, see BACKUP_RESTORE.md)
#
# The database is copied with SQLite's own VACUUM INTO through node:sqlite, so a running dashboard never yields a
# half-written copy (a plain tar of a WAL database can). Pictures are plain files and are copied as they are.
# SRC and DEST can be overridden for a restore drill on a test directory.
set -eu
SRC="${SRC:-/var/lib/private/dyai/ana-dashboard}"
DEST="${DEST:-/var/backups/ana-office}"
KEEP_DAYS="${KEEP_DAYS:-30}"
NODE="${NODE:-/usr/bin/node}"

backup() {
  [ -f "$SRC/office.sqlite" ] || { echo "no Office Berlin database in $SRC yet: nothing to back up"; exit 0; }
  install -d -m 0700 "$DEST"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  install -d -m 0700 "$tmp/office"
  "$NODE" -e '
    const { DatabaseSync } = require("node:sqlite");
    const [src, out] = process.argv.slice(1);
    const db = new DatabaseSync(src, { readOnly: true });
    db.exec("VACUUM INTO " + JSON.stringify(out).replace(/^"|"$/g, "\x27"));
    db.close();
  ' "$SRC/office.sqlite" "$tmp/office/office.sqlite"
  if [ -d "$SRC/uploads" ]; then cp -a "$SRC/uploads" "$tmp/office/uploads"; fi
  name="ana-office-$(date +%F-%H%M).tar.gz"
  tar -C "$tmp" -czf "$DEST/$name" office
  chmod 0600 "$DEST/$name"
  find "$DEST" -name "ana-office-*.tar.gz" -mtime +"$KEEP_DAYS" -delete
  echo "backup written: $DEST/$name"
}

restore() {
  archive="${1:?usage: office-backup.sh restore <archive>}"
  [ -f "$archive" ] || { echo "no such archive: $archive"; exit 1; }
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  tar -C "$tmp" -xzf "$archive"
  [ -f "$tmp/office/office.sqlite" ] || { echo "archive holds no office.sqlite"; exit 1; }
  install -d -m 0700 "$SRC"
  # keep what is there now, in case the restore was the wrong one
  if [ -f "$SRC/office.sqlite" ]; then
    keep="$SRC/office-before-restore-$(date +%F-%H%M%S)"
    install -d -m 0700 "$keep"
    mv "$SRC/office.sqlite" "$keep/"
    for f in "$SRC/office.sqlite-wal" "$SRC/office.sqlite-shm"; do [ -f "$f" ] && mv "$f" "$keep/"; done
    [ -d "$SRC/uploads" ] && mv "$SRC/uploads" "$keep/"
    echo "previous data kept in $keep"
  fi
  cp "$tmp/office/office.sqlite" "$SRC/office.sqlite"
  if [ -d "$tmp/office/uploads" ]; then cp -a "$tmp/office/uploads" "$SRC/uploads"; fi
  echo "restored from $archive into $SRC"
}

case "${1:-}" in
  backup) backup ;;
  restore) shift; restore "$@" ;;
  *) echo "usage: office-backup.sh backup | restore <archive>"; exit 2 ;;
esac
