import { describe, test, expect, beforeEach } from 'bun:test';
import { TaskQueue } from './task-queue';
import type { TaskEvent } from '../types';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  test('should enqueue a task', () => {
    const taskId = queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');
    
    expect(taskId).toBeTruthy();
    expect(taskId).toContain('task_');
  });

  test('should get task status', () => {
    const taskId = queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');
    const status = queue.getStatus(taskId);

    expect(status).not.toBeNull();
    expect(status!.type).toBe('check');
    expect(status!.domain).toBe('example.com');
  });

  test('should return null for non-existent task', () => {
    const status = queue.getStatus('non_existent');
    expect(status).toBeNull();
  });

  test('should get active tasks', () => {
    queue.enqueue({ type: 'check', domainId: 1 }, 'a.com');
    queue.enqueue({ type: 'check', domainId: 2 }, 'b.com');
    queue.enqueue({ type: 'update', domainId: 3 }, 'c.com');

    const active = queue.getActiveTasks();
    expect(active.length).toBe(3);
  });

  test('should cancel queued task', () => {
    // Fill up running slots first
    for (let i = 0; i < 5; i++) {
      queue.enqueue({ type: 'check', domainId: i }, `domain${i}.com`);
    }
    // This one should be queued
    const taskId = queue.enqueue({ type: 'check', domainId: 99 }, 'queued.com');
    
    expect(queue.getQueuedCount()).toBe(1);
    
    const cancelled = queue.cancel(taskId);
    expect(cancelled).toBe(true);
    
    const status = queue.getStatus(taskId);
    expect(status!.status).toBe('cancelled');
  });

  test('should respect max concurrent limit', () => {
    // Enqueue more than max concurrent
    for (let i = 0; i < 10; i++) {
      queue.enqueue({ type: 'check', domainId: i }, `domain${i}.com`);
    }

    expect(queue.getRunningCount()).toBe(5); // MAX_CONCURRENT
    expect(queue.getQueuedCount()).toBe(5);
  });

  test('should emit events to subscribers', () => {
    const events: TaskEvent[] = [];
    queue.subscribe(event => events.push(event));

    queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('started');
  });

  test('should unsubscribe correctly', () => {
    const events: TaskEvent[] = [];
    const unsubscribe = queue.subscribe(event => events.push(event));

    queue.enqueue({ type: 'check', domainId: 1 }, 'a.com');
    const countBefore = events.length;

    unsubscribe();
    queue.enqueue({ type: 'check', domainId: 2 }, 'b.com');

    expect(events.length).toBe(countBefore);
  });

  test('should update task progress', () => {
    const taskId = queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');
    
    queue.updateProgress(taskId, 50, 'Halfway done');
    
    const status = queue.getStatus(taskId);
    expect(status!.progress).toBe(50);
    expect(status!.message).toBe('Halfway done');
  });

  test('should complete task successfully', () => {
    const taskId = queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');
    
    queue.completeTask(taskId, true, 'Done');
    
    const status = queue.getStatus(taskId);
    expect(status!.status).toBe('completed');
    expect(status!.progress).toBe(100);
  });

  test('should mark task as failed', () => {
    const taskId = queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');
    
    queue.completeTask(taskId, false, 'Failed', 'Connection error');
    
    const status = queue.getStatus(taskId);
    expect(status!.status).toBe('failed');
    expect(status!.error).toBe('Connection error');
  });

  test('should process queue after task completion', () => {
    // Fill up running slots
    const taskIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      taskIds.push(queue.enqueue({ type: 'check', domainId: i }, `domain${i}.com`));
    }

    expect(queue.getRunningCount()).toBe(5);
    expect(queue.getQueuedCount()).toBe(1);

    // Complete one task
    queue.completeTask(taskIds[0], true, 'Done');

    // Queue should process and start the waiting task
    expect(queue.getRunningCount()).toBe(5);
    expect(queue.getQueuedCount()).toBe(0);
  });

  test('should clear completed tasks', () => {
    const taskId = queue.enqueue({ type: 'check', domainId: 1 }, 'example.com');
    queue.completeTask(taskId, true, 'Done');

    expect(queue.getStatus(taskId)).not.toBeNull();

    queue.clearCompleted();

    expect(queue.getStatus(taskId)).toBeNull();
  });
});
