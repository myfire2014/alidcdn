import type { Task, TaskStatus, TaskEvent, TaskEventCallback } from '../types';

const MAX_CONCURRENT = 5;

export class TaskQueue {
  private queue: TaskStatus[] = [];
  private running: Map<string, TaskStatus> = new Map();
  private completed: Map<string, TaskStatus> = new Map();
  private subscribers: Set<TaskEventCallback> = new Set();
  private taskIdCounter = 0;
  private taskExecutor: ((task: TaskStatus) => Promise<void>) | null = null;

  /**
   * Set the task executor function
   */
  setExecutor(executor: (task: TaskStatus) => Promise<void>): void {
    this.taskExecutor = executor;
  }

  /**
   * Add a task to the queue
   */
  enqueue(task: Task, domain: string): string {
    const id = `task_${++this.taskIdCounter}_${Date.now()}`;
    const taskStatus: TaskStatus = {
      id,
      type: task.type,
      domainId: task.domainId,
      domain,
      status: 'queued',
      progress: 0,
      message: 'Waiting in queue...'
    };

    this.queue.push(taskStatus);
    this.emit({ type: 'started', task: { ...taskStatus } });
    this.processQueue();

    return id;
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string): boolean {
    // Check if in queue
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.status = 'cancelled';
      task.message = 'Task cancelled';
      this.completed.set(taskId, task);
      this.emit({ type: 'cancelled', task: { ...task } });
      return true;
    }

    // Check if running - mark for cancellation
    const runningTask = this.running.get(taskId);
    if (runningTask) {
      runningTask.status = 'cancelled';
      runningTask.message = 'Task cancelled';
      this.running.delete(taskId);
      this.completed.set(taskId, runningTask);
      this.emit({ type: 'cancelled', task: { ...runningTask } });
      return true;
    }

    return false;
  }

  /**
   * Get task status by ID
   */
  getStatus(taskId: string): TaskStatus | null {
    // Check running tasks
    const running = this.running.get(taskId);
    if (running) return { ...running };

    // Check queue
    const queued = this.queue.find(t => t.id === taskId);
    if (queued) return { ...queued };

    // Check completed
    const completed = this.completed.get(taskId);
    if (completed) return { ...completed };

    return null;
  }

  /**
   * Get all active tasks (running + queued)
   */
  getActiveTasks(): TaskStatus[] {
    return [
      ...Array.from(this.running.values()).map(t => ({ ...t })),
      ...this.queue.map(t => ({ ...t }))
    ];
  }

  /**
   * Get running tasks count
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * Get queued tasks count
   */
  getQueuedCount(): number {
    return this.queue.length;
  }

  /**
   * Subscribe to task events
   */
  subscribe(callback: TaskEventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Update task progress
   */
  updateProgress(taskId: string, progress: number, message: string): void {
    const task = this.running.get(taskId);
    if (task) {
      task.progress = progress;
      task.message = message;
      this.emit({ type: 'progress', task: { ...task } });
    }
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, success: boolean, message: string, error?: string): void {
    const task = this.running.get(taskId);
    if (task) {
      task.status = success ? 'completed' : 'failed';
      task.progress = success ? 100 : task.progress;
      task.message = message;
      task.error = error;
      task.completedAt = new Date();
      
      this.running.delete(taskId);
      this.completed.set(taskId, task);
      
      this.emit({ type: success ? 'completed' : 'failed', task: { ...task } });
      this.processQueue();
    }
  }

  /**
   * Process the queue - start tasks if capacity available
   */
  private async processQueue(): Promise<void> {
    while (this.running.size < MAX_CONCURRENT && this.queue.length > 0) {
      const task = this.queue.shift()!;
      task.status = 'running';
      task.startedAt = new Date();
      task.message = 'Starting...';
      
      this.running.set(task.id, task);
      this.emit({ type: 'started', task: { ...task } });

      // Execute task if executor is set
      if (this.taskExecutor) {
        this.taskExecutor(task).catch(error => {
          this.completeTask(task.id, false, 'Task failed', error.message);
        });
      }
    }
  }

  /**
   * Emit event to all subscribers
   */
  private emit(event: TaskEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in task event subscriber:', error);
      }
    }
  }

  /**
   * Clear completed tasks (for memory management)
   */
  clearCompleted(): void {
    this.completed.clear();
  }

  /**
   * Get max concurrent limit
   */
  getMaxConcurrent(): number {
    return MAX_CONCURRENT;
  }
}

// Singleton instance
export const taskQueue = new TaskQueue();
