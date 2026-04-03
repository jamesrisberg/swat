import * as THREE from "three";

/**
 * Quadcopter-ish mosquito: thrust along body up, tilt for horizontal motion,
 * soft angular momentum (overshoot, no instant stops), hover throttle.
 */
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

    /** YXZ: yaw, pitch, roll (tilt) */
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    /** Angular rates — carry momentum (overshoot when releasing input) */
    this.pitchRate = 0;
    this.rollRate = 0;
    this.yawRate = 0;

    this._quat = new THREE.Quaternion();
    this._accel = new THREE.Vector3();
    this._thrust = new THREE.Vector3();
    this._drag = new THREE.Vector3();
    this._gravity = new THREE.Vector3(0, -11.5, 0);

    this.group.position.copy(this.position);
  }

  /**
   * @param {object} input
   * @param {number} input.pitch -1..1 tilt forward/back (W/S)
   * @param {number} input.roll -1..1 strafe tilt (A/D)
   * @param {number} input.lift -1..1 throttle (Space / Ctrl)
   * @param {number} input.yaw -1..1 yaw (arrows)
   * @param {number} dt
   */
  update(input, dt) {
    const g = 11.5;

    /** Tilt limits (~28°) — quad can't fold flat */
    const maxTilt = 0.48;

    /** Torque: sluggish response → overshoot when input stops */
    const pitchTorque = 5.0;
    const rollTorque = 5.0;
    const pitchDamp = 1.35;
    const rollDamp = 1.35;
    const yawTorque = 2.1;
    const yawDamp = 2.8;

    this.pitchRate += input.pitch * pitchTorque * dt;
    this.rollRate += input.roll * rollTorque * dt;
    this.yawRate += input.yaw * yawTorque * dt;

    this.pitchRate *= Math.exp(-pitchDamp * dt);
    this.rollRate *= Math.exp(-rollDamp * dt);
    this.yawRate *= Math.exp(-yawDamp * dt);

    this.euler.x += this.pitchRate * dt;
    this.euler.z += this.rollRate * dt;
    this.euler.y += this.yawRate * dt;

    this.euler.x = THREE.MathUtils.clamp(this.euler.x, -maxTilt, maxTilt);
    this.euler.z = THREE.MathUtils.clamp(this.euler.z, -maxTilt, maxTilt);

    /** Gentle auto-level when not commanding tilt (easier hover) */
    const auto = 0.85;
    if (Math.abs(input.pitch) < 0.02) {
      this.pitchRate += (-this.euler.x - this.pitchRate * 0.12) * auto * dt;
    }
    if (Math.abs(input.roll) < 0.02) {
      this.rollRate += (-this.euler.z - this.rollRate * 0.12) * auto * dt;
    }

    this._quat.setFromEuler(this.euler);

    /** Throttle: ~1 = hover when level; Space/Ctrl shifts band */
    const liftMag = g * (1.0 + input.lift * 0.42);
    this._thrust.set(0, 1, 0).applyQuaternion(this._quat).multiplyScalar(liftMag);

    this._accel.copy(this._thrust).add(this._gravity);

    /** Air drag — can't stop on a dime; horizontal a bit stronger */
    const dragH = 0.85;
    const dragV = 0.55;
    this._drag.set(
      -this.velocity.x * dragH,
      -this.velocity.y * dragV,
      -this.velocity.z * dragH
    );
    this._accel.add(this._drag);

    this.velocity.addScaledVector(this._accel, dt);

    const maxH = 14;
    const maxV = 18;
    const vh = Math.hypot(this.velocity.x, this.velocity.z);
    if (vh > maxH) {
      const s = maxH / vh;
      this.velocity.x *= s;
      this.velocity.z *= s;
    }
    this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -maxV, maxV);

    this.position.addScaledVector(this.velocity, dt);

    const groundY = this.radius;
    if (this.position.y < groundY + 2.2) {
      /** Ground cushion / ground effect */
      this.velocity.y += (groundY + 1.6 - this.position.y) * 1.8 * dt;
    }
    if (this.position.y < groundY) {
      this.position.y = groundY;
      this.velocity.y = Math.max(0, this.velocity.y * 0.35);
    }

    this.group.position.copy(this.position);
    this.group.quaternion.copy(this._quat);
  }

  /** Impulse in world space (e.g. swat knockback) */
  applyImpulse(worldDeltaV) {
    this.velocity.add(worldDeltaV);
  }

  getWorldPosition(target) {
    return this.group.getWorldPosition(target);
  }
}

/** Poll keyboard — quad-style: W/S tilt, A/D roll, Space/Ctrl throttle, arrows yaw */
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
    let pitch = 0;
    let roll = 0;
    let lift = 0;
    if (keys.has("KeyW") || keys.has("KeyZ")) pitch += 1;
    if (keys.has("KeyS")) pitch -= 1;
    if (keys.has("KeyA") || keys.has("KeyQ")) roll -= 1;
    if (keys.has("KeyD")) roll += 1;
    if (keys.has("Space")) lift += 1;
    if (keys.has("ControlLeft") || keys.has("ControlRight")) lift -= 1;

    let yaw = 0;
    if (keys.has("ArrowLeft")) yaw -= 1;
    if (keys.has("ArrowRight")) yaw += 1;

    return { pitch, roll, lift, yaw };
  };
}
