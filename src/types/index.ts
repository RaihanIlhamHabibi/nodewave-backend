export type Role = 'PRODUCT_MANAGER' | 'UI_UX_DESIGNER' | 'FRONTEND_ENGINEER' | 'BACKEND_ENGINEER' | 'CLIENT_GUEST';
export type Department = 'PRODUCT_MANAGEMENT' | 'UI_UX' | 'FRONTEND' | 'BACKEND' | 'CLIENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

export interface AuthPayload {
  userId: string;
  email: string;
  role: Role;
  department?: Department;
}

export interface AuthToken {
  token: string;
  expiresIn: string;
}

export interface TaskWithDependencies {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: Array<{
    id: string;
    status: TaskStatus;
  }>;
  isBlocked?: boolean;
  canTransitionTo?: TaskStatus[];
}

export interface ClientProjectMetrics {
  projectId: string;
  projectName: string;
  completionPercentage: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  visibleTasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
  }>;
}

export interface AuditEntry {
  id: string;
  userId: string;
  projectId?: string;
  taskId?: string;
  action: string;
  entityType: string;
  changedColumn?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: Date;
}
