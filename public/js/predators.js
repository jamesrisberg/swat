import * as THREE from "three";

/**
 * Aerial hazards: scripted paths, sphere-vs-mosquito hits = knockback.
 */
export class Predators {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {{ group: THREE.Group; radius: number; phase: number; speed: number; path: (t: number, out: THREE.Vector3) => void; color: number }[]} */
    this.entries = [];
    this._pos = new THREE.Vector3();

    const mk = (color, radius, phase, speed, path) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.45, 8, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
      );
      g.add(body);
      scene.add(g);
      this.entries.push({ group: g, radius, phase, speed, path, color });
    };

    /** Dragonfly — tight figure-8 near play space */
    mk(0x2d5a3d, 0.35, 0, 1.1, (t, out) => {
      const s = t * 2.1;
      out.set(4 * Math.sin(s), 2.8 + Math.sin(s * 2) * 0.4, 3 * Math.sin(s * 2) * Math.cos(s));
    });

    mk(0x3a6b4a, 0.32, 1.7, 0.95, (t, out) => {
      const s = t * 1.8;
      out.set(-5 * Math.cos(s * 0.9), 3.5, 4 * Math.sin(s * 0.9));
    });

    /** Bat — low elliptical orbit */
    mk(0x1a1a22, 0.5, 0.4, 0.65, (t, out) => {
      const s = t * 0.85;
      out.set(10 * Math.cos(s), 4.2 + Math.sin(s * 2) * 0.6, 8 * Math.sin(s));
    });

    /** Bird — high swoop across */
    mk(0x5c4033, 0.55, 2.2, 0.45, (t, out) => {
      const s = t * 0.35;
      out.set(Math.sin(s) * 22, 9 + Math.sin(s * 1.3) * 1.5, Math.cos(s * 0.7) * 16);
    });

    /** Fast dart — crosses diagonally */
    mk(0x4a4a6a, 0.28, 4.0, 1.4, (t, out) => {
      const s = t * 1.2;
      out.set(14 * Math.sin(s), 5 + Math.cos(s * 3), -12 * Math.cos(s * 0.8));
    });
  }

  /**
   * @param {number} timeSec
   * @param {{ position: THREE.Vector3; radius: number }} mosquito
   * @returns {boolean} hit this frame
   */
  update(timeSec, mosquito) {
    let hit = false;
    for (const e of this.entries) {
      const t = timeSec * e.speed + e.phase;
      e.path(t, this._pos);
      e.group.position.copy(this._pos);

      const r = e.radius + mosquito.radius;
      if (this._pos.distanceToSquared(mosquito.position) < r * r) {
        hit = true;
      }
    }
    return hit;
  }

  dispose() {
    for (const e of this.entries) {
      this.scene.remove(e.group);
      e.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.entries.length = 0;
  }
}
