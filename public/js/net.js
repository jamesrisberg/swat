/** WebSocket relay: send local transform, receive snapshot of all players. */

export class NetClient {
  constructor() {
    this.ws = null;
    /** @type {string | null} */
    this.id = null;
    /** @type {((msg: { type: string; [k: string]: unknown }) => void) | null} */
    this.onMessage = null;
  }

  /**
   * @param {string} wsUrl e.g. ws://localhost:8080
   * @returns {Promise<NetClient>}
   */
  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let done = false;

      const fail = (err) => {
        if (done) return;
        done = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(err);
      };

      const timer = setTimeout(
        () => fail(new Error("WebSocket connect timeout")),
        2800
      );

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type !== "welcome" || done) return;
        clearTimeout(timer);
        done = true;
        this.ws = ws;
        this.id = msg.id;
        ws.onmessage = (e) => {
          let m;
          try {
            m = JSON.parse(e.data);
          } catch {
            return;
          }
          if (this.onMessage) this.onMessage(m);
        };
        ws.onerror = null;
        ws.onclose = () => {
          this.ws = null;
          const hadId = this.id;
          this.id = null;
          if (hadId && this.onMessage) this.onMessage({ type: "disconnected" });
        };
        resolve(this);
      };
      ws.onerror = () => fail(new Error("WebSocket error"));
      ws.onclose = () => {
        clearTimeout(timer);
        fail(new Error("WebSocket closed before welcome"));
      };
    });
  }

  /**
   * @param {{ position: import('three').Vector3; group: import('three').Group }} mosquito
   */
  sendState(mosquito) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const p = mosquito.position;
    const q = mosquito.group.quaternion;
    this.ws.send(
      JSON.stringify({
        type: "state",
        x: p.x,
        y: p.y,
        z: p.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
      })
    );
  }

  /** Call after connect so the server places you in a lobby (see `?room=`). */
  sendJoin(room) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const r =
      typeof room === "string" && room.length > 0 ? room : "default";
    this.ws.send(JSON.stringify({ type: "join", room: r }));
  }
}
