import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppletHostAdapter } from "../../core/host";
import { ControlCard } from "../../ui/ControlCard";
import { renderEMFieldsScene } from "./render";
import {
  clampChargeToBoundary,
  computeFieldLines,
  DEFAULT_SIM_PARAMS,
  DEFAULT_Y_PLANE,
  hitTestCharge,
  hitTestNearTestCharge,
  newChargeId,
  pixelToWorld,
  presetCharges,
  phiRangeForRender,
  samplePotentialGrid
} from "./sim";
import type { BoundaryMode, EMFieldsPresetId, PointCharge } from "./types";

type Props = {
  host?: AppletHostAdapter;
};

const TIP = {
  sign: "Choose the sign of the next inserted charge.",
  boundary:
    "Free space has no conductor.\nGrounded plane enforces zero potential on the surface (method of images).",
  equip: "Color bands of equal electric potential (symmetric scale around zero).",
  field: "Lines tangent to the electric field direction.",
  test: "Shows a small probe charge and the local force direction (qE).",
  delete: "Remove the selected charge.\nClick a charge to select it.",
  reset: "Clear the canvas and restore a simple default pair of charges.",
  canvas: "Click empty space to place a charge.\nDrag charges to move them.\nWith test charge on, drag the probe.",
  presetDipole: "Equal and opposite charges side by side.",
  presetPlane: "Single positive charge above the grounded plane (switch boundary to grounded plane to compare).",
  presetTwoLike: "Two positive charges — field lines repel between them.",
  presetQuad: "Four charges in a quadrupole-style arrangement."
} as const;

const PRESETS: { id: EMFieldsPresetId; label: string; tip: string }[] = [
  { id: "dipole", label: "Dipole", tip: TIP.presetDipole },
  { id: "near_plane", label: "Near plane", tip: TIP.presetPlane },
  { id: "two_like", label: "Two like", tip: TIP.presetTwoLike },
  { id: "quadrupole", label: "Quadrupole", tip: TIP.presetQuad }
];

function defaultCharges(): PointCharge[] {
  return [
    { id: newChargeId(), x: -0.25, y: 0.1, q: 1 },
    { id: newChargeId(), x: 0.25, y: 0.1, q: -1 }
  ];
}

export function EMFieldsConductorsCanvas({ host }: Props): JSX.Element {
  void host;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  const [charges, setCharges] = useState<PointCharge[]>(defaultCharges);
  const [boundary, setBoundary] = useState<BoundaryMode>("free");
  const [nextSign, setNextSign] = useState<1 | -1>(1);
  const [showField, setShowField] = useState(true);
  const [showEquip, setShowEquip] = useState(true);
  const [showTest, setShowTest] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testPos, setTestPos] = useState<{ x: number; y: number }>({ x: 0.05, y: 0.38 });

  const dragRef = useRef<
    | { kind: "charge"; id: string; startPx: { x: number; y: number } }
    | { kind: "test"; startPx: { x: number; y: number } }
    | { kind: "tap"; startPx: { x: number; y: number } }
    | null
  >(null);

  const interactionRef = useRef({
    charges,
    testPos,
    showTest,
    boundary,
    nextSign
  });
  interactionRef.current = { charges, testPos, showTest, boundary, nextSign };

  const simParams = useMemo(
    () => ({
      ...DEFAULT_SIM_PARAMS,
      boundary,
      yPlane: DEFAULT_Y_PLANE
    }),
    [boundary]
  );

  const clampedCharges = useMemo(
    () => charges.map((c) => clampChargeToBoundary(c, boundary, DEFAULT_Y_PLANE)),
    [charges, boundary]
  );

  const { phiGrid, phiLo, phiHi, fieldLines } = useMemo(() => {
    const grid = samplePotentialGrid(clampedCharges, simParams, 128, 96);
    const { lo, hi } = phiRangeForRender(grid);
    const lines = showField ? computeFieldLines(clampedCharges, simParams) : [];
    return { phiGrid: grid, phiLo: lo, phiHi: hi, fieldLines: lines };
  }, [clampedCharges, simParams, showField]);

  useEffect(() => {
    setCharges((prev) => prev.map((c) => clampChargeToBoundary(c, boundary, DEFAULT_Y_PLANE)));
    setTestPos((p) => {
      const t = clampChargeToBoundary({ id: "t", ...p, q: 1 }, boundary, DEFAULT_Y_PLANE);
      return { x: t.x, y: t.y };
    });
  }, [boundary]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const cw = canvas.width;
    const ch = canvas.height;
    renderEMFieldsScene(
      ctx,
      showEquip ? phiGrid : null,
      phiLo,
      phiHi,
      fieldLines,
      clampedCharges,
      simParams,
      {
        showEquipotential: showEquip,
        showFieldLines: showField,
        showTestCharge: showTest,
        testChargePos: testPos,
        testChargeQ: 1,
        boundary,
        yPlane: DEFAULT_Y_PLANE,
        selectedId,
        cw,
        ch
      }
    );
  }, [
    phiGrid,
    phiLo,
    phiHi,
    fieldLines,
    clampedCharges,
    simParams,
    showEquip,
    showField,
    showTest,
    testPos,
    boundary,
    selectedId
  ]);

  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      redraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [redraw]);

  useEffect(() => {
    const root = layoutRef.current;
    if (!root) {
      return;
    }
    const tooltip = document.createElement("div");
    tooltip.className = "hover-help-tooltip";
    document.body.appendChild(tooltip);

    const placeTooltip = (x: number, y: number): void => {
      const offset = 14;
      const maxX = window.innerWidth - tooltip.offsetWidth - 8;
      const maxY = window.innerHeight - tooltip.offsetHeight - 8;
      const left = Math.min(Math.max(8, x + offset), Math.max(8, maxX));
      const top = Math.min(Math.max(8, y + offset), Math.max(8, maxY));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const onMouseMove = (event: Event): void => {
      const mouseEvent = event as MouseEvent;
      const target = mouseEvent.target as HTMLElement | null;
      const hintTarget = target?.closest?.("[data-hover-help]") as HTMLElement | null;
      if (!hintTarget || !root.contains(hintTarget)) {
        tooltip.classList.remove("visible");
        return;
      }
      const hint = hintTarget.getAttribute("data-hover-help");
      if (!hint) {
        tooltip.classList.remove("visible");
        return;
      }
      tooltip.textContent = hint;
      tooltip.classList.add("visible");
      placeTooltip(mouseEvent.clientX, mouseEvent.clientY);
    };

    const onMouseLeave = (): void => {
      tooltip.classList.remove("visible");
    };

    root.addEventListener("mousemove", onMouseMove);
    root.addEventListener("mouseleave", onMouseLeave);
    return () => {
      root.removeEventListener("mousemove", onMouseMove);
      root.removeEventListener("mouseleave", onMouseLeave);
      tooltip.remove();
    };
  }, []);

  const canvasPoint = useCallback((event: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    function onPointerDown(e: PointerEvent): void {
      const c = canvasRef.current;
      if (!c) {
        return;
      }
      const ir = interactionRef.current;
      const px = canvasPoint(e, c);
      const cw = c.width;
      const ch = c.height;
      const w = pixelToWorld(px.x, px.y, cw, ch);

      if (ir.showTest && hitTestNearTestCharge(w.x, w.y, ir.testPos.x, ir.testPos.y, cw, ch)) {
        dragRef.current = { kind: "test", startPx: px };
        setSelectedId(null);
        c.setPointerCapture(e.pointerId);
        return;
      }

      const list = ir.charges.map((q) => clampChargeToBoundary(q, ir.boundary, DEFAULT_Y_PLANE));
      const hit = hitTestCharge(w.x, w.y, list, cw, ch);
      if (hit) {
        dragRef.current = { kind: "charge", id: hit.id, startPx: px };
        setSelectedId(hit.id);
        c.setPointerCapture(e.pointerId);
        return;
      }

      dragRef.current = { kind: "tap", startPx: px };
      setSelectedId(null);
      c.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent): void {
      const c = canvasRef.current;
      const d = dragRef.current;
      if (!c || !d) {
        return;
      }
      const ir = interactionRef.current;
      const px = canvasPoint(e, c);
      const cw = c.width;
      const ch = c.height;
      const w = pixelToWorld(px.x, px.y, cw, ch);

      if (d.kind === "charge") {
        setCharges((prev) =>
          prev.map((q) =>
            q.id === d.id
              ? clampChargeToBoundary({ ...q, x: w.x, y: w.y }, ir.boundary, DEFAULT_Y_PLANE)
              : q
          )
        );
      } else if (d.kind === "test") {
        const t = clampChargeToBoundary({ id: "t", x: w.x, y: w.y, q: 1 }, ir.boundary, DEFAULT_Y_PLANE);
        setTestPos({ x: t.x, y: t.y });
      }
    }

    function endPointer(e: PointerEvent): void {
      const c = canvasRef.current;
      const d = dragRef.current;
      dragRef.current = null;
      if (c) {
        try {
          c.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
      if (!c || !d || d.kind !== "tap") {
        return;
      }
      const ir = interactionRef.current;
      const px = canvasPoint(e, c);
      const dx = px.x - d.startPx.x;
      const dy = px.y - d.startPx.y;
      if (Math.hypot(dx, dy) > 7) {
        return;
      }
      const cw = c.width;
      const ch = c.height;
      const w = pixelToWorld(px.x, px.y, cw, ch);
      const list = ir.charges.map((q) => clampChargeToBoundary(q, ir.boundary, DEFAULT_Y_PLANE));
      const hit = hitTestCharge(w.x, w.y, list, cw, ch);
      if (hit) {
        return;
      }
      const nc: PointCharge = clampChargeToBoundary(
        { id: newChargeId(), x: w.x, y: w.y, q: ir.nextSign },
        ir.boundary,
        DEFAULT_Y_PLANE
      );
      setCharges((prev) => [...prev, nc]);
      setSelectedId(nc.id);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
    };
  }, [canvasPoint]);

  function applyPreset(id: EMFieldsPresetId): void {
    const list = presetCharges(id, DEFAULT_Y_PLANE).map((c) =>
      clampChargeToBoundary(c, boundary, DEFAULT_Y_PLANE)
    );
    setCharges(list);
    setSelectedId(list[0]?.id ?? null);
  }

  function onReset(): void {
    setCharges(defaultCharges());
    setSelectedId(null);
    setTestPos({ x: 0.05, y: 0.38 });
  }

  function onDeleteSelected(): void {
    if (!selectedId) {
      return;
    }
    setCharges((prev) => prev.filter((c) => c.id !== selectedId));
    setSelectedId(null);
  }

  const subtitle = (
    <>
      <p style={{ margin: "0 0 0.35rem" }}>2D slice, 1/r potential (softened near singularities)</p>
      <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.5 }}>
        <li>Click empty space to add a charge</li>
        <li>Drag charges; grounded plane uses image charges</li>
        <li>Hover controls for short explanations</li>
      </ul>
    </>
  );

  return (
    <div ref={layoutRef} className="gravity-layout">
      <div className="panel-stack" style={{ display: "grid", gap: "0.85rem", alignContent: "start" }}>
        <ControlCard title="Fields and conductors: geometry shapes physics" subtitle={subtitle}>
          <div className="control-grid">
            <label className="control-span-2" title={TIP.sign} data-hover-help={TIP.sign}>
              <span className="slider-label">
                <span>Charge sign</span>
                <strong>{nextSign > 0 ? "+" : "−"}</strong>
              </span>
              <select
                value={nextSign}
                onChange={(e) => setNextSign(Number(e.target.value) as 1 | -1)}
                aria-label="Sign for next charge"
              >
                <option value={1}>Positive</option>
                <option value={-1}>Negative</option>
              </select>
            </label>

            <label className="checkbox control-span-2" title={TIP.field} data-hover-help={TIP.field}>
              <input type="checkbox" checked={showField} onChange={(e) => setShowField(e.target.checked)} />
              Show field lines
            </label>
            <label className="checkbox control-span-2" title={TIP.equip} data-hover-help={TIP.equip}>
              <input type="checkbox" checked={showEquip} onChange={(e) => setShowEquip(e.target.checked)} />
              Show equipotentials
            </label>
            <label className="checkbox control-span-2" title={TIP.test} data-hover-help={TIP.test}>
              <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />
              Show test charge
            </label>

            <label className="control-span-2" title={TIP.boundary} data-hover-help={TIP.boundary}>
              <span className="slider-label">
                <span>Boundary model</span>
              </span>
              <select
                value={boundary}
                onChange={(e) => setBoundary(e.target.value as BoundaryMode)}
                aria-label="Boundary model"
              >
                <option value="free">Free space</option>
                <option value="grounded_plane">Grounded plane</option>
              </select>
            </label>

            <div className="control-section control-span-2">
              <div className="section-title">Presets</div>
              <div className="control-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.tip}
                    data-hover-help={p.tip}
                    onClick={() => applyPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="button-row control-span-2">
              <button type="button" title={TIP.delete} data-hover-help={TIP.delete} onClick={onDeleteSelected} disabled={!selectedId}>
                Delete selected
              </button>
              <button type="button" title={TIP.reset} data-hover-help={TIP.reset} onClick={onReset}>
                Reset
              </button>
            </div>

            <details className="control-span-2 control-section" style={{ borderTop: "none" }}>
              <summary className="section-title" style={{ cursor: "pointer", listStyle: "none" }}>
                Physics hints
              </summary>
              <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.5 }}>
                <li>Field lines start on positive charges and end on negative charges or at infinity.</li>
                <li>Equipotentials meet field lines at right angles.</li>
                <li>Conductor surfaces are equipotentials; grounded means fixed at zero potential.</li>
              </ul>
            </details>
          </div>
        </ControlCard>
      </div>

      <div className="canvas-shell card">
        <div title={TIP.canvas} data-hover-help={TIP.canvas}>
          <canvas
            ref={canvasRef}
            width={880}
            height={600}
            style={{ display: "block", width: "100%", height: "auto", touchAction: "none" }}
          />
        </div>
        <p className="subtle" style={{ margin: "0.45rem 0 0", fontSize: "0.78rem", lineHeight: 1.45 }}>
          Grounded plane: metallic region is the half-space below the line; real charges are kept above it. The solver
          adds opposite image charges below the surface.
        </p>
      </div>
    </div>
  );
}
