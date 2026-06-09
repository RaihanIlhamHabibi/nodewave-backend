import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import auditRoutes from './routes/audit';

const app = new Hono();

app.use('*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} - ${ms}ms`);
});

app.get('/', (c) => c.json({ status: 'ok', message: 'API is running' }));
app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/auth', authRoutes);
app.route('/projects', projectRoutes);
app.route('/tasks', taskRoutes);
app.route('/audit', auditRoutes);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

export default app;