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
let biteCooldown = 0;
let hitCooldown = 0;
let predatorCooldown = 0;
const knock = new THREE.Vector3();
const camOff = new THREE.Vector3(0, 0.45, 2.6);
const lookAt = new THREE.Vector3();
const forward = new THREE.Vector3();

let last = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const timeSec = now * 0.001;

  mosquito.update(readInput(), dt);
  hazards.apply(mosquito, dt);
  giant.update(dt, timeSec, mosquito.position);

  sendAcc += dt;
  if (net && sendAcc >= 0.05) {
    sendAcc = 0;
    net.sendState(mosquito);
  }
  if (peers) peers.update();

  biteCooldown -= dt;
  if (biteCooldown <= 0 && giant.canBite(mosquito.position)) {
    bites += 1;
    biteCooldown = 0.32;
    if (biteEl) biteEl.textContent = String(bites);
  }

  hitCooldown -= dt;
  if (hitCooldown <= 0 && giant.checkSwat(mosquito.position, mosquito.radius)) {
    knock.set(
      (Math.random() - 0.5) * 10,
      6 + Math.random() * 4,
      (Math.random() - 0.5) * 10
    );
    mosquito.applyImpulse(knock);
    hitCooldown = 0.75;
    swats += 1;
    if (swatEl) swatEl.textContent = String(swats);
    document.body.classList.add("flash");
    setTimeout(() => document.body.classList.remove("flash"), 120);
  }

  predatorCooldown -= dt;
  if (predatorCooldown <= 0 && predators.update(timeSec, mosquito)) {
    knock.set(
      (Math.random() - 0.5) * 16,
      10 + Math.random() * 5,
      (Math.random() - 0.5) * 16
    );
    mosquito.applyImpulse(knock);
    predatorCooldown = 0.95;
    predHits += 1;
    if (predEl) predEl.textContent = String(predHits);
    document.body.classList.add("flash");
    setTimeout(() => document.body.classList.remove("flash"), 80);
  }

  camOff.set(0, 0.45, 2.6);
  camOff.applyQuaternion(mosquito.group.quaternion);
  camera.position.copy(mosquito.position).add(camOff);
  forward.set(0, 0, -1).applyQuaternion(mosquito.group.quaternion);
  lookAt.copy(mosquito.position).addScaledVector(forward, 1.2);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
}
tick(performance.now());

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
