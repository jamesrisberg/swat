import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8080;

/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();
/** @type {Map<string, object>} last known transform per id */
const lastState = new Map();

function broadcast(obj, exceptId) {
  const raw = JSON.stringify(obj);
  for (const [id, ws] of clients) {
    if (id === exceptId) continue;
    if (ws.readyState === 1) ws.send(raw);
  }
}

function broadcastAll(obj) {
  const raw = JSON.stringify(obj);
  for (const [, ws] of clients) {
    if (ws.readyState === 1) ws.send(raw);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const id = randomUUID();
  clients.set(id, ws);
  lastState.set(id, null);

  const players = {};
  for (const [pid, st] of lastState) {
    if (pid !== id && st) players[pid] = st;
  }

  ws.send(
    JSON.stringify({
      type: "welcome",
      id,
      t: performance.now(),
      players,
    })
  );

  broadcast(
    { type: "joined", id, t: performance.now() },
    id
  );

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.type !== "state" || typeof msg.x !== "number") return;
    lastState.set(id, {
      x: msg.x,
      y: msg.y,
      z: msg.z,
      qx: msg.qx,
      qy: msg.qy,
      qz: msg.qz,
      qw: msg.qw,
    });
  });

  ws.on("close", () => {
    clients.delete(id);
    lastState.delete(id);
    broadcastAll({ type: "left", id, t: performance.now() });
  });
});

setInterval(() => {
  const t = performance.now();
  const players = {};
  for (const [pid, st] of lastState) {
    if (st) players[pid] = st;
  }
  if (Object.keys(players).length === 0) return;
  broadcastAll({ type: "snapshot", t, players });
}, 50);

console.log(`swat multiplayer relay listening on ws://0.0.0.0:${PORT}`);
