import type { BoundaryMode, EMFieldsPresetId, EMFieldsSimParams, PointCharge } from "./types";

export const DEFAULT_Y_PLANE = -0.62;
export const DEFAULT_SOFTENING = 0.035;
export const DEFAULT_K = 1;

export const DEFAULT_SIM_PARAMS: EMFieldsSimParams = {
  boundary: "free",
  yPlane: DEFAULT_Y_PLANE,
  softening: DEFAULT_SOFTENING,
  kCoulomb: DEFAULT_K
};

export type Vec2World = { x: number; y: number };

export function pixelToWorld(px: number, py: number, cw: number, ch: number): Vec2World {
  const scale = 2.35 / Math.min(cw, ch);
  return {
    x: (px - cw / 2) * scale,
    y: -(py - ch / 2) * scale
  };
}

export function worldToPixel(x: number, y: number, cw: number, ch: number): Vec2World {
  const scale = 2.35 / Math.min(cw, ch);
  return {
    x: x / scale + cw / 2,
    y: -y / scale + ch / 2
  };
}

export function clampChargeToBoundary(
  c: PointCharge,
  boundary: BoundaryMode,
  yPlane: number,
  eps = 0.012
): PointCharge {
  if (boundary !== "grounded_plane") {
    return c;
  }
  const minY = yPlane + eps;
  if (c.y >= minY) {
    return c;
  }
  return { ...c, y: minY };
}

export function effectiveCharges(
  charges: PointCharge[],
  boundary: BoundaryMode,
  yPlane: number
): { x: number; y: number; q: number }[] {
  if (boundary === "free") {
    return charges.map((c) => ({ x: c.x, y: c.y, q: c.q }));
  }
  const out: { x: number; y: number; q: number }[] = [];
  for (const c of charges) {
    out.push({ x: c.x, y: c.y, q: c.q });
    if (c.y > yPlane + 1e-9) {
      out.push({ x: c.x, y: 2 * yPlane - c.y, q: -c.q });
    }
  }
  return out;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function potentialAt(
  x: number,
  y: number,
  charges: PointCharge[],
  params: EMFieldsSimParams
): number {
  const { kCoulomb, softening, boundary, yPlane } = params;
  const a2 = softening * softening;
  const ecs = effectiveCharges(charges, boundary, yPlane);
  let phi = 0;
  for (const c of ecs) {
    const r2 = distSq(x, y, c.x, c.y) + a2;
    phi += (kCoulomb * c.q) / Math.sqrt(r2);
  }
  return phi;
}

export function fieldAt(
  x: number,
  y: number,
  charges: PointCharge[],
  params: EMFieldsSimParams
): Vec2World {
  const { kCoulomb, softening, boundary, yPlane } = params;
  const a2 = softening * softening;
  const ecs = effectiveCharges(charges, boundary, yPlane);
  let ex = 0;
  let ey = 0;
  for (const c of ecs) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy + a2;
    const inv = (kCoulomb * c.q) / (r2 * Math.sqrt(r2));
    ex += dx * inv;
    ey += dy * inv;
  }
  return { x: ex, y: ey };
}

export function magnitude(v: Vec2World): number {
  return Math.hypot(v.x, v.y);
}

export function normalizeField(v: Vec2World): Vec2World {
  const m = magnitude(v);
  if (m < 1e-14) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / m, y: v.y / m };
}

export type PhiGrid = {
  nx: number;
  ny: number;
  values: Float32Array;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
};

export function samplePotentialGrid(
  charges: PointCharge[],
  params: EMFieldsSimParams,
  nx: number,
  ny: number,
  margin = 0.08
): PhiGrid {
  const xmin = -1.12 - margin;
  const xmax = 1.12 + margin;
  const ymin = -1.12 - margin;
  const ymax = 1.12 + margin;
  const values = new Float32Array(nx * ny);
  let i = 0;
  for (let j = 0; j < ny; j++) {
    const y = ymax - (j / Math.max(1, ny - 1)) * (ymax - ymin);
    for (let ix = 0; ix < nx; ix++) {
      const fx = ix / Math.max(1, nx - 1);
      const x = xmin + fx * (xmax - xmin);
      values[i++] = potentialAt(x, y, charges, params);
    }
  }
  return { nx, ny, values, xmin, xmax, ymin, ymax };
}

function phiRange(grid: PhiGrid): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < grid.values.length; i++) {
    const v = grid.values[i]!;
    if (v < lo) {
      lo = v;
    }
    if (v > hi) {
      hi = v;
    }
  }
  const ext = Math.max(Math.abs(lo), Math.abs(hi), 1e-6);
  return { lo: -ext, hi: ext };
}

export function phiRangeForRender(grid: PhiGrid): { lo: number; hi: number } {
  return phiRange(grid);
}

const MAX_STEPS = 900;
const STEP_BASE = 0.014;

export function traceFieldLine(
  startX: number,
  startY: number,
  charges: PointCharge[],
  params: EMFieldsSimParams,
  opts: {
    hitChargeR: number;
    worldLimit: number;
  }
): Vec2World[] {
  const line: Vec2World[] = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;

  for (let step = 0; step < MAX_STEPS; step++) {
    const E = fieldAt(x, y, charges, params);
    const dir = normalizeField(E);
    if (dir.x === 0 && dir.y === 0) {
      break;
    }

    const nearQ = charges.some((c) => {
      const d = Math.sqrt(distSq(x, y, c.x, c.y));
      return c.q < 0 && d < opts.hitChargeR * 1.2;
    });
    const stepLen = nearQ ? STEP_BASE * 0.35 : STEP_BASE;
    x += dir.x * stepLen;
    y += dir.y * stepLen;

    if (params.boundary === "grounded_plane" && y <= params.yPlane) {
      const prev = line[line.length - 1]!;
      const t = (params.yPlane - prev.y) / (y - prev.y + 1e-14);
      const clippedX = prev.x + t * (x - prev.x);
      line.push({ x: clippedX, y: params.yPlane });
      break;
    }

    if (Math.abs(x) > opts.worldLimit || Math.abs(y) > opts.worldLimit) {
      line.push({ x, y });
      break;
    }

    for (const c of charges) {
      if (c.q >= 0) {
        continue;
      }
      if (Math.sqrt(distSq(x, y, c.x, c.y)) < opts.hitChargeR) {
        line.push({ x: c.x, y: c.y });
        return line;
      }
    }

    line.push({ x, y });
  }
  return line;
}

export function computeFieldLines(
  charges: PointCharge[],
  params: EMFieldsSimParams,
  seedsPerPositive = 14
): Vec2World[][] {
  const lines: Vec2World[][] = [];
  const hitChargeR = 0.055;
  const worldLimit = 1.35;

  for (const c of charges) {
    if (c.q <= 0) {
      continue;
    }
    if (params.boundary === "grounded_plane" && c.y <= params.yPlane + 0.01) {
      continue;
    }
    for (let s = 0; s < seedsPerPositive; s++) {
      const ang = (s / seedsPerPositive) * Math.PI * 2;
      const ox = Math.cos(ang) * params.softening * 2.8;
      const oy = Math.sin(ang) * params.softening * 2.8;
      const sx = c.x + ox;
      const sy = c.y + oy;
      if (params.boundary === "grounded_plane" && sy <= params.yPlane + 1e-4) {
        continue;
      }
      lines.push(traceFieldLine(sx, sy, charges, params, { hitChargeR, worldLimit }));
    }
  }
  return lines;
}

let nextId = 1;
export function newChargeId(): string {
  return `q${nextId++}`;
}

export function presetCharges(id: EMFieldsPresetId, yPlane: number): PointCharge[] {
  switch (id) {
    case "dipole":
      return [
        { id: newChargeId(), x: -0.28, y: 0.12, q: 1 },
        { id: newChargeId(), x: 0.28, y: 0.12, q: -1 }
      ];
    case "near_plane":
      return [{ id: newChargeId(), x: 0, y: yPlane + 0.42, q: 1 }];
    case "two_like":
      return [
        { id: newChargeId(), x: -0.32, y: 0.08, q: 1 },
        { id: newChargeId(), x: 0.32, y: 0.08, q: 1 }
      ];
    case "quadrupole":
      return [
        { id: newChargeId(), x: -0.22, y: 0.2, q: 1 },
        { id: newChargeId(), x: 0.22, y: 0.2, q: -1 },
        { id: newChargeId(), x: -0.22, y: -0.12, q: -1 },
        { id: newChargeId(), x: 0.22, y: -0.12, q: 1 }
      ];
    default:
      return [];
  }
}

export function hitTestCharge(
  wx: number,
  wy: number,
  charges: PointCharge[],
  cw: number,
  ch: number,
  pixelHitR = 18
): PointCharge | null {
  const scale = 2.35 / Math.min(cw, ch);
  const worldHitR = pixelHitR * scale;
  let best: PointCharge | null = null;
  let bestD = Infinity;
  for (const c of charges) {
    const d = Math.hypot(wx - c.x, wy - c.y);
    if (d < worldHitR && d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function hitTestNearTestCharge(
  wx: number,
  wy: number,
  tx: number,
  ty: number,
  cw: number,
  ch: number,
  pixelHitR = 16
): boolean {
  const scale = 2.35 / Math.min(cw, ch);
  const worldHitR = pixelHitR * scale;
  return Math.hypot(wx - tx, wy - ty) < worldHitR;
}
