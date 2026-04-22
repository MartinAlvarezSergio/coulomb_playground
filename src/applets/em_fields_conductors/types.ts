export type BoundaryMode = "free" | "grounded_plane";

export type PointCharge = {
  id: string;
  x: number;
  y: number;
  q: number;
};

export type EMFieldsPresetId = "dipole" | "near_plane" | "two_like" | "quadrupole";

export type EMFieldsSimParams = {
  boundary: BoundaryMode;
  yPlane: number;
  softening: number;
  kCoulomb: number;
};
