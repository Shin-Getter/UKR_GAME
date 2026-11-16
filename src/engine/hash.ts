/**
 * FNV-1a state hashing. Used to compare game state between peers each cycle
 * (desync detection) and in determinism tests.
 */
export class StateHasher {
  private h = 0x811c9dc5;

  bytes(view: ArrayBufferView): this {
    const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let h = this.h;
    for (let i = 0; i < b.length; i++) {
      h ^= b[i]!;
      h = Math.imul(h, 0x01000193);
    }
    this.h = h >>> 0;
    return this;
  }

  u32(value: number): this {
    return this.bytes(new Uint32Array([value >>> 0]));
  }

  digest(): string {
    return this.h.toString(16).padStart(8, "0");
  }
}
