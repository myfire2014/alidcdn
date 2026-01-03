import { taskQueue } from '../services/task-queue';
import type { SSEEvent, TaskEvent, TaskStatus } from '../types';

type SSECallback = (event: SSEEvent) => void;

class SSEController {
  private connections: Set<SSECallback> = new Set();
  private unsubscribeTaskQueue: (() => void) | null = null;

  constructor() {
    this.setupTaskQueueListener();
  }

  /**
   * Setup listener for task queue events
   */
  private setupTaskQueueListener(): void {
    this.unsubscribeTaskQueue = taskQueue.subscribe((event: TaskEvent) => {
      this.broadcastTaskEvent(event);
    });
  }

  /**
   * Register a new SSE connection
   */
  addConnection(callback: SSECallback): () => void {
    this.connections.add(callback);
    
    // Send current active tasks to new connection
    const activeTasks = taskQueue.getActiveTasks();
    for (const task of activeTasks) {
      callback({
        type: task.status === 'running' ? 'task_started' : 'task_started',
        payload: { task }
      });
    }

    return () => {
      this.connections.delete(callback);
    };
  }

  /**
   * Get current connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Broadcast an event to all connections
   */
  broadcast(event: SSEEvent): void {
    for (const callback of this.connections) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error broadcasting SSE event:', error);
      }
    }
  }

  /**
   * Broadcast task event
   */
  private broadcastTaskEvent(event: TaskEvent): void {
    const sseEvent: SSEEvent = {
      type: this.mapTaskEventType(event.type),
      payload: { task: event.task }
    };
    this.broadcast(sseEvent);
  }

  /**
   * Map task event type to SSE event type
   */
  private mapTaskEventType(type: TaskEvent['type']): SSEEvent['type'] {
    switch (type) {
      case 'started':
        return 'task_started';
      case 'progress':
        return 'task_progress';
      case 'completed':
        return 'task_completed';
      case 'failed':
      case 'cancelled':
        return 'task_failed';
      default:
        return 'task_progress';
    }
  }

  /**
   * Broadcast domain update event
   */
  broadcastDomainUpdate(domainId: number, domain: string, data: Record<string, unknown>): void {
    this.broadcast({
      type: 'domain_updated',
      payload: { domainId, domain, ...data }
    });
  }

  /**
   * Create SSE generator for Elysia
   */
  async *createEventStream(): AsyncGenerator<{ event: string; data: string }> {
    const eventQueue: SSEEvent[] = [];
    let resolve: (() => void) | null = null;

    const callback = (event: SSEEvent) => {
      eventQueue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    const removeConnection = this.addConnection(callback);

    try {
      // Send initial connection event
      yield {
        event: 'connected',
        data: JSON.stringify({ 
          connectionCount: this.getConnectionCount(),
          activeTasks: taskQueue.getActiveTasks().length
        })
      };

      while (true) {
        // Wait for events if queue is empty
        if (eventQueue.length === 0) {
          await new Promise<void>(r => { resolve = r; });
        }

        // Process all queued events
        while (eventQueue.length > 0) {
          const event = eventQueue.shift()!;
          yield {
            event: event.type,
            data: JSON.stringify(event.payload)
          };
        }
      }
    } finally {
      removeConnection();
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribeTaskQueue) {
      this.unsubscribeTaskQueue();
    }
    this.connections.clear();
  }
}

// Singleton instance
export const sseController = new SSEController();
