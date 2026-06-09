import { Hono } from 'hono';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole, AuthContext } from '../middleware/auth';

const router = new Hono<{ Bindings: { user?: any } }>();

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// Create project (PM only)
router.post('/', authMiddleware, requireRole('PRODUCT_MANAGER'), async (c: AuthContext) => {
  try {
    const body = await c.req.json();
    const data = CreateProjectSchema.parse(body);

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        ownerId: c.user!.userId,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: c.user!.userId,
        projectId: project.id,
        action: 'CREATE',
        entityType: 'PROJECT',
        newValue: JSON.stringify(project),
      },
    });

    return c.json(project, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    console.error('Create project error:', error);
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

// Get projects
router.get('/', authMiddleware, async (c: AuthContext) => {
  try {
    let projects;

    if (c.user!.role === 'PRODUCT_MANAGER') {
      // PM: get their owned projects
      projects = await prisma.project.findMany({
        where: { ownerId: c.user!.userId },
        include: { tasks: true },
      });
    } else if (c.user!.role === 'CLIENT_GUEST') {
      // Client: get projects they have access to
      const access = await prisma.clientProjectAccess.findMany({
        where: { clientId: c.user!.userId },
        include: { project: { include: { tasks: true } } },
      });
      projects = access.map((a: any) => a.project);
    } else {
      // Internal team: get all active projects (simplified)
      projects = await prisma.project.findMany({
        include: { tasks: true },
        where: { status: 'ACTIVE' },
      });
    }

    return c.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    return c.json({ error: 'Failed to fetch projects' }, 500);
  }
});

// Get project details
router.get('/:id', authMiddleware, async (c: AuthContext) => {
  try {
    const projectId = c.req.param('id');
    if (!projectId) {
      return c.json({ error: 'Project ID is required' }, 400);
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true, role: true },
            },
            dependencies: {
              include: { dependsOnTask: true },
            },
          },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Check access
    if (c.user!.role === 'PRODUCT_MANAGER' && project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (c.user!.role === 'CLIENT_GUEST') {
      const access = await prisma.clientProjectAccess.findUnique({
        where: {
          clientId_projectId: {
            clientId: c.user!.userId,
            projectId,
          },
        },
      });

      if (!access) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      // Mask internal data for client
      project.tasks = project.tasks.filter((t: any) => t.isClientVisible);
      project.tasks = project.tasks.map((t: any) => ({
        ...t,
        assignee: null,
        dependencies: [],
      }));
    }

    return c.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    return c.json({ error: 'Failed to fetch project' }, 500);
  }
});

// Update project
router.put('/:id', authMiddleware, requireRole('PRODUCT_MANAGER'), async (c: AuthContext) => {
  try {
    const projectId = c.req.param('id');
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.ownerId !== c.user!.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const body = await c.req.json();
    const data = CreateProjectSchema.parse(body);

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        description: data.description,
        version: { increment: 1 },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: c.user!.userId,
        projectId,
        action: 'UPDATE',
        entityType: 'PROJECT',
      },
    });

    return c.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    console.error('Update project error:', error);
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

export default router;
