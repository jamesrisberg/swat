# Swat

Browser game: pilot a mosquito in a shared 3D space, swarm a giant NPC on a beach or in the park, avoid swatters and hazards. Built with **Three.js** for rendering and flight; multiplayer and scale are planned for later phases.

## Local preview

Serve `public/` as the web root (any static server). Example:

```bash
npx --yes serve public
```

Then open the URL it prints (e.g. `http://localhost:3000`).

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
client/       # Game client modules (Three.js scene, flight, entities)
server/       # Reserved for future WebSocket / sim process
```

## License

TBD.
