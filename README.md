# Swat

Browser game: pilot a mosquito in a shared 3D space, swarm a giant NPC on a beach or in the park, avoid swatters and hazards. Built with **Three.js** for rendering and flight; multiplayer and scale are planned for later phases.

## Local preview

Serve `public/` as the web root (any static server). Example:

```bash
npx --yes serve public
```

Then open the URL it prints (e.g. `http://localhost:3000`).

## Phase A prototype (single-player)

Clunky momentum flight, a giant NPC with slow arm swings (hand collision = knockback), bite score near the torso, and placeholder hazards (citronella repulsion, wind, bug-zapper pull). Code lives under `public/js/` (`main.js`, `flight.js`, `giant.js`, `hazards.js`).

## Phase B — local multiplayer (relay)

A tiny **Node** server in `server/` broadcasts JSON snapshots at ~20 Hz. Clients send their transform; other players render as **instanced** mosquitoes with **~110 ms interpolation** lag. This is a trust relay (not authoritative physics yet).

**Run two terminals:**

```bash
# Terminal 1 — game server
cd server && npm install && npm start
```

```bash
# Terminal 2 — static site (same host as the browser uses for WS)
npx --yes serve public -p 3000
```

Open `http://localhost:3000` in two browser tabs. Status line shows **Online · ws://localhost:8080** when connected.

**Query params:**

- `?ws=ws://127.0.0.1:8080` — WebSocket URL (defaults to same host, port 8080).
- `?room=beach` — lobby id (alphanumeric / `_` / `-`, max 48 chars). Everyone in the same room sees each other.

**nginx:** proxy `Upgrade` / `Connection` headers for WebSocket to the Node process.

## Host online (friends can join)

You need **(1)** static files from `public/` and **(2)** the Node relay in `server/` (WebSocket). Everyone uses the **same** `?room=` to land in one lobby.

### Quick (HTTP, janky but fast)

1. On a VPS (e.g. Hetzner), clone the repo to e.g. `/opt/swat`, run `cd server && npm install`.
2. Run the relay: `cd /opt/swat/server && PORT=8080 node index.mjs` (or use [`deploy/swat-ws.service`](deploy/swat-ws.service) with systemd).
3. Serve `public/` on port **80** (nginx `root`, or `npx serve public -p 80` behind `sudo`).
4. Open firewall: **80** and **8080** (browser default is `ws://YOUR_DOMAIN_OR_IP:8080`).
5. Share: `http://YOUR_IP/` or `http://your.domain/` and the same `?room=lobby` link for everyone.

Override WebSocket URL if needed: `?ws=ws://host:8080`

### Better (HTTPS + WSS, one port)

Browsers require **wss://** when the page is **https://**. The client defaults to **`wss://<same host>/ws`** when `location.protocol` is `https` (see `public/js/main.js`).

1. Install nginx; copy [`deploy/nginx-swat.conf.example`](deploy/nginx-swat.conf.example), set `server_name` and `root` to your `public/` path.
2. Point `proxy_pass` at `127.0.0.1:8080` where Node runs (systemd unit above). **Do not** expose 8080 publicly—only nginx on 80/443.
3. `sudo certbot --nginx -d game.example.com` for TLS.
4. `sudo ufw allow 80,443/tcp && sudo ufw enable`

Share: `https://game.example.com/?room=lobby` — WebSocket goes to **`wss://game.example.com/ws`** automatically.

### Manual override

`?ws=wss://other-host/ws` if you split static and relay across hosts.

### Predators & hazards

Five **aerial predators** (scripted paths) deal heavy knockback on contact—separate counter from giant swats. **Hazard zones** (citronella, wind, bug zapper) are in `public/js/hazards.js`.

## Architecture (deployment)

| Layer | Role |
|--------|------|
| **nginx** (Hetzner VPS) | Serves static files from `public/` as document root. Optional `location` blocks for PHP if you add `.php` routes (sessions, leaderboards, admin). |
| **PHP** (optional) | Good for HTTP-only concerns: assets, REST APIs, auth—not for high-frequency real-time game loops. |
| **Game server** (Phase B+) | **Node.js or Go**: WebSocket (or similar) for authoritative state at ~10–20 Hz, rooms/shards, interest management. nginx can proxy `/ws` or a subdomain to this process. |

**Scaling toward many concurrent players:** horizontal sharding (many room instances), Redis (or similar) for presence/session, spatial interest management so each client only receives nearby entities—not a full mesh broadcast. Client-side: instanced meshes, LOD, interpolation between server snapshots.

See the project plan in your tracker for netcode details (quantization, delta encoding, prediction vs interpolation).

## Repo layout

```
public/       # nginx docroot: index.html, assets
public/js/    # Phase A game modules (no bundler yet)
client/       # Future source modules when you add a bundler
server/       # Reserved for future WebSocket / sim process
```

## License

TBD.
