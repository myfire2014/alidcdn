// Database Models
export interface Domain {
  id: number;
  domain: string;
  notes: string | null;
  auto_renew: boolean;
  dcdn_enabled: boolean;
  cert_status: 'valid' | 'expiring_soon' | 'expired' | 'unknown' | 'error' | null;
  cert_expiry: string | null;
  cert_issuer: string | null;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateStatus {
  id: number;
  domain_id: number;
  issuer: string | null;
  valid_from: string | null;
  valid_to: string | null;
  days_remaining: number | null;
  last_checked: string;
  status: 'valid' | 'expiring' | 'expired' | 'error';
  error_message: string | null;
}

export interface Credential {
  id: number;
  provider: 'cloudflare' | 'aliyun';
  key_name: string;
  encrypted_value: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  details: string;
  status: 'success' | 'failure';
  created_at: string;
}

export interface SchedulerConfig {
  id: number;
  task_type: string;
  cron_expression: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

// Domain Service Types
export interface CreateDomainInput {
  domain: string;
  notes?: string;
  auto_renew?: boolean;
  dcdn_enabled?: boolean;
}

export interface UpdateDomainInput {
  notes?: string;
  auto_renew?: boolean;
  dcdn_enabled?: boolean;
}

export interface DomainWithStatus extends Domain {
  // Domain already includes cert_status fields
}

// Certificate Types
export interface CertCheckResult {
  domainId: number;
  domain: string;
  status: 'valid' | 'expiring' | 'expired' | 'error';
  issuer?: string;
  validFrom?: Date;
  validTo?: Date;
  daysRemaining?: number;
  error?: string;
}

export interface CertInfo {
  issuer: string;
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;
}

export interface CertStatusInput {
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  status: 'valid' | 'expiring' | 'expired' | 'error';
  errorMessage?: string;
}

// Task Queue Types
export interface Task {
  type: 'check' | 'update' | 'sync';
  domainId: number;
  priority?: number;
}

export interface TaskStatus {
  id: string;
  type: string;
  domainId: number;
  domain: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  task: TaskStatus;
}

export type TaskEventCallback = (event: TaskEvent) => void;

// SSE Types
export interface SSEMessage {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SSEEvent {
  type: 'task_started' | 'task_progress' | 'task_completed' | 'task_failed' | 'domain_updated';
  payload: Record<string, unknown>;
}

// Audit Logger Types
export interface LogEntry {
  action: string;
  targetType: string;
  targetId?: number;
  details: Record<string, unknown>;
  status: 'success' | 'failure';
}

export interface LogFilter {
  action?: string;
  targetType?: string;
  targetId?: number;
  status?: 'success' | 'failure';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLogs {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

// Scheduler Types
export interface ScheduleConfig {
  cronExpression: string;
  enabled: boolean;
}

export interface SchedulerStatus {
  running: boolean;
  tasks: Array<{
    type: string;
    enabled: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
  }>;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
    suggestion?: string;
  };
}

// Health Check Types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  memory: {
    used: number;
    total: number;
  };
  database: boolean;
  sseConnections: number;
  activeTasks: number;
  queuedTasks: number;
}

// Dashboard Types
export interface DashboardStats {
  totalDomains: number;
  expiringDomains: number;
  expiredDomains: number;
  validDomains: number;
  errorDomains: number;
  recentLogs: AuditLog[];
}
