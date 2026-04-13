/**
 * Server-Sent Events (SSE) broadcaster
 *
 * Admin dashboard connects once → receives live auth events,
 * anomaly alerts, and leave decisions without polling.
 *
 * Node.js single-process keeps all SSE clients in memory.
 * For multi-process/cluster: use Redis pub/sub instead.
 */

/** @type {Map<string, import('express').Response>} */
const clients = new Map();
let clientCounter = 0;

/**
 * Express handler — client connects to /admin/stream
 * Headers set for SSE, connection kept alive.
 */
function sseHandler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering
  res.flushHeaders();

  const clientId = String(++clientCounter);
  clients.set(clientId, res);

  // Send connected confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ client_id: clientId, ts: Date.now() })}\n\n`);

  // Heartbeat every 25s (prevents proxy timeouts)
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

/**
 * Broadcast an event to all connected admin clients.
 * @param {string} event - event name (e.g. "auth_event", "anomaly", "leave_decision")
 * @param {object} data
 */
function broadcast(event, data) {
  if (clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, ts: Date.now() })}\n\n`;
  for (const [id, res] of clients) {
    try {
      res.write(payload);
    } catch (e) {
      clients.delete(id);
    }
  }
}

/**
 * Attach broadcast to global so routes can call it without circular imports.
 * In production, replace with Redis pub/sub:
 *   redisSubscriber.subscribe('sentinelgate:events')
 */
global.sseNotify = broadcast;

module.exports = { sseHandler, broadcast };
