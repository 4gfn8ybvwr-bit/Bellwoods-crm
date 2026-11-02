#!/bin/sh
set -eu
npx prisma db push
npx tsx prisma/seed.ts
exec npm start
