import prisma from '../src/lib/prisma.js';
import bcryptjs from 'bcryptjs';

async function main() {
  console.log('🌱 Seeding database...');

  // Create users with different roles
  const pmPassword = await bcryptjs.hash('pm123456', 10);
  const pm = await prisma.user.upsert({
    where: { email: 'pm@nodewave.com' },
    update: {},
    create: {
      email: 'pm@nodewave.com',
      password: pmPassword,
      name: 'Project Manager',
      role: 'PRODUCT_MANAGER',
      department: 'PRODUCT_MANAGEMENT',
    },
  });
  console.log(`✅ PM created: ${pm.email}`);

  const uiPassword = await bcryptjs.hash('ui123456', 10);
  const ui = await prisma.user.upsert({
    where: { email: 'ui@nodewave.com' },
    update: {},
    create: {
      email: 'ui@nodewave.com',
      password: uiPassword,
      name: 'UI/UX Designer',
      role: 'UI_UX_DESIGNER',
      department: 'UI_UX',
    },
  });
  console.log(`✅ UI/UX created: ${ui.email}`);

  const fePassword = await bcryptjs.hash('fe123456', 10);
  const fe = await prisma.user.upsert({
    where: { email: 'frontend@nodewave.com' },
    update: {},
    create: {
      email: 'frontend@nodewave.com',
      password: fePassword,
      name: 'Frontend Engineer',
      role: 'FRONTEND_ENGINEER',
      department: 'FRONTEND',
    },
  });
  console.log(`✅ Frontend Engineer created: ${fe.email}`);

  const bePassword = await bcryptjs.hash('be123456', 10);
  const be = await prisma.user.upsert({
    where: { email: 'backend@nodewave.com' },
    update: {},
    create: {
      email: 'backend@nodewave.com',
      password: bePassword,
      name: 'Backend Engineer',
      role: 'BACKEND_ENGINEER',
      department: 'BACKEND',
    },
  });
  console.log(`✅ Backend Engineer created: ${be.email}`);

  const clientPassword = await bcryptjs.hash('client123456', 10);
  const client = await prisma.user.upsert({
    where: { email: 'client@acme.com' },
    update: {},
    create: {
      email: 'client@acme.com',
      password: clientPassword,
      name: 'Client Guest',
      role: 'CLIENT_GUEST',
      department: 'CLIENT',
    },
  });
  console.log(`✅ Client Guest created: ${client.email}`);

  // Create a sample project
  const project = await prisma.project.create({
    data: {
      name: 'E-commerce Platform Redesign',
      description: 'Complete UI/UX and backend overhaul for the existing platform',
      ownerId: pm.id,
    },
  });
  console.log(`✅ Project created: ${project.name}`);

  // Grant client access to project
  const clientAccess = await prisma.clientProjectAccess.create({
    data: {
      clientId: client.id,
      projectId: project.id,
      grantedBy: pm.id,
    },
  });
  console.log(`✅ Client access granted to project`);

  // Create tasks with dependencies
  const uiDesignTask = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'UI Design Mockups',
      description: 'Create high-fidelity mockups for dashboard',
      assigneeId: ui.id,
      department: 'UI_UX',
      isClientVisible: true,
      status: 'DONE',
    },
  });
  console.log(`✅ Task 1 created: ${uiDesignTask.title}`);

  const apiTask = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Backend API Implementation',
      description: 'Create REST API endpoints',
      assigneeId: be.id,
      department: 'BACKEND',
      isClientVisible: false,
      status: 'DONE',
    },
  });
  console.log(`✅ Task 2 created: ${apiTask.title}`);

  const frontendTask = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Frontend Implementation',
      description: 'Implement dashboard based on UI mockups',
      assigneeId: fe.id,
      department: 'FRONTEND',
      isClientVisible: true,
      status: 'TODO',
    },
  });
  console.log(`✅ Task 3 created: ${frontendTask.title}`);

  // Add dependencies
  await prisma.taskDependency.create({
    data: {
      taskId: frontendTask.id,
      dependsOnTaskId: uiDesignTask.id,
    },
  });

  await prisma.taskDependency.create({
    data: {
      taskId: frontendTask.id,
      dependsOnTaskId: apiTask.id,
    },
  });
  console.log(`✅ Dependencies added`);

  console.log('✨ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
