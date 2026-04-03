import * as THREE from "three";
import { Mosquito, createKeyboardInput } from "./flight.js";
import { Giant } from "./giant.js";
import { HazardZones } from "./hazards.js";
import { NetClient } from "./net.js";
import { Predators } from "./predators.js";
import { RemotePeers } from "./peers.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0x8fa8c8, 0x2a1a0a, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(5, 12, 8);
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0xc9b89c, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(80, 40, 0x444444, 0x333333));

const mosquito = new Mosquito();
scene.add(mosquito.group);

const giant = new Giant(scene);
const hazards = new HazardZones(scene);
const predators = new Predators(scene);
const readInput = createKeyboardInput();

const biteEl = document.getElementById("bites");
const swatEl = document.getElementById("swats");
const predEl = document.getElementById("preds");
const deathsEl = document.getElementById("deaths");
const deathTitleEl = document.getElementById("death-title");
const deathCountdownEl = document.getElementById("death-countdown");
const netStatusEl = document.getElementById("net-status");

const params = new URLSearchParams(location.search);
const wsUrl =
  params.get("ws") ?? `ws://${location.hostname}:8080`;
const roomParam = params.get("room") ?? "default";

/** @type {NetClient | null} */
let net = null;
/** @type {RemotePeers | null} */
let peers = null;
let sendAcc = 0;

(async () => {
  const client = new NetClient();
  try {
    await client.connect(wsUrl);
    net = client;
    peers = new RemotePeers(scene, net.id);
    net.sendJoin(roomParam);
    net.onMessage = (msg) => {
      if (msg.type === "snapshot" && peers && msg.players) {
        peers.ingestSnapshot(msg);
      }
      if (msg.type === "room" && peers) {
        peers.clear();
        if (netStatusEl) {
          const r = typeof msg.room === "string" ? msg.room : roomParam;
          netStatusEl.textContent = `Online · ${wsUrl} · room ${r}`;
        }
      }
      if (msg.type === "disconnected" && peers) {
        peers.dispose();
        peers = null;
        net = null;
        if (netStatusEl) netStatusEl.textContent = "Solo (offline)";
      }
    };
    if (netStatusEl) {
      netStatusEl.textContent = `Online · ${wsUrl} · room ${roomParam}`;
    }
  } catch (e) {
    console.warn("Multiplayer offline:", e);
    if (netStatusEl) netStatusEl.textContent = "Solo (offline)";
  }
})();

let bites = 0;
let swats = 0;
let predHits = 0;
let deaths = 0;
let biteCooldown = 0;
let hitCooldown = 0;
let predatorCooldown = 0;

let alive = true;
/** @type {number} */
let respawnAt = 0;

const camOff = new THREE.Vector3(0, 0.45, 2.6);
const lookAt = new THREE.Vector3();
const forward = new THREE.Vector3();

const RESPAWN_MS = 10000;
const OVERVIEW_POS = new THREE.Vector3(0, 52, 68);
const OVERVIEW_LOOK = new THREE.Vector3(0, 1.8, 0);

/**
 * @param {"swat" | "pred"} reason
 */
function die(reason) {
  if (!alive) return;
  alive = false;
  deaths += 1;
  respawnAt = performance.now() + RESPAWN_MS;
  mosquito.velocity.set(0, 0, 0);
  mosquito.group.visible = false;
  if (reason === "swat") {
    swats += 1;
    if (swatEl) swatEl.textContent = String(swats);
  } else {
    predHits += 1;
    if (predEl) predEl.textContent = String(predHits);
  }
  if (deathsEl) deathsEl.textContent = String(deaths);
  if (deathTitleEl) {
    deathTitleEl.textContent =
      reason === "swat" ? "You got swatted" : "Caught by a predator";
  }
  if (deathCountdownEl) deathCountdownEl.textContent = "10";
  document.body.classList.add("dead");
  document.body.classList.add("flash");
  setTimeout(() => document.body.classList.remove("flash"), 200);
}

function respawn() {
  alive = true;
  mosquito.reset();
  mosquito.group.visible = true;
  document.body.classList.remove("dead");
  hitCooldown = 0.85;
  predatorCooldown = 0.95;
}

let last = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const timeSec = now * 0.001;

  giant.update(dt, timeSec, mosquito.position);

  if (alive) {
    mosquito.update(readInput(), dt);
    hazards.apply(mosquito, dt);
    giant.resolveBodyCollision(mosquito);
    mosquito.group.position.copy(mosquito.position);

    sendAcc += dt;
    if (net && sendAcc >= 0.05) {
      sendAcc = 0;
      net.sendState(mosquito);
    }

    biteCooldown -= dt;
    if (
      biteCooldown <= 0 &&
      giant.canBite(mosquito.position, mosquito.velocity, mosquito.radius)
    ) {
      bites += 1;
      biteCooldown = 0.32;
      if (biteEl) biteEl.textContent = String(bites);
    }

    hitCooldown -= dt;
    if (hitCooldown <= 0 && giant.checkSwat(mosquito.position, mosquito.radius)) {
      die("swat");
    }

    predatorCooldown -= dt;
  } else {
    if (now >= respawnAt) {
      respawn();
    } else if (deathCountdownEl) {
      deathCountdownEl.textContent = String(
        Math.max(0, Math.ceil((respawnAt - now) / 1000))
      );
    }
    sendAcc += dt;
    if (net && sendAcc >= 0.05) {
      sendAcc = 0;
      net.sendState(mosquito);
    }
  }

  const predHit = predators.update(timeSec, alive ? mosquito : null);
  if (alive && predatorCooldown <= 0 && predHit) {
    die("pred");
  }

  if (peers) peers.update();

  if (!alive) {
    camera.position.copy(OVERVIEW_POS);
    camera.lookAt(OVERVIEW_LOOK);
  } else {
    camOff.set(0, 0.45, 2.6);
    camOff.applyQuaternion(mosquito.group.quaternion);
    camera.position.copy(mosquito.position).add(camOff);
    forward.set(0, 0, -1).applyQuaternion(mosquito.group.quaternion);
    lookAt.copy(mosquito.position).addScaledVector(forward, 1.2);
    camera.lookAt(lookAt);
  }

  renderer.render(scene, camera);
}
tick(performance.now());

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
