import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logicalPointer, setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import {
  StageIconButton,
  StagePillButton,
  StagePills,
  StageSegmented,
  StageToggle
} from "../../ui/stage/StageControls";
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
  samplePotentialGrid,
  visibleWorldBounds
} from "./sim";
import type { BoundaryMode, EMFieldsPresetId, PointCharge } from "./types";

type Props = {
  host?: AppletHostAdapter;
};

/** Logical canvas size: the world-to-pixel mapping and hit tests use these units. */
const CANVAS_W = 880;
const CANVAS_H = 600;
/** Sample the potential and trace field lines over the whole visible stage. */
const VIEW = visibleWorldBounds(CANVAS_W, CANVAS_H);
const FIELD_LINE_LIMIT = Math.max(VIEW.xmax, VIEW.ymax);

const TIP = {
  sign: "Sign of the next charge you place.",
  boundary:
    "Free space has no conductor.\nGrounded plane enforces zero potential on the surface (method of images).",
  equip: "Colour bands of equal electric potential (symmetric scale around zero).",
  field: "Lines tangent to the electric field direction.",
  test: "A small probe charge and the local force direction (qE). Drag it around.",
  delete: "Remove the selected charge. Click a charge to select it.",
  reset: "Clear the canvas and restore a simple default pair of charges.",
  presetDipole: "Equal and opposite charges side by side.",
  presetPlane: "Single positive charge above the grounded plane (switch the boundary to grounded plane to compare).",
  presetTwoLike: "Two positive charges: field lines repel between them.",
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
    const grid = samplePotentialGrid(clampedCharges, simParams, 176, 120, 0, VIEW);
    const { lo, hi } = phiRangeForRender(grid);
    const lines = showField ? computeFieldLines(clampedCharges, simParams, 14, FIELD_LINE_LIMIT) : [];
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
    const ctx = canvas?.getContext("2d");
    if (!ctx) {
      return;
    }
    setLogicalTransform(ctx, CANVAS_W);
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
        cw: CANVAS_W,
        ch: CANVAS_H
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
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const toLogical = (e: PointerEvent, c: HTMLCanvasElement): { x: number; y: number } =>
      logicalPointer(e, c, CANVAS_W, CANVAS_H);

    function onPointerDown(e: PointerEvent): void {
      const c = canvasRef.current;
      if (!c) {
        return;
      }
      const ir = interactionRef.current;
      const px = toLogical(e, c);
      const w = pixelToWorld(px.x, px.y, CANVAS_W, CANVAS_H);

      if (ir.showTest && hitTestNearTestCharge(w.x, w.y, ir.testPos.x, ir.testPos.y, CANVAS_W, CANVAS_H)) {
        dragRef.current = { kind: "test", startPx: px };
        setSelectedId(null);
        c.setPointerCapture(e.pointerId);
        return;
      }

      const list = ir.charges.map((q) => clampChargeToBoundary(q, ir.boundary, DEFAULT_Y_PLANE));
      const hit = hitTestCharge(w.x, w.y, list, CANVAS_W, CANVAS_H);
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
      const px = toLogical(e, c);
      const w = pixelToWorld(px.x, px.y, CANVAS_W, CANVAS_H);

      if (d.kind === "charge") {
        setCharges((prev) =>
          prev.map((q) =>
            q.id === d.id ? clampChargeToBoundary({ ...q, x: w.x, y: w.y }, ir.boundary, DEFAULT_Y_PLANE) : q
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
      const px = toLogical(e, c);
      // Logical pixels: a short drag on empty space still counts as a tap.
      if (Math.hypot(px.x - d.startPx.x, px.y - d.startPx.y) > 7) {
        return;
      }
      const w = pixelToWorld(px.x, px.y, CANVAS_W, CANVAS_H);
      const list = ir.charges.map((q) => clampChargeToBoundary(q, ir.boundary, DEFAULT_Y_PLANE));
      if (hitTestCharge(w.x, w.y, list, CANVAS_W, CANVAS_H)) {
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
  }, []);

  function applyPreset(id: EMFieldsPresetId): void {
    const list = presetCharges(id, DEFAULT_Y_PLANE).map((c) => clampChargeToBoundary(c, boundary, DEFAULT_Y_PLANE));
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

  const toolbar = (
    <>
      <StageIconButton icon="reset" label="Reset" tip={TIP.reset} onClick={onReset} />
      <StageIconButton icon="trash" label="Delete selected" tip={TIP.delete} disabled={!selectedId} onClick={onDeleteSelected} />
    </>
  );

  const controls = (
    <>
      <StageSegmented
        ariaLabel="Charge sign"
        label="Charge sign"
        tip={TIP.sign}
        value={nextSign}
        options={[
          { value: 1, label: "+ Positive" },
          { value: -1, label: "− Negative" }
        ]}
        onChange={setNextSign}
      />
      <StageSegmented
        ariaLabel="Boundary model"
        label="Boundary model"
        tip={TIP.boundary}
        value={boundary}
        options={[
          { value: "free", label: "Free space" },
          { value: "grounded_plane", label: "Grounded plane" }
        ]}
        onChange={setBoundary}
      />
      <StagePills>
        <StageToggle label="Field lines" on={showField} tip={TIP.field} onChange={setShowField} />
        <StageToggle label="Equipotentials" on={showEquip} tip={TIP.equip} onChange={setShowEquip} />
        <StageToggle label="Test charge" on={showTest} tip={TIP.test} onChange={setShowTest} />
      </StagePills>
      <div className="stage-pills stage-presets">
        {PRESETS.map((p) => (
          <StagePillButton key={p.id} label={p.label} tip={p.tip} onClick={() => applyPreset(p.id)} />
        ))}
      </div>
    </>
  );

  const info = (
    <>
      <h4>Using it</h4>
      <ul>
        <li>Click empty space to place a charge of the chosen sign; drag charges to move them.</li>
        <li>With the test charge on, drag the probe to see the force on it.</li>
      </ul>
      <h4>Physics hints</h4>
      <ul>
        <li>Field lines start on positive charges and end on negative charges or at infinity.</li>
        <li>Equipotentials meet field lines at right angles.</li>
        <li>Conductor surfaces are equipotentials; grounded means fixed at zero potential.</li>
      </ul>
      <h4>Model</h4>
      <ul>
        <li>2D slice with a 1/r potential, softened near each charge to avoid singularities.</li>
        <li>
          Grounded plane: the metal fills the half-space below the line and real charges stay above it. The solver adds an
          opposite image charge below the surface for each real charge.
        </li>
      </ul>
    </>
  );

  return (
    <AppletStage
      logicalWidth={CANVAS_W}
      logicalHeight={CANVAS_H}
      canvasRef={canvasRef}
      canvasLabel="Electric field lines and equipotentials around point charges"
      canvasProps={{ style: { touchAction: "none", cursor: "crosshair" } }}
      toolbar={toolbar}
      controls={controls}
      info={info}
    />
  );
}
