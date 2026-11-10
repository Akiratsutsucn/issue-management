#!/bin/sh
# 定时备份：数据库（pg_dump 自定义格式）+ 附件 volume，保存在本机，保留 KEEP_DAYS 天。
# 用法：APP_DIR=~/apps/issue-desk BACKUP_DIR=~/backups/issue-desk KEEP_DAYS=14 sh docker/backup.sh
set -eu

APP_DIR="${APP_DIR:-$HOME/apps/issue-desk}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/issue-desk}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PROJECT="${COMPOSE_PROJECT:-issue-desk}"
TS=$(date +%Y%m%d-%H%M%S)

umask 077
mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

log() { echo "$(date '+%F %T') $*"; }
cleanup() { rm -f "$BACKUP_DIR"/.*.part; }
trap cleanup EXIT

# 1. 数据库：先写临时文件，校验能读出目录后再改名
db_tmp="$BACKUP_DIR/.db-$TS.dump.part"
docker compose -p "$PROJECT" exec -T db pg_dump -U issue_desk -Fc issue_desk > "$db_tmp"
docker compose -p "$PROJECT" exec -T db pg_restore --list < "$db_tmp" > /dev/null
mv "$db_tmp" "$BACKUP_DIR/db-$TS.dump"

# 2. 附件：只读挂载 volume，打包输出到标准输出，文件归当前用户所有
st_tmp="$BACKUP_DIR/.storage-$TS.tgz.part"
docker run --rm -v "${PROJECT}_storage:/data:ro" postgres:16-alpine tar -czf - -C /data . > "$st_tmp"
gzip -t "$st_tmp"
mv "$st_tmp" "$BACKUP_DIR/storage-$TS.tgz"

# 3. 清理超过保留期的备份（只动本脚本生成的文件名）
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

log "ok db=$(du -h "$BACKUP_DIR/db-$TS.dump" | cut -f1) storage=$(du -h "$BACKUP_DIR/storage-$TS.tgz" | cut -f1) keep=${KEEP_DAYS}d"
