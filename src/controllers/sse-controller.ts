import { taskQueue } from '../services/task-queue';
import type { SSEEvent, TaskEvent, TaskStatus } from '../types';

type SSECallback = (event: SSEEvent) => void;

interface ConnectionState {
  callback: SSECallback;
  eventQueue: Array<{ type: string; data: unknown }>;
}

class SSEController {
  private connections: Map<number, ConnectionState> = new Map();
  private connectionIdCounter = 0;
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
   * Add a new SSE connection (simple ID-based)
   */
  addConnection(): number {
    const id = ++this.connectionIdCounter;
    this.connections.set(id, {
      callback: () => {},
      eventQueue: []
    });
    return id;
  }

  /**
   * Remove a connection
   */
  removeConnection(id: number): void {
    this.connections.delete(id);
  }

  /**
   * Get events for a connection and clear the queue
   */
  getEvents(connectionId: number): Array<{ type: string; data: unknown }> {
    const conn = this.connections.get(connectionId);
    if (!conn) return [];
    const events = [...conn.eventQueue];
    conn.eventQueue = [];
    return events;
  }

  /**
   * Register a new SSE connection with callback
   */
  addConnectionWithCallback(callback: SSECallback): () => void {
    const id = this.addConnection();
    const conn = this.connections.get(id)!;
    conn.callback = callback;
    
    // Send current active tasks to new connection
    const activeTasks = taskQueue.getActiveTasks();
    for (const task of activeTasks) {
      callback({
        type: task.status === 'running' ? 'task_started' : 'task_started',
        payload: { task }
      });
    }

    return () => {
      this.removeConnection(id);
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
  broadcast(event: SSEEvent | { type: string; data: unknown }): void {
    for (const [, conn] of this.connections) {
      try {
        // Add to event queue
        conn.eventQueue.push({
          type: 'type' in event ? event.type : event.type,
          data: 'payload' in event ? event.payload : event.data
        });
        // Also call callback if set
        if (conn.callback && 'payload' in event) {
          conn.callback(event as SSEEvent);
        }
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

    const removeConnection = this.addConnectionWithCallback(callback);

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
