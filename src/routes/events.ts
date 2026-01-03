import { Elysia } from 'elysia';
import { sseController } from '../controllers/sse-controller';

export const eventsRoute = new Elysia()
  .get('/events', ({ request }) => {
    const connectionId = sseController.addConnection();

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial connection event
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ connectionId })}\n\n`));

        // Poll for events
        const interval = setInterval(() => {
          try {
            const events = sseController.getEvents(connectionId);
            for (const event of events) {
              controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
            }
          } catch {
            // Connection closed
            clearInterval(interval);
          }
        }, 500);

        // Heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`));
          } catch {
            clearInterval(heartbeat);
          }
        }, 30000);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(interval);
          clearInterval(heartbeat);
          sseController.removeConnection(connectionId);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  });
