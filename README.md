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

**Query param:** `?ws=ws://127.0.0.1:8080` to point at another host/port (e.g. Hetzner). **nginx:** proxy `Upgrade` / `Connection` headers for WebSocket to the Node process.

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
