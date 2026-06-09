import { serve } from '@hono/node-server';
import app from './index';
import { PrismaClient } from '@prisma/client';

const port = parseInt(process.env.PORT || '3000');
const prisma = new PrismaClient();

async function main() {
  // Start server DULU biar health check Back4App langsung dapat response
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0',
    },
    () => {
      console.log(`🚀 Server running on http://0.0.0.0:${port}`);
    }
  );

  // Baru connect DB
  try {
    console.log('Connecting to database...');
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
}

main();