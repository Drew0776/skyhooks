export type Role = 'ADMIN' | 'CRANE_OPERATOR' | 'SHEAR_OPERATOR' | 'BENDER';

export type BundleStatus = 'STAGED' | 'RACKED' | 'LOADED' | 'BENDING' | 'COATED' | 'REJECTED';

export type SteelGrade = 'Epoxy' | 'Black';

export type TrailerSize = 'Flatbed' | 'Step Deck' | 'Double Drop' | 'Conestoga';

export interface Bundle {
  id: string;
  tagId: string; // e.g. TG-101
  jobId: string; // e.g. JOB-8821
  mark: string; // e.g. 4B12
  grade: SteelGrade;
  barSize: number; // e.g. 4, 5, 8, 11
  length: number; // feet
  weight: number; // lbs
  pieces: number;
  status: BundleStatus;
  location: string; // e.g. Rack J-04, Coat-Station, Door-1, Bender-New-Robo
  specification: 'ASTM_A775' | 'ASTM_A934' | 'BLACK_CARBON';
  shippingDate: string; // ISO date
  stagedAt?: string; // ISO timestamp
  door?: string;
  trailerSize?: TrailerSize;
  shapeCode?: string; // e.g. 00 (straight), 11 (stirrup), 21 (L-hook), 51 (spiral)
  heatNumber?: string; // Steel cert number e.g. H-99412
  coatingThicknessMils?: number; // e.g. 10.5 mils
  updatedAt: string;
}

export interface Job {
  id: string; // JOB-8821
  customerName: string;
  projectName: string;
  totalBundles: number;
  completedBundles: number;
  totalWeightLbs: number;
  targetDeliveryDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  priority: 'CRITICAL' | 'HIGH' | 'STANDARD';
}

export interface Operator {
  id: string;
  name: string;
  role: Role;
  station: string; // e.g. Gantry Crane 1, Shear Station 2, Bender 11
  activeShift: '1st Shift' | '2nd Shift';
}

export interface QualityAudit {
  coatingDamagePct: number; // max 2% threshold
  damagedFootSection: string;
  inspectorName: string;
  inspectionDate: string;
}

export interface Exception {
  id: string;
  timestamp: string;
  tagId: string;
  operatorName: string;
  type: 'Quality Audit' | 'Equipment Incident' | 'Material Misplacement' | 'ASTM UV Hazard';
  description: string;
  status: 'OPEN' | 'RESOLVED';
  resolvedAt?: string;
  resolvedBy?: string;
  qualityAudit?: QualityAudit;
}

export interface ShiftMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  shift: '1st Shift' | '2nd Shift';
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  tagId: string;
  operatorName: string;
  action: string;
  fromLocation: string;
  toLocation: string;
  details?: string;
}

export interface RouteObstruction {
  zoneId: string;
  name: string;
  type: 'CRITICAL' | 'CONSTRAINT' | 'PROXIMITY';
  reason: string;
  desc: string;
}
