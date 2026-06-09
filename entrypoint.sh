#!/bin/sh
set -e

# Jalankan migrate di background supaya server bisa mulai mendengarkan lebih cepat
(npx prisma migrate deploy || echo "Prisma migrate failed or no pending migrations") &

# Gantikan proses shell dengan node server
exec node dist/server.js
