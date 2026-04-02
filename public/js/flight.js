import * as THREE from "three";

/** Local player mosquito: clunky angular momentum + hover-ish thrust. */
export class Mosquito {
  constructor() {
    this.group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.22, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.7 })
    );
    body.rotation.x = Math.PI / 2;
    this.group.add(body);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x6a5a4a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.08), wingMat);
    w1.position.set(0, 0.02, 0);
    const w2 = w1.clone();
    w2.rotation.y = Math.PI;
    this.group.add(w1, w2);

    this.radius = 0.14;
    this.position = new THREE.Vector3(0, 3, 12);
    this.velocity = new THREE.Vector3(0, 0, 0);
    /** YXZ euler for intuitive pitch/yaw */
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    /** Angular rates (rad/s) — damped slowly for oversteer */
    this.yawRate = 0;
    this.pitchRate = 0;
    this.rollRate = 0;

    this.group.position.copy(this.position);
  }

  /**
   * @param {object} input
   * @param {number} input.thrust -1..1 forward/back
   * @param {number} input.strafe -1..1
   * @param {number} input.lift -1..1
   * @param {number} input.yaw -1..1
   * @param {number} input.pitch -1..1
   * @param {number} dt
   */
  update(input, dt) {
    const turnAccel = 5.5;
    const turnDamp = Math.exp(-1.8 * dt);
    const maxTurn = 2.8;

    this.yawRate += input.yaw * turnAccel * dt;
    this.pitchRate += input.pitch * turnAccel * dt;
    this.yawRate *= turnDamp;
    this.pitchRate *= turnDamp;
    this.yawRate = THREE.MathUtils.clamp(this.yawRate, -maxTurn, maxTurn);
    this.pitchRate = THREE.MathUtils.clamp(this.pitchRate, -maxTurn, maxTurn);

    this.euler.y += this.yawRate * dt;
    this.euler.x += this.pitchRate * dt;
    const lim = Math.PI / 2 - 0.12;
    this.euler.x = THREE.MathUtils.clamp(this.euler.x, -lim, lim);

    /** Slight roll from yaw for clumsy feel */
    this.rollRate = THREE.MathUtils.lerp(this.rollRate, -input.yaw * 1.2, dt * 3);
    this.rollRate *= Math.exp(-4 * dt);
    this.euler.z = this.rollRate * 0.35;

    const quat = new THREE.Quaternion().setFromEuler(this.euler);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const up = new THREE.Vector3(0, 1, 0);

    const thrust = 18;
    const strafe = 10;
    const lift = 12;
    this.velocity.addScaledVector(forward, input.thrust * thrust * dt);
    this.velocity.addScaledVector(right, input.strafe * strafe * dt);
    this.velocity.addScaledVector(up, input.lift * lift * dt);

    /** Gravity + soft hover near ground */
    this.velocity.y -= 6.5 * dt;
    const groundY = this.radius;
    if (this.position.y < groundY + 2.5) {
      this.velocity.y += (groundY + 1.8 - this.position.y) * 2.2 * dt;
    }

    /** Drag */
    const drag = Math.exp(-1.1 * dt);
    this.velocity.multiplyScalar(drag);

    const maxSpeed = 24;
    if (this.velocity.lengthSq() > maxSpeed * maxSpeed) {
      this.velocity.normalize().multiplyScalar(maxSpeed);
    }

    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y < groundY) {
      this.position.y = groundY;
      this.velocity.y = Math.max(0, this.velocity.y);
    }

    this.group.position.copy(this.position);
    this.group.quaternion.copy(quat);
  }


  /** Impulse in world space (e.g. swat knockback) */
  applyImpulse(worldDeltaV) {
    this.velocity.add(worldDeltaV);
  }

  getWorldPosition(target) {
    return this.group.getWorldPosition(target);
  }
}

/** Poll keyboard into normalized inputs */
export function createKeyboardInput() {
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        e.code
      )
    ) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  return function readInput() {
    let thrust = 0;
    let strafe = 0;
    let lift = 0;
    if (keys.has("KeyW") || keys.has("KeyZ")) thrust += 1;
    if (keys.has("KeyS")) thrust -= 1;
    if (keys.has("KeyA") || keys.has("KeyQ")) strafe -= 1;
    if (keys.has("KeyD")) strafe += 1;
    if (keys.has("Space")) lift += 1;
    if (keys.has("ControlLeft") || keys.has("ControlRight")) lift -= 1;

    let yaw = 0;
    let pitch = 0;
    if (keys.has("ArrowLeft")) yaw -= 1;
    if (keys.has("ArrowRight")) yaw += 1;
    if (keys.has("ArrowUp")) pitch -= 1;
    if (keys.has("ArrowDown")) pitch += 1;

    return { thrust, strafe, lift, yaw, pitch };
  };
}
