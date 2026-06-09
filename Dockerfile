FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./

# Tambahkan entrypoint untuk menjalankan migrasi di background dan start server segera
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

ENV NODE_ENV=production

# Copy dulu dari builder, JANGAN npm ci lagi
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 3000

# Jalankan entrypoint yang menjalankan migrate di background lalu start server
CMD ["sh", "-c", "./entrypoint.sh"]