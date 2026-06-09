import { Hono } from 'hono';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authMiddleware, AuthContext, canTransitionTaskStatus, isTaskBlocked } from '../middleware/auth';
import { TaskStatus } from '../types/index';

const router = new Hono<{ Bindings: { user?: any } }>();

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string(),
  assigneeId: z.string().optional(),
  department: z.enum(['PRODUCT_MANAGEMENT', 'UI_UX', 'FRONTEND', 'BACKEND', 'CLIENT']).optional(),
  isClientVisible: z.boolean().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  isClientVisible: z.boolean().optional(),
  version: z.number(),
});

const UpdateTaskStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']),
  version: z.number(),
});

// Create task
router.post('/', authMiddleware, async (c: AuthContext) => {
  try {
    const body = await c.req.json();
    const data = CreateTaskSchema.parse(body);

    // Verify project ownership (PM only)
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project || project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden: Not project owner' }, 403);
    }

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        projectId: data.projectId,
        assigneeId: data.assigneeId,
        department: data.department,
        isClientVisible: data.isClientVisible || false,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        dependencies: { include: { dependsOnTask: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: c.user!.userId,
        projectId: data.projectId,
        taskId: task.id,
        action: 'CREATE',
        entityType: 'TASK',
        newValue: JSON.stringify(task),
      },
    });

    return c.json(task, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    console.error('Create task error:', error);
    return c.json({ error: 'Failed to create task' }, 500);
  }
});

// Get tasks for project
router.get('/project/:projectId', authMiddleware, async (c: AuthContext) => {
  try {
    const projectId = c.req.param('projectId');
    
    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: { select: { id: true, name: true, email: true, role: true } },
        dependencies: { include: { dependsOnTask: true } },
      },
    });

    // Filter for client guests
    if (c.user!.role === 'CLIENT_GUEST') {
      return c.json(
        tasks.filter((t: any) => t.isClientVisible).map((t: any) => ({
          ...t,
          assignee: null,
          dependencies: [],
        }))
      );
    }

    return c.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    return c.json({ error: 'Failed to fetch tasks' }, 500);
  }
});

// Update task status with state-based permissions and concurrency check
router.patch('/:id/status', authMiddleware, async (c: AuthContext) => {
  try {
    const taskId = c.req.param('id');
    if (!taskId) {
      return c.json({ error: 'Task ID is required' }, 400);
    }
    const body = await c.req.json();
    const data = UpdateTaskStatusSchema.parse(body);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
        dependencies: { include: { dependsOnTask: true } },
        project: true,
      },
    });

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // Optimistic locking check
    if (task.version !== data.version) {
      return c.json({
        error: 'Conflict: Task has been modified',
        currentVersion: task.version,
      }, 409);
    }

    // Verify user is assignee or PM
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
    });

    const isOwner = project?.ownerId === c.user!.userId;
    const isAssignee = task.assigneeId === c.user!.userId;

    if (!isOwner && !isAssignee) {
      return c.json({ error: 'Forbidden: Not authorized' }, 403);
    }

    // PM cannot mark task as DONE (only assignee can)
    if (data.status === 'DONE' && !isAssignee) {
      return c.json({ error: 'Forbidden: Only assignee can mark task as done' }, 403);
    }

    // Check state-based permissions
    const permission = await canTransitionTaskStatus(c.user!.userId, taskId, data.status);
    if (!permission.allowed) {
      return c.json({ error: permission.reason }, 403);
    }

    // Update task
    const oldStatus = task.status;
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: data.status,
        version: { increment: 1 },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        dependencies: { include: { dependsOnTask: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: c.user!.userId,
        projectId: task.projectId,
        taskId,
        action: 'STATUS_CHANGE',
        entityType: 'TASK',
        changedColumn: 'status',
        oldValue: oldStatus,
        newValue: data.status,
      },
    });

    return c.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    console.error('Update task status error:', error);
    return c.json({ error: 'Failed to update task' }, 500);
  }
});

// Update task (PM only)
router.put('/:id', authMiddleware, async (c: AuthContext) => {
  try {
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const data = UpdateTaskSchema.parse(body);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
    });

    if (!project || project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Optimistic locking
    if (task.version !== data.version) {
      return c.json({
        error: 'Conflict: Task has been modified',
        currentVersion: task.version,
      }, 409);
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: data.title || task.title,
        description: data.description !== undefined ? data.description : task.description,
        assigneeId: data.assigneeId || task.assigneeId,
        isClientVisible: data.isClientVisible !== undefined ? data.isClientVisible : task.isClientVisible,
        version: { increment: 1 },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        dependencies: { include: { dependsOnTask: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: c.user!.userId,
        projectId: task.projectId,
        taskId,
        action: 'UPDATE',
        entityType: 'TASK',
      },
    });

    return c.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    console.error('Update task error:', error);
    return c.json({ error: 'Failed to update task' }, 500);
  }
});

// Add dependency
router.post('/:id/dependencies', authMiddleware, async (c: AuthContext) => {
  try {
    const taskId = c.req.param('id');
    if (!taskId) {
      return c.json({ error: 'Task ID is required' }, 400);
    }
    const body = await c.req.json();
    const { dependsOnTaskId } = body;

    if (!dependsOnTaskId) {
      return c.json({ error: 'dependsOnTaskId is required' }, 400);
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    if (task.project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const dependency = await prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId,
      },
      include: { dependsOnTask: true },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: c.user!.userId,
        projectId: task.projectId,
        taskId,
        action: 'CREATE',
        entityType: 'TASK',
        newValue: `Added dependency on task ${dependsOnTaskId}`,
      },
    });

    return c.json(dependency, 201);
  } catch (error) {
    console.error('Add dependency error:', error);
    return c.json({ error: 'Failed to add dependency' }, 500);
  }
});

// Check if task is blocked
router.get('/:id/blocked', authMiddleware, async (c: AuthContext) => {
  try {
    const taskId = c.req.param('id');
    if (!taskId) {
      return c.json({ error: 'Task ID is required' }, 400);
    }
    const blocked = await isTaskBlocked(taskId);
    return c.json({ blocked });
  } catch (error) {
    console.error('Check blocked error:', error);
    return c.json({ error: 'Failed to check task status' }, 500);
  }
});

export default router;
