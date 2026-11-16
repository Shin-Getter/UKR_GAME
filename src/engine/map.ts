import { Terrain } from "../data/terrain";
import { StateHasher } from "./hash";
import { type Axial, axialToOffset, HEX_FLAT_TO_FLAT_M, HEX_ROW_SPACING_M, offsetToAxial } from "./hex";

export enum RoadClass {
  None = 0,
  Track = 1,
  Paved = 2,
}

/**
 * The sector map: one record per hex, stored as flat typed arrays indexed by
 * offset coordinates (row-major). Typed arrays keep it fast and make the
 * state trivially hashable for desync checks.
 */
export class HexMap {
  readonly terrain: Uint8Array;
  /** Ground elevation in metres. */
  readonly elevation: Int16Array;
  readonly road: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly seed: number,
  ) {
    const n = cols * rows;
    this.terrain = new Uint8Array(n);
    this.elevation = new Int16Array(n);
    this.road = new Uint8Array(n);
  }

  get size(): number {
    return this.cols * this.rows;
  }

  /** Sector width (east-west frontage) in km. */
  get widthKm(): number {
    return (this.cols * HEX_FLAT_TO_FLAT_M) / 1000;
  }

  /** Sector depth (north-south) in km. */
  get depthKm(): number {
    return (this.rows * HEX_ROW_SPACING_M) / 1000;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }

  /** Array index for an axial hex, or -1 if it is off the map. */
  indexOfAxial(h: Axial): number {
    const o = axialToOffset(h);
    return this.inBounds(o.col, o.row) ? this.index(o.col, o.row) : -1;
  }

  axialOfIndex(i: number): Axial {
    return offsetToAxial({ col: i % this.cols, row: Math.floor(i / this.cols) });
  }

  terrainAt(col: number, row: number): Terrain {
    return this.terrain[this.index(col, row)] as Terrain;
  }

  hash(): string {
    return new StateHasher()
      .u32(this.cols)
      .u32(this.rows)
      .bytes(this.terrain)
      .bytes(this.elevation)
      .bytes(this.road)
      .digest();
  }
}
