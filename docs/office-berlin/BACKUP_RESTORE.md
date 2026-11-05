# Office Berlin – backup and restore

What is saved: `office.sqlite` (tickets, notes, comments, questions) and `uploads/` (pictures) in the dashboard's
StateDirectory, `/var/lib/private/dyai/ana-dashboard` (systemd DynamicUser).

## Install (once, as root)

    install -m 0755 deploy/ana-dashboard/office-backup.sh /srv/dyai/runtime/ana-dashboard/office-backup.sh
    install -m 0644 deploy/ana-dashboard/dyai-ana-office-backup.{service,timer} /etc/systemd/system/
    systemctl daemon-reload && systemctl enable --now dyai-ana-office-backup.timer
    systemctl start dyai-ana-office-backup.service && ls -l /var/backups/ana-office/

Nightly at 03:25, 30 days kept in `/var/backups/ana-office/`. The database is copied with SQLite's `VACUUM INTO`, so a
backup taken while the dashboard runs is consistent. Off-host copies are not part of this (operator decision).

## Restore

    systemctl stop dyai-ana-dashboard
    /srv/dyai/runtime/ana-dashboard/office-backup.sh restore /var/backups/ana-office/ana-office-<date>.tar.gz
    systemctl start dyai-ana-dashboard

The current data is moved aside to `office-before-restore-<time>/` first, never overwritten.

## Restore drill (2026-11-05, vmi3693936, branch feat/office-berlin)

Test state directory under /tmp, dev server in loopback mode:

1. Ben creates "Drill ticket", Ana's question as an entry, one picture uploaded (201).
   Before: `Drill ticket | entries 1 | pictures 1`.
2. Backup taken while the server was running: `ana-office-2026-11-05-0124.tar.gz`.
3. Server stopped, state directory wiped (0 files).
4. Restore from the archive, server started again.
   After: `Drill ticket | entries 1 | pictures 1`, picture served `200 image/webp`, open questions `[1]`.

Not yet done: the drill against the production StateDirectory (only after the first release).
