import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8080;

/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();
/** @type {Map<string, object | null>} */
const lastState = new Map();
/** @type {Map<string, string>} client id -> room id */
const clientRoom = new Map();
/** @type {Map<string, Set<string>>} room id -> set of client ids */
const rooms = new Map();

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId);
}

function sanitizeRoom(raw) {
  if (typeof raw !== "string") return "default";
  const s = raw.slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, "");
  return s.length > 0 ? s : "default";
}

function leaveRoom(clientId) {
  const rid = clientRoom.get(clientId);
  if (!rid) return;
  const set = rooms.get(rid);
  if (set) {
    set.delete(clientId);
    if (set.size === 0) rooms.delete(rid);
  }
  clientRoom.delete(clientId);
}

function joinRoom(clientId, roomId) {
  leaveRoom(clientId);
  const rid = sanitizeRoom(roomId);
  ensureRoom(rid).add(clientId);
  clientRoom.set(clientId, rid);
  return rid;
}

function othersInRoom(roomId, exceptId) {
  const out = {};
  const set = rooms.get(roomId);
  if (!set) return out;
  for (const pid of set) {
    if (pid === exceptId) continue;
    const st = lastState.get(pid);
    if (st) out[pid] = st;
  }
  return out;
}

function broadcastToRoom(roomId, obj, exceptId) {
  const raw = JSON.stringify(obj);
  const set = rooms.get(roomId);
  if (!set) return;
  for (const pid of set) {
    if (pid === exceptId) continue;
    const ws = clients.get(pid);
    if (ws && ws.readyState === 1) ws.send(raw);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const id = randomUUID();
  clients.set(id, ws);
  lastState.set(id, null);
  const roomId = joinRoom(id, "default");

  ws.send(
    JSON.stringify({
      type: "welcome",
      id,
      room: roomId,
      t: performance.now(),
      players: othersInRoom(roomId, id),
    })
  );

  broadcastToRoom(
    roomId,
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

    if (msg.type === "join") {
      const oldRoom = clientRoom.get(id);
      const newRoom = joinRoom(id, msg.room ?? "default");
      ws.send(
        JSON.stringify({
          type: "room",
          room: newRoom,
          t: performance.now(),
          players: othersInRoom(newRoom, id),
        })
      );
      if (oldRoom !== newRoom) {
        broadcastToRoom(
          newRoom,
          { type: "joined", id, t: performance.now() },
          id
        );
      }
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
    const rid = clientRoom.get(id);
    clients.delete(id);
    lastState.delete(id);
    leaveRoom(id);
    if (rid) {
      broadcastToRoom(rid, { type: "left", id, t: performance.now() }, null);
    }
  });
});

setInterval(() => {
  const t = performance.now();
  for (const [roomId, idSet] of rooms) {
    const players = {};
    for (const pid of idSet) {
      const st = lastState.get(pid);
      if (st) players[pid] = st;
    }
    if (Object.keys(players).length === 0) continue;
    const raw = JSON.stringify({ type: "snapshot", t, players });
    for (const pid of idSet) {
      const ws = clients.get(pid);
      if (ws && ws.readyState === 1) ws.send(raw);
    }
  }
}, 50);

console.log(`swat multiplayer relay listening on ws://0.0.0.0:${PORT}`);
