import { Context } from 'hono';
import { extractToken, verifyToken } from '../utils/jwt';
import { AuthPayload, Role, Department, TaskStatus } from '../types/index';
import prisma from '../lib/prisma';

declare global {
  namespace HonoRequest {
    interface HonoRequest {
      user?: AuthPayload;
    }
  }
}

// Extend context with user
export interface AuthContext extends Context {
  user?: AuthPayload;
}

// Authentication middleware
export const authMiddleware = async (c: AuthContext, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  const token = extractToken(authHeader);

  if (!token) {
    return c.json({ error: 'Unauthorized: Missing token' }, 401);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ error: 'Unauthorized: Invalid token' }, 401);
  }

  c.user = payload;
  await next();
};

// Role-based access control
export const requireRole = (...roles: Role[]) => {
  return async (c: AuthContext, next: () => Promise<void>) => {
    if (!c.user || !roles.includes(c.user.role)) {
      return c.json({ error: 'Forbidden: Insufficient role' }, 403);
    }
    await next();
  };
};

// Project access verification
export const requireProjectAccess = async (c: AuthContext, next: () => Promise<void>) => {
  const projectId = c.req.param('projectId') || c.req.path.split('/')[2];
  
  if (!c.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // PM: can access their projects
  if (c.user.role === 'PRODUCT_MANAGER' && project.ownerId === c.user.userId) {
    await next();
    return;
  }

  // Internal team: check if assigned to project
  if (['UI_UX_DESIGNER', 'FRONTEND_ENGINEER', 'BACKEND_ENGINEER'].includes(c.user.role)) {
    // In real implementation, check task assignments
    await next();
    return;
  }

  // Client guest: check explicit access
  if (c.user.role === 'CLIENT_GUEST') {
    const access = await prisma.clientProjectAccess.findUnique({
      where: {
        clientId_projectId: {
          clientId: c.user.userId,
          projectId,
        },
      },
    });

    if (!access) {
      return c.json({ error: 'Forbidden: No project access' }, 403);
    }
  }

  await next();
};

// State-based permission check for task transitions
export const canTransitionTaskStatus = async (
  userId: string,
  taskId: string,
  toStatus: TaskStatus
): Promise<{ allowed: boolean; reason?: string }> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: true,
      dependencies: {
        include: {
          dependsOnTask: true,
        },
      },
    },
  });

  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }

  // Only assignee can mark as DONE
  if (toStatus === 'DONE' && task.assigneeId !== userId) {
    return { allowed: false, reason: 'Only assignee can mark task as done' };
  }

  // Check dependencies when moving to IN_PROGRESS
  if (toStatus === 'IN_PROGRESS') {
    const blockedDeps = task.dependencies.filter((dep: any) => dep.dependsOnTask.status !== 'DONE');
    if (blockedDeps.length > 0) {
      return { allowed: false, reason: 'Cannot start: dependencies not completed' };
    }
  }

  return { allowed: true };
};

// Check if task is blocked by dependencies
export const isTaskBlocked = async (taskId: string): Promise<boolean> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      dependencies: {
        include: {
          dependsOnTask: true,
        },
      },
    },
  });

  if (!task) return false;

  return task.dependencies.some((dep: any) => dep.dependsOnTask.status !== 'DONE');
};
