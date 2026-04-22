import type { BoundaryMode, EMFieldsSimParams, PointCharge } from "./types";
import { fieldAt, magnitude, worldToPixel } from "./sim";
import type { PhiGrid, Vec2World } from "./sim";

export type EMFieldsRenderOptions = {
  showEquipotential: boolean;
  showFieldLines: boolean;
  showTestCharge: boolean;
  testChargePos: Vec2World;
  testChargeQ: number;
  boundary: BoundaryMode;
  yPlane: number;
  selectedId: string | null;
  cw: number;
  ch: number;
};

function divergingColor(t: number): [number, number, number] {
  const x = Math.max(-1, Math.min(1, t));
  if (x < 0) {
    const u = -x;
    const r = Math.round(40 + u * 40);
    const g = Math.round(55 + u * 75);
    const b = Math.round(95 + u * 110);
    return [r, g, b];
  }
  const u = x;
  const r = Math.round(200 + u * 55);
  const g = Math.round(100 + u * 60);
  const b = Math.round(70 - u * 35);
  return [r, g, b];
}

export function renderEquipotentialHeatmap(
  ctx: CanvasRenderingContext2D,
  grid: PhiGrid,
  lo: number,
  hi: number,
  cw: number,
  ch: number
): void {
  const { nx, ny, values, xmin, xmax, ymin, ymax } = grid;
  const ext = Math.max(Math.abs(lo), Math.abs(hi), 1e-9);
  const img = ctx.createImageData(nx, ny);
  const d = img.data;
  let p = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const phi = values[i + j * nx]!;
      const ts = phi / ext;
      const [r, g, b] = divergingColor(ts);
      d[p++] = r;
      d[p++] = g;
      d[p++] = b;
      d[p++] = 200;
    }
  }
  const off = document.createElement("canvas");
  off.width = nx;
  off.height = ny;
  const octx = off.getContext("2d");
  if (!octx) {
    return;
  }
  octx.putImageData(img, 0, 0);
  const scale = 2.35 / Math.min(cw, ch);
  const left = xmin / scale + cw / 2;
  const top = -ymax / scale + ch / 2;
  const width = (xmax - xmin) / scale;
  const height = (ymax - ymin) / scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, nx, ny, left, top, width, height);
  ctx.restore();
}

export function renderConductorRegion(
  ctx: CanvasRenderingContext2D,
  boundary: BoundaryMode,
  yPlane: number,
  cw: number,
  ch: number
): void {
  if (boundary !== "grounded_plane") {
    return;
  }
  const pPlane = worldToPixel(0, yPlane, cw, ch).y;
  ctx.fillStyle = "rgba(120, 122, 128, 0.42)";
  ctx.fillRect(0, pPlane, cw, ch - pPlane);
  const grad = ctx.createLinearGradient(0, pPlane - 28, 0, pPlane + 8);
  grad.addColorStop(0, "rgba(200, 202, 210, 0)");
  grad.addColorStop(1, "rgba(165, 168, 176, 0.35)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, pPlane - 28, cw, 36);
  ctx.strokeStyle = "rgba(230, 232, 238, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, pPlane);
  ctx.lineTo(cw, pPlane);
  ctx.stroke();
}

export function renderFieldLinesWorld(
  ctx: CanvasRenderingContext2D,
  lines: Vec2World[][],
  cw: number,
  ch: number
): void {
  ctx.strokeStyle = "rgba(245, 240, 230, 0.38)";
  ctx.lineWidth = 1.1;
  for (const ln of lines) {
    if (ln.length < 2) {
      continue;
    }
    ctx.beginPath();
    const p0 = worldToPixel(ln[0]!.x, ln[0]!.y, cw, ch);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ln.length; i++) {
      const pi = worldToPixel(ln[i]!.x, ln[i]!.y, cw, ch);
      ctx.lineTo(pi.x, pi.y);
    }
    ctx.stroke();
  }
}

export function renderCharges(
  ctx: CanvasRenderingContext2D,
  charges: PointCharge[],
  cw: number,
  ch: number,
  selectedId: string | null
): void {
  for (const c of charges) {
    const p = worldToPixel(c.x, c.y, cw, ch);
    const pos = c.q > 0;
    const r = c.q > 0 ? 11 : 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = pos ? "rgba(255, 155, 120, 0.95)" : "rgba(120, 185, 255, 0.95)";
    ctx.fill();
    ctx.strokeStyle = selectedId === c.id ? "rgba(255, 255, 255, 0.95)" : "rgba(30, 30, 35, 0.65)";
    ctx.lineWidth = selectedId === c.id ? 2.6 : 1.4;
    ctx.stroke();
    ctx.fillStyle = "rgba(20, 20, 24, 0.88)";
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pos ? "+" : "−", p.x, p.y + 0.5);
  }
}

export function renderTestCharge(
  ctx: CanvasRenderingContext2D,
  charges: PointCharge[],
  params: EMFieldsSimParams,
  pos: Vec2World,
  qTest: number,
  cw: number,
  ch: number
): void {
  const E = fieldAt(pos.x, pos.y, charges, params);
  const m = magnitude(E);
  const p = worldToPixel(pos.x, pos.y, cw, ch);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(210, 200, 255, 0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 35, 55, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (m < 1e-12) {
    return;
  }
  const arrowLen = 52 * Math.sign(qTest || 1);
  const fx = (E.x / m) * arrowLen;
  const fy = -(E.y / m) * arrowLen;
  ctx.strokeStyle = "rgba(255, 248, 220, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + fx, p.y + fy);
  ctx.stroke();
  const ah = 7;
  const ang = Math.atan2(fy, fx);
  ctx.beginPath();
  ctx.moveTo(p.x + fx, p.y + fy);
  ctx.lineTo(
    p.x + fx - ah * Math.cos(ang - 0.45),
    p.y + fy - ah * Math.sin(ang - 0.45)
  );
  ctx.lineTo(
    p.x + fx - ah * Math.cos(ang + 0.45),
    p.y + fy - ah * Math.sin(ang + 0.45)
  );
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 248, 220, 0.85)";
  ctx.fill();
}

export function renderEMFieldsScene(
  ctx: CanvasRenderingContext2D,
  grid: PhiGrid | null,
  phiLo: number,
  phiHi: number,
  fieldLines: Vec2World[][],
  charges: PointCharge[],
  simParams: EMFieldsSimParams,
  opt: EMFieldsRenderOptions
): void {
  const { cw, ch } = opt;
  ctx.clearRect(0, 0, cw, ch);

  if (opt.showEquipotential && grid) {
    renderEquipotentialHeatmap(ctx, grid, phiLo, phiHi, cw, ch);
  } else {
    ctx.fillStyle = "rgba(28, 29, 33, 0.92)";
    ctx.fillRect(0, 0, cw, ch);
  }

  renderConductorRegion(ctx, opt.boundary, opt.yPlane, cw, ch);

  if (opt.showFieldLines) {
    renderFieldLinesWorld(ctx, fieldLines, cw, ch);
  }

  renderCharges(ctx, charges, cw, ch, opt.selectedId);

  if (opt.showTestCharge) {
    renderTestCharge(ctx, charges, simParams, opt.testChargePos, opt.testChargeQ, cw, ch);
  }
}
