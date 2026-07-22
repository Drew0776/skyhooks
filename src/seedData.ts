import { Bundle, Job, Operator, Exception, ShiftMessage, ActivityEvent } from './types';

export const INITIAL_BUNDLES: Bundle[] = [
  {
    id: 'b-1',
    tagId: 'TG-101',
    jobId: 'JOB-8821',
    mark: '5A12',
    grade: 'Epoxy',
    barSize: 5,
    length: 40,
    weight: 4172,
    pieces: 100,
    status: 'RACKED',
    location: 'Rack J-04',
    specification: 'ASTM_A775',
    shippingDate: '2026-07-25',
    stagedAt: '2026-07-01T08:00:00Z', // >20 days outdoor
    shapeCode: '00',
    heatNumber: 'H-98841',
    coatingThicknessMils: 10.2,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'b-2',
    tagId: 'TG-102',
    jobId: 'JOB-8821',
    mark: '5A13',
    grade: 'Epoxy',
    barSize: 5,
    length: 30,
    weight: 3129,
    pieces: 100,
    status: 'RACKED',
    location: 'Rack J-12',
    specification: 'ASTM_A775',
    shippingDate: '2026-07-25',
    stagedAt: '2026-06-25T10:00:00Z', // 27 days outdoor UV warning!
    shapeCode: '11',
    heatNumber: 'H-98841',
    coatingThicknessMils: 11.0,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'b-3',
    tagId: 'TG-201',
    jobId: 'JOB-8822',
    mark: '8C04',
    grade: 'Epoxy',
    barSize: 8,
    length: 60,
    weight: 16020,
    pieces: 100,
    status: 'STAGED',
    location: 'Coat-Station',
    specification: 'ASTM_A934',
    shippingDate: '2026-07-23',
    stagedAt: new Date().toISOString(),
    shapeCode: '21',
    heatNumber: 'H-99104',
    coatingThicknessMils: 12.4,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'b-4',
    tagId: 'TG-301',
    jobId: 'JOB-8823',
    mark: '11D01',
    grade: 'Black',
    barSize: 11,
    length: 60,
    weight: 31878,
    pieces: 100,
    status: 'STAGED',
    location: 'Raw-SW',
    specification: 'BLACK_CARBON',
    shippingDate: '2026-07-24',
    stagedAt: new Date().toISOString(),
    shapeCode: '00',
    heatNumber: 'H-92110',
    coatingThicknessMils: 0,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'b-5',
    tagId: 'TG-302',
    jobId: 'JOB-8823',
    mark: '11D02',
    grade: 'Black',
    barSize: 11,
    length: 60,
    weight: 31878,
    pieces: 100,
    status: 'BENDING',
    location: 'Bender-11-Bender',
    specification: 'BLACK_CARBON',
    shippingDate: '2026-07-24',
    stagedAt: new Date().toISOString(),
    shapeCode: '51',
    heatNumber: 'H-92110',
    coatingThicknessMils: 0,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'b-6',
    tagId: 'TG-103',
    jobId: 'JOB-8821',
    mark: '4A08',
    grade: 'Epoxy',
    barSize: 4,
    length: 20,
    weight: 1336,
    pieces: 100,
    status: 'LOADED',
    location: 'Door-1',
    door: 'Door-1',
    trailerSize: 'Flatbed',
    specification: 'ASTM_A775',
    shippingDate: '2026-07-22',
    stagedAt: new Date().toISOString(),
    shapeCode: '11',
    heatNumber: 'H-98841',
    coatingThicknessMils: 9.8,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'b-7',
    tagId: 'TG-401',
    jobId: 'JOB-8824',
    mark: '6B02',
    grade: 'Epoxy',
    barSize: 6,
    length: 40,
    weight: 6008,
    pieces: 100,
    status: 'RACKED',
    location: 'Rack K-1',
    specification: 'ASTM_A775',
    shippingDate: '2026-07-26',
    stagedAt: new Date().toISOString(),
    shapeCode: '00',
    heatNumber: 'H-97420',
    coatingThicknessMils: 10.8,
    updatedAt: new Date().toISOString()
  }
];

export const INITIAL_JOBS: Job[] = [
  {
    id: 'JOB-8821',
    customerName: 'Mortenson Construction',
    projectName: 'I-94 Bridge Overpass Expansion',
    totalBundles: 3,
    completedBundles: 1,
    totalWeightLbs: 8637,
    targetDeliveryDate: '2026-07-25',
    status: 'IN_PROGRESS',
    priority: 'HIGH'
  },
  {
    id: 'JOB-8822',
    customerName: 'Kraus-Anderson',
    projectName: 'Saint Paul Water Treatment Vaults',
    totalBundles: 1,
    completedBundles: 0,
    totalWeightLbs: 16020,
    targetDeliveryDate: '2026-07-23',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL'
  },
  {
    id: 'JOB-8823',
    customerName: 'Ames Construction',
    projectName: 'MnDOT Rail Terminal Abutments',
    totalBundles: 2,
    completedBundles: 0,
    totalWeightLbs: 63756,
    targetDeliveryDate: '2026-07-24',
    status: 'IN_PROGRESS',
    priority: 'STANDARD'
  },
  {
    id: 'JOB-8824',
    customerName: 'McGough Companies',
    projectName: 'U of M Medical Tower Substructure',
    totalBundles: 1,
    completedBundles: 0,
    totalWeightLbs: 6008,
    targetDeliveryDate: '2026-07-26',
    status: 'PENDING',
    priority: 'STANDARD'
  }
];

export const INITIAL_OPERATORS: Operator[] = [
  { id: 'op-1', name: 'Dave Miller', role: 'ADMIN', station: 'Control Room A', activeShift: '1st Shift' },
  { id: 'op-2', name: 'Jake Vance', role: 'CRANE_OPERATOR', station: 'Gantry Crane 1 (NW/NE)', activeShift: '1st Shift' },
  { id: 'op-3', name: 'Marcus Cole', role: 'SHEAR_OPERATOR', station: 'Shear Center', activeShift: '1st Shift' },
  { id: 'op-4', name: 'Sarah Lin', role: 'BENDER', station: 'New-Robo CNC Bender', activeShift: '1st Shift' }
];

export const INITIAL_EXCEPTIONS: Exception[] = [
  {
    id: 'EX-101',
    timestamp: '2026-07-22T08:15:00Z',
    tagId: 'TG-102',
    operatorName: 'Jake Vance',
    type: 'ASTM UV Hazard',
    description: 'Bundle TG-102 has been staged in outdoor Rack J-12 for 27 days. ASTM A775 specifies maximum 30 days UV exposure without protective tarps.',
    status: 'OPEN'
  },
  {
    id: 'EX-102',
    timestamp: '2026-07-21T14:30:00Z',
    tagId: 'TG-301',
    operatorName: 'Marcus Cole',
    type: 'Quality Audit',
    description: 'Initial shear edge burr noticed on #11 carbon bar. Blade clearance recalibrated to 0.012 inches.',
    status: 'RESOLVED',
    resolvedAt: '2026-07-21T15:00:00Z',
    resolvedBy: 'Marcus Cole'
  }
];

export const INITIAL_SHIFT_MESSAGES: ShiftMessage[] = [
  {
    id: 'SM-1',
    sender: 'Dave Miller (1st Shift Supervisor)',
    content: 'All Northwest gantry hoist cables inspected and lubricated. High volume of #5 epoxy bar arriving for Mortenson I-94 job at 11:00 AM.',
    timestamp: '2026-07-22T06:30:00Z',
    shift: '1st Shift'
  },
  {
    id: 'SM-2',
    sender: 'Jake Vance (Crane Op)',
    content: 'Gantry SE rail sensors cleared of steel debris. Smooth travel restored near Door 7.',
    timestamp: '2026-07-22T07:45:00Z',
    shift: '1st Shift'
  }
];

export const INITIAL_ACTIVITY: ActivityEvent[] = [
  {
    id: 'AC-1',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    tagId: 'TG-103',
    operatorName: 'Jake Vance',
    action: 'FORCED_LOAD',
    fromLocation: 'Coat-Station',
    toLocation: 'Door-1',
    details: 'Loaded onto Flatbed trailer for Mortenson Bridge Overpass order.'
  },
  {
    id: 'AC-2',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    tagId: 'TG-302',
    operatorName: 'Sarah Lin',
    action: 'BENDING_START',
    fromLocation: 'Raw-SW',
    toLocation: 'Bender-11-Bender',
    details: 'Initiated #11 spiral bending program.'
  }
];
