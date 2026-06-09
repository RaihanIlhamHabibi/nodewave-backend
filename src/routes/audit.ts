import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole, AuthContext } from '../middleware/auth';

const router = new Hono<{ Bindings: { user?: any } }>();

// Get audit logs for project
router.get('/project/:projectId', authMiddleware, requireRole('PRODUCT_MANAGER'), async (c: AuthContext) => {
  try {
    const projectId = c.req.param('projectId');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const logs = await prisma.auditLog.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.auditLog.count({
      where: { projectId },
    });

    return c.json({
      data: logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return c.json({ error: 'Failed to fetch audit logs' }, 500);
  }
});

// Generate daily standup summary
router.get('/standup/:projectId', authMiddleware, requireRole('PRODUCT_MANAGER'), async (c: AuthContext) => {
  try {
    const projectId = c.req.param('projectId');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get yesterday's logs
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const logs = await prisma.auditLog.findMany({
      where: {
        projectId,
        createdAt: {
          gte: yesterday,
          lt: today,
        },
      },
      include: {
        user: { select: { id: true, name: true, department: true } },
        task: { select: { id: true, title: true } },
      },
    });

    // Build summary by department
    const summary: Record<string, any> = {
      date: yesterday.toISOString().split('T')[0],
      completed: [],
      inProgress: [],
      blocked: [],
      byDepartment: {},
    };

    logs.forEach((log: any) => {
      const dept = log.user?.department || 'UNKNOWN';
      if (!summary.byDepartment[dept]) {
        summary.byDepartment[dept] = {
          department: dept,
          completed: [],
          inProgress: [],
          blocked: [],
        };
      }

      if (log.action === 'STATUS_CHANGE' && log.newValue === 'DONE') {
        summary.completed.push({
          taskId: log.taskId,
          taskTitle: log.task?.title,
          department: dept,
          completedAt: log.createdAt,
          completedBy: log.user?.name,
        });

        summary.byDepartment[dept].completed.push(log.task?.title);
      }

      if (log.action === 'STATUS_CHANGE' && log.newValue === 'IN_PROGRESS') {
        summary.byDepartment[dept].inProgress.push(log.task?.title);
      }

      if (log.action === 'STATUS_CHANGE' && log.newValue === 'BLOCKED') {
        summary.byDepartment[dept].blocked.push(log.task?.title);
      }
    });

    return c.json(summary);
  } catch (error) {
    console.error('Generate standup error:', error);
    return c.json({ error: 'Failed to generate standup summary' }, 500);
  }
});

// Get audit logs for task
router.get('/task/:taskId', authMiddleware, async (c: AuthContext) => {
  try {
    const taskId = c.req.param('taskId');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // Check access
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
    });

    if (!project || (project.ownerId !== c.user!.userId && c.user!.role !== 'CLIENT_GUEST')) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const logs = await prisma.auditLog.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return c.json(logs);
  } catch (error) {
    console.error('Get task audit logs error:', error);
    return c.json({ error: 'Failed to fetch audit logs' }, 500);
  }
});

export default router;
