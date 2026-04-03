import * as THREE from "three";

/**
 * Drone-ish feel: **WASD = horizontal thrust** (where you're facing), **Space/Ctrl = lift**.
 * Soft yaw, air drag, visual tilt only — no “tilt to move” requirement.
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

    /** Yaw + visual bank only */
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.yawRate = 0;
    this.visualPitch = 0;
    this.visualRoll = 0;

    this._quat = new THREE.Quaternion();
    this._flatQuat = new THREE.Quaternion();
    this._yawEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._accel = new THREE.Vector3();

    this.group.position.copy(this.position);
  }

  /**
   * @param {object} input
   * @param {number} input.pitch W/S → forward/back thrust
   * @param {number} input.roll A/D → strafe thrust
   * @param {number} input.lift Space/Ctrl → lift (−1..1)
   * @param {number} input.yaw arrows → yaw
   * @param {number} dt
   */
  update(input, dt) {
    const g = 11.2;

    /** Soft yaw */
    const yawTorque = 2.4;
    const yawDamp = 2.6;
    this.yawRate += input.yaw * yawTorque * dt;
    this.yawRate *= Math.exp(-yawDamp * dt);
    this.euler.y += this.yawRate * dt;

    /** Flat orientation (yaw only) for thrust direction */
    this._yawEuler.set(0, this.euler.y, 0);
    this._flatQuat.setFromEuler(this._yawEuler);
    this._fwd.set(0, 0, -1).applyQuaternion(this._flatQuat);
    this._right.set(1, 0, 0).applyQuaternion(this._flatQuat);

    /** Horizontal thrust — this is what “move” feels like */
    const hThrust = 19;
    this._accel.set(0, 0, 0);
    this._accel.addScaledVector(this._fwd, input.pitch * hThrust);
    this._accel.addScaledVector(this._right, input.roll * hThrust);

    /** Vertical: lift mixes with gravity — **lift = 0 → hover** (net vertical ≈ 0) */
    const liftMix = 1 + input.lift * 0.55;
    this._accel.y += -g + g * liftMix;

    /** Air drag — sloppy stop, not arcade snap */
    const dragH = 1.05;
    const dragV = 0.65;
    this._accel.x += -this.velocity.x * dragH;
    this._accel.z += -this.velocity.z * dragH;
    this._accel.y += -this.velocity.y * dragV;

    this.velocity.addScaledVector(this._accel, dt);

    const maxH = 16;
    const maxV = 20;
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
      this.velocity.y += (groundY + 1.6 - this.position.y) * 1.7 * dt;
    }
    if (this.position.y < groundY) {
      this.position.y = groundY;
      this.velocity.y = Math.max(0, this.velocity.y * 0.35);
    }

    /** Visual tilt lags input — looks quad-like without steering physics */
    const vt = 5.5;
    this.visualPitch = THREE.MathUtils.lerp(
      this.visualPitch,
      -input.pitch * 0.28,
      1 - Math.exp(-vt * dt)
    );
    /** Bank opposite sign from strafe so A/D tilt matches slide direction */
    this.visualRoll = THREE.MathUtils.lerp(
      this.visualRoll,
      -input.roll * 0.28,
      1 - Math.exp(-vt * dt)
    );
    this.euler.x = this.visualPitch;
    this.euler.z = this.visualRoll;

    this._quat.setFromEuler(this.euler);
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this._quat);
  }

  applyImpulse(worldDeltaV) {
    this.velocity.add(worldDeltaV);
  }

  getWorldPosition(target) {
    return this.group.getWorldPosition(target);
  }
}

/** W/S forward · A/D strafe · Space/Ctrl lift · arrows yaw */
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
    /** Left arrow = yaw left (matches screen expectation) */
    if (keys.has("ArrowLeft")) yaw += 1;
    if (keys.has("ArrowRight")) yaw -= 1;

    return { pitch, roll, lift, yaw };
  };
}
