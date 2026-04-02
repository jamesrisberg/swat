import * as THREE from "three";

/** Placeholder volumes: citronella repel, constant wind, bug-zapper pull. */
export class HazardZones {
  constructor(scene) {
    this._scratch = new THREE.Vector3();

    this.candlePos = new THREE.Vector3(-8, 0.35, 5);
    this.candleRadius = 3.2;
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.55, 12),
      new THREE.MeshStandardMaterial({ color: 0xff7722, emissive: 0x331100 })
    );
    candle.position.copy(this.candlePos);
    scene.add(candle);

    this.windDir = new THREE.Vector3(0.25, 0, -0.85).normalize();
    this.windStrength = 5;

    this.zapperPos = new THREE.Vector3(12, 2.2, -4);
    this.zapperRadius = 4.5;
    this.zapperPull = 12;
    const zap = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.55, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xaaccff, emissive: 0x112244 })
    );
    zap.position.copy(this.zapperPos);
    scene.add(zap);
  }

  /**
   * @param {{ position: THREE.Vector3; velocity: THREE.Vector3 }} mosquito
   * @param {number} dt
   */
  apply(mosquito, dt) {
    const v = this._scratch;

    v.subVectors(mosquito.position, this.candlePos);
    let d = v.length();
    if (d < this.candleRadius && d > 1e-4) {
      v.multiplyScalar(1 / d);
      const k = (1 - d / this.candleRadius) * 28;
      mosquito.velocity.addScaledVector(v, k * dt);
    }

    mosquito.velocity.addScaledVector(this.windDir, this.windStrength * dt);

    v.subVectors(this.zapperPos, mosquito.position);
    d = v.length();
    if (d < this.zapperRadius && d > 1e-4) {
      v.multiplyScalar(1 / d);
      const k = (1 - d / this.zapperRadius) * this.zapperPull;
      mosquito.velocity.addScaledVector(v, k * dt);
    }
  }
}
