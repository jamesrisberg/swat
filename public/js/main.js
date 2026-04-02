import * as THREE from "three";
import { Mosquito, createKeyboardInput } from "./flight.js";
import { Giant } from "./giant.js";
import { HazardZones } from "./hazards.js";

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
const readInput = createKeyboardInput();

const biteEl = document.getElementById("bites");
const swatEl = document.getElementById("swats");

let bites = 0;
let swats = 0;
let biteCooldown = 0;
let hitCooldown = 0;
const knock = new THREE.Vector3();
const camOff = new THREE.Vector3(0, 0.45, 2.6);
const lookAt = new THREE.Vector3();
const forward = new THREE.Vector3();

let last = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  mosquito.update(readInput(), dt);
  hazards.apply(mosquito, dt);
  giant.update(dt, now * 0.001, mosquito.position);

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
