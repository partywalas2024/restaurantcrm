# Deployment files

Server-side configuration kept in the repo so the production setup is
reproducible rather than living only on the box.

## Database backups

`restaurantcrm-backup.timer` runs `scripts/backup-db.mjs` daily, which takes a
proper SQLite online backup (not a file copy, which can capture a torn write),
verifies the result is readable, and keeps the newest 14.

Backups are written to `/var/backups/restaurantcrm` — deliberately outside
`/var/www`, so a bad deploy or `rsync --delete` cannot remove them.

Install (once, on the server):

```bash
sudo cp /var/www/restaurantcrm/deploy/restaurantcrm-backup.{service,timer} /etc/systemd/system/
sudo mkdir -p /var/backups/restaurantcrm && sudo chown ubuntu:ubuntu /var/backups/restaurantcrm
sudo systemctl daemon-reload
sudo systemctl enable --now restaurantcrm-backup.timer
```

Check it:

```bash
systemctl list-timers restaurantcrm-backup --no-pager   # next run
sudo systemctl start restaurantcrm-backup.service       # run one now
journalctl -u restaurantcrm-backup -n 20 --no-pager     # what happened
ls -la /var/backups/restaurantcrm                       # the backups
```

Restore a backup:

```bash
pm2 stop restaurantcrm
cp /var/backups/restaurantcrm/dev-<timestamp>.db /var/www/restaurantcrm/dev.db
pm2 start restaurantcrm
```

### Known limitation

These backups live on the same EBS volume as the database itself. That covers
accidental deletion, a bad migration, or a corrupted write — it does **not**
cover losing the instance or the volume. Real off-site backup needs either an
S3 bucket or a scheduled pull to another machine; both mean provisioning
something new, so neither is set up here.
