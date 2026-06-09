FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install full deps for build
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

# Copy source & prisma files
COPY . .

# Build TypeScript and generate Prisma client
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
RUN npm ci --only=production

# Copy built app and prisma artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/server.js"]
