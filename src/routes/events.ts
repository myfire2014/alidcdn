import { Elysia } from 'elysia';
import { sseController } from '../controllers/sse-controller';

export const eventsRoute = new Elysia()
  .get('/events', async function* ({ request }) {
    // Create SSE connection
    const connectionId = sseController.addConnection();
    
    // Send initial connection event
    yield { event: 'connected', data: JSON.stringify({ connectionId }) };

    // Keep connection alive and yield events
    const abortController = new AbortController();
    
    // Handle client disconnect
    request.signal.addEventListener('abort', () => {
      sseController.removeConnection(connectionId);
      abortController.abort();
    });

    // Poll for events (simple implementation)
    while (!abortController.signal.aborted) {
      const events = sseController.getEvents(connectionId);
      for (const event of events) {
        yield { event: event.type, data: JSON.stringify(event.data) };
      }
      
      // Send heartbeat every 30 seconds
      yield { event: 'heartbeat', data: JSON.stringify({ time: Date.now() }) };
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });
