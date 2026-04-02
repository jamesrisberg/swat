import * as THREE from "three";

/**
 * Large NPC: slow procedural arm swings + world-space hand spheres for swats.
 */
export class Giant {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);

    const skin = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.85,
    });
    const shirt = new THREE.MeshStandardMaterial({
      color: 0x3a6ea5,
      roughness: 0.9,
    });
    const shorts = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.9,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.2, 1.6), shirt);
    torso.position.y = 2.4;
    this.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), skin);
    head.position.y = 4.4;

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.8, 8), shorts);
    leg.position.set(-0.55, 0.9, 0);
    const leg2 = leg.clone();
    leg2.position.x = 0.55;

    this.root.add(torso, head, leg, leg2);

    /** Shoulder pivots */
    this.armL = this._makeArm(-1, skin, shirt);
    this.armR = this._makeArm(1, skin, shirt);
    this.root.add(this.armL.pivot, this.armR.pivot);

    /** Swatter pad (right hand) */
    const swatter = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.3 })
    );
    swatter.position.set(0, -2.2, 0.35);
    this.armR.forearm.add(swatter);

    this.torsoWorldPos = new THREE.Vector3();
    this.handL = new THREE.Vector3();
    this.handR = new THREE.Vector3();
    this.handRadius = 0.55;
    this.biteRadius = 1.1;
    this.phase = 0;
  }

  _makeArm(side, skinMat, shirtMat) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.55, 3.5, 0);

    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 1.2, 4, 8),
      shirtMat
    );
    upper.position.y = -0.65;
    const forearm = new THREE.Group();
    forearm.position.y = -1.35;
    const lower = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 1.0, 4, 8),
      skinMat
    );
    lower.position.y = -0.55;
    forearm.add(lower);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), skinMat);
    hand.position.y = -1.15;
    forearm.add(hand);

    pivot.add(upper, forearm);
    return { pivot, forearm };
  }

  /**
   * @param {number} dt
   * @param {number} time
   * @param {THREE.Vector3} mosquitoPos - for occasional aimed swat bias
   */
  update(dt, time, mosquitoPos) {
    this.phase += dt * 0.55;
    const slow = Math.sin(this.phase);
    const slow2 = Math.cos(this.phase * 0.83 + 0.4);

    /** Slow giant swings — big arcs */
    this.armL.pivot.rotation.x = -0.4 + slow * 0.95;
    this.armL.pivot.rotation.z = -0.35 + slow2 * 0.25;

    /** Bias right arm toward mosquito horizontally (lazy tracking) */
    const dx = mosquitoPos.x - this.root.position.x;
    const dz = mosquitoPos.z - this.root.position.z;
    const aim = Math.atan2(dx, dz) * 0.18;
    this.armR.pivot.rotation.y = aim + slow2 * 0.2;
    this.armR.pivot.rotation.x = -0.5 + Math.sin(this.phase * 1.1 + 1) * 1.05;
    this.armR.pivot.rotation.z = -0.4 - slow * 0.35;

    this.root.updateMatrixWorld(true);
    this.torso.getWorldPosition(this.torsoWorldPos);
    this._handWorld(this.armL.forearm, this.handL);
    this._handWorld(this.armR.forearm, this.handR);
  }

  _handWorld(forearmGroup, target) {
    target.set(0, -1.15, 0);
    target.applyMatrix4(forearmGroup.matrixWorld);
  }

  /** True if mosquito center is in bite range of torso */
  canBite(mosquitoPos) {
    const p = this.torsoWorldPos;
    const dx = mosquitoPos.x - p.x;
    const dy = mosquitoPos.y - p.y;
    const dz = mosquitoPos.z - p.z;
    return dx * dx + dy * dy * 0.45 + dz * dz < this.biteRadius * this.biteRadius;
  }

  /**
   * @returns {boolean} hit
   */
  checkSwat(mosquitoPos, mosquitoRadius) {
    const r = this.handRadius + mosquitoRadius;
    const r2 = r * r;
    if (this.handL.distanceToSquared(mosquitoPos) < r2) return true;
    if (this.handR.distanceToSquared(mosquitoPos) < r2) return true;
    return false;
  }
}
