# @freeland/web-next

Next.js v2 frontend with Prisma-backed `/portfolios`.

## Quick start

```bash
cd apps/web-next
npm install
cp ../../.env.example .env.local # then set DATABASE_URL
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

Open http://localhost:3100 and http://localhost:3100/portfolios
