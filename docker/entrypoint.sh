#!/bin/sh
set -e
echo "[entrypoint] 应用数据库迁移"
node node_modules/prisma/build/index.js migrate deploy
echo "[entrypoint] 写入词汇表与默认设置（零客户、零课题）"
node prisma/seed.mjs
exec node server.js
