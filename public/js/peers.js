import * as THREE from "three";

const MAX_PEERS = 64;
/** Interpolation delay (ms) — render slightly in the past for smooth blending */
const INTERP_LAG_MS = 110;

/**
 * Other players as instanced cones; interpolates between snapshots.
 */
export class RemotePeers {
  /**
   * @param {THREE.Scene} scene
   * @param {string} localId
   */
  constructor(scene, localId) {
    this.localId = localId;
    /** @type {Map<string, { recvAt: number; x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }[]>} */
    this.buffers = new Map();
    /** @type {Map<string, number>} */
    this.idToSlot = new Map();
    this.freeSlots = [];
    for (let i = 0; i < MAX_PEERS; i++) this.freeSlots.push(i);

    const geo = new THREE.ConeGeometry(0.06, 0.22, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a3a32,
      roughness: 0.75,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PEERS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this.dummy = new THREE.Object3D();
    this._qA = new THREE.Quaternion();
    this._qB = new THREE.Quaternion();
    this._qOut = new THREE.Quaternion();
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
  }

  /**
   * @param {{ t?: number; players: Record<string, { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }> }} snap
   */
  ingestSnapshot(snap) {
    const recvAt = performance.now();
    const seen = new Set();
    const players = snap.players || {};
    for (const [pid, st] of Object.entries(players)) {
      if (pid === this.localId) continue;
      seen.add(pid);
      if (!this.buffers.has(pid)) this.buffers.set(pid, []);
      const arr = this.buffers.get(pid);
      arr.push({
        recvAt,
        x: st.x,
        y: st.y,
        z: st.z,
        qx: st.qx,
        qy: st.qy,
        qz: st.qz,
        qw: st.qw,
      });
      while (arr.length > 12) arr.shift();
      if (!this.idToSlot.has(pid)) {
        const slot = this.freeSlots.pop();
        if (slot === undefined) continue;
        this.idToSlot.set(pid, slot);
      }
    }
    for (const pid of [...this.idToSlot.keys()]) {
      if (!seen.has(pid)) this._remove(pid);
    }
  }

  _remove(pid) {
    const slot = this.idToSlot.get(pid);
    if (slot !== undefined) {
      this.dummy.position.set(0, -9999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(slot, this.dummy.matrix);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.freeSlots.push(slot);
    }
    this.idToSlot.delete(pid);
    this.buffers.delete(pid);
  }

  update() {
    const now = performance.now();
    const targetT = now - INTERP_LAG_MS;

    for (const [pid, slot] of this.idToSlot) {
      const arr = this.buffers.get(pid);
      if (!arr || arr.length === 0) continue;

      let i = 0;
      while (i + 1 < arr.length && arr[i + 1].recvAt < targetT) i += 1;

      const a = arr[i];
      const b = arr[Math.min(i + 1, arr.length - 1)];
      let alpha = 0;
      if (b !== a && b.recvAt > a.recvAt) {
        alpha = THREE.MathUtils.clamp(
          (targetT - a.recvAt) / (b.recvAt - a.recvAt),
          0,
          1
        );
      }

      this._v0.set(a.x, a.y, a.z);
      this._v1.set(b.x, b.y, b.z);
      this.dummy.position.lerpVectors(this._v0, this._v1, alpha);

      this._qA.set(a.qx, a.qy, a.qz, a.qw);
      this._qB.set(b.qx, b.qy, b.qz, b.qw);
      this._qOut.copy(this._qA).slerp(this._qB, alpha);

      this.dummy.quaternion.copy(this._qOut);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(slot, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Clear remote state after switching server room */
  clear() {
    for (const pid of [...this.idToSlot.keys()]) {
      this._remove(pid);
    }
    this.buffers.clear();
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
