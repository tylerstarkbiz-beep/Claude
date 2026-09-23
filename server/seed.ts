// Demo data so the app is useful on first launch. Run `npm run seed` to reset.
import { resolve } from 'node:path';
import { openDb, tx, type DB } from './db.ts';
import type { AutomationAction, AutomationTrigger, FieldDef } from '../shared/types.ts';

const DIVISIONS: { name: string; slug: string; prefix: string; color: string; icon: string; fields: FieldDef[] }[] = [
  {
    name: 'Restoration',
    slug: 'restoration',
    prefix: 'RST',
    color: '#e2445c',
    icon: 'droplets',
    fields: [
      { key: 'lossType', label: 'Loss type', type: 'select', options: ['Water', 'Fire', 'Mold', 'Storm', 'Sewage'] },
      { key: 'insuranceCarrier', label: 'Insurance carrier', type: 'text' },
      { key: 'claimNumber', label: 'Claim #', type: 'text' },
      { key: 'adjuster', label: 'Adjuster', type: 'text' },
      { key: 'dateOfLoss', label: 'Date of loss', type: 'date' },
      { key: 'affectedAreas', label: 'Affected areas', type: 'textarea' },
    ],
  },
  {
    name: 'Junk Removal',
    slug: 'junk-removal',
    prefix: 'JNK',
    color: '#fdab3d',
    icon: 'truck',
    fields: [
      { key: 'loadSize', label: 'Load size', type: 'select', options: ['Minimum', '1/8', '1/4', '1/2', '3/4', 'Full'] },
      { key: 'location', label: 'Items located', type: 'select', options: ['Curbside', 'Garage', 'Inside', 'Basement', 'Attic', 'Backyard'] },
      { key: 'itemTypes', label: 'Items', type: 'textarea' },
      { key: 'dumpFee', label: 'Dump fee ($)', type: 'number' },
    ],
  },
  {
    name: 'Janitorial',
    slug: 'janitorial',
    prefix: 'JAN',
    color: '#00c875',
    icon: 'sparkles',
    fields: [
      { key: 'frequency', label: 'Frequency', type: 'select', options: ['One-time', 'Nightly', 'Weekly', 'Bi-weekly', 'Monthly'] },
      { key: 'squareFootage', label: 'Square footage', type: 'number' },
      { key: 'contractEnd', label: 'Contract ends', type: 'date' },
      { key: 'accessInstructions', label: 'Access / alarm instructions', type: 'textarea' },
    ],
  },
  {
    name: 'HVAC',
    slug: 'hvac',
    prefix: 'HVC',
    color: '#579bfc',
    icon: 'thermometer',
    fields: [
      { key: 'serviceType', label: 'Service type', type: 'select', options: ['Diagnostic', 'Repair', 'Maintenance', 'Install'] },
      { key: 'systemType', label: 'System', type: 'select', options: ['Split AC', 'Heat Pump', 'Furnace', 'Mini-split', 'Boiler', 'RTU'] },
      { key: 'equipmentBrand', label: 'Brand', type: 'text' },
      { key: 'modelSerial', label: 'Model / serial', type: 'text' },
      { key: 'maintenancePlan', label: 'Maintenance plan', type: 'select', options: ['None', 'Silver', 'Gold'] },
    ],
  },
];

// [name, email, role, color, division slugs]
const USERS: [string, string, string, string, string[]][] = [
  ['Alex Morgan', 'alex@example.com', 'owner', '#401694', ['restoration', 'junk-removal', 'janitorial', 'hvac']],
  ['Jordan Lee', 'jordan@example.com', 'office', '#a25ddc', ['restoration', 'junk-removal', 'janitorial', 'hvac']],
  ['Marcus Reed', 'marcus@example.com', 'manager', '#e2445c', ['restoration']],
  ['Dana Cruz', 'dana@example.com', 'technician', '#ff7575', ['restoration']],
  ['Tony Ruiz', 'tony@example.com', 'technician', '#fdab3d', ['junk-removal']],
  ['Sam Patel', 'sam@example.com', 'manager', '#00c875', ['janitorial']],
  ['Kim Nguyen', 'kim@example.com', 'technician', '#579bfc', ['hvac']],
  ['Chris Walker', 'chris@example.com', 'technician', '#0086c0', ['hvac']],
];

const CLIENTS: [string, string | null, string, string, string][] = [
  ['Linda Harper', null, 'linda.harper@example.com', '(555) 201-4410', '118 Maple Ridge Dr'],
  ['Oakview Medical Plaza', 'Oakview Properties LLC', 'facilities@oakview.example.com', '(555) 330-9001', '4500 Oakview Blvd'],
  ['Robert Chen', null, 'rchen@example.com', '(555) 870-2231', '72 Birch Ln'],
  ['Summit Office Park', 'Summit REIT', 'pm@summitpark.example.com', '(555) 640-1180', '900 Summit Pkwy, Bldg C'],
  ['Maria Gonzalez', null, 'maria.g@example.com', '(555) 412-7765', '15 Cedar Hollow Ct'],
  ['First Baptist Church', null, 'office@fbc.example.com', '(555) 219-3300', '300 Church St'],
  ['David & Karen Wells', null, 'wellsfamily@example.com', '(555) 988-1402', '2231 Lakeshore Rd'],
  ['Brightside Dental', 'Brightside Dental Group', 'admin@brightside.example.com', '(555) 700-4545', '61 Main St Suite 200'],
  ['Kevin O’Brien', null, 'kobrien@example.com', '(555) 332-0198', '8 Hillcrest Ave'],
  ['Riverbend Apartments', 'Riverbend Mgmt', 'maint@riverbend.example.com', '(555) 555-0142', '1400 Riverbend Way'],
];

const day = (offset: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
};
const date = (offset: number) => day(offset).slice(0, 10);

interface SeedJob {
  division: string;
  client: number; // index into CLIENTS
  title: string;
  status: string;
  start?: [number, number, number]; // [day offset, start hour, duration hours]
  assignee?: string;
  fields?: Record<string, string>;
  items: [string, number, number][];
  description?: string;
}

const JOBS: SeedJob[] = [
  {
    division: 'restoration', client: 0, title: 'Water mitigation — burst supply line', status: 'in_progress', start: [-1, 8, 6], assignee: 'Marcus Reed',
    fields: { lossType: 'Water', insuranceCarrier: 'State Farm', claimNumber: 'SF-44-8812-001', adjuster: 'Pat Summers', dateOfLoss: date(-2), affectedAreas: 'Kitchen, dining room, finished basement' },
    items: [['Emergency service call', 1, 350], ['Extraction (sq ft)', 850, 0.95], ['Dehumidifier / day', 8, 95], ['Air mover / day', 24, 30]],
  },
  {
    division: 'restoration', client: 4, title: 'Kitchen fire — soot & smoke cleanup', status: 'scheduled', start: [1, 9, 8], assignee: 'Dana Cruz',
    fields: { lossType: 'Fire', insuranceCarrier: 'Allstate', claimNumber: 'AL-0092231', adjuster: 'Tom Fields', dateOfLoss: date(-5) },
    items: [['Soot cleaning (sq ft)', 600, 2.25], ['Thermal fogging', 1, 450], ['Contents pack-out', 1, 1200]],
  },
  {
    division: 'restoration', client: 9, title: 'Unit 4B mold remediation', status: 'quoted', assignee: 'Marcus Reed',
    fields: { lossType: 'Mold', affectedAreas: 'Bathroom wall cavity, closet' },
    items: [['Containment setup', 1, 650], ['Mold removal (sq ft)', 120, 18], ['Clearance testing', 1, 375]],
  },
  {
    division: 'restoration', client: 6, title: 'Storm damage — roof leak into bedroom', status: 'completed', start: [-6, 10, 5], assignee: 'Dana Cruz',
    fields: { lossType: 'Storm', insuranceCarrier: 'Liberty Mutual', claimNumber: 'LM-77120', dateOfLoss: date(-8) },
    items: [['Emergency tarp', 1, 550], ['Drywall removal (sq ft)', 180, 3.5], ['Drying equipment (3 days)', 1, 1100]],
  },
  {
    division: 'restoration', client: 2, title: 'Sewage backup — basement', status: 'request', assignee: 'Marcus Reed',
    fields: { lossType: 'Sewage' }, items: [],
  },
  {
    division: 'junk-removal', client: 2, title: 'Garage cleanout', status: 'scheduled', start: [0, 13, 3], assignee: 'Tony Ruiz',
    fields: { loadSize: '3/4', location: 'Garage', itemTypes: 'Old shelving, boxes, 2 bikes, lawn mower', dumpFee: '85' },
    items: [['3/4 truck load', 1, 525]],
  },
  {
    division: 'junk-removal', client: 8, title: 'Hot tub removal', status: 'scheduled', start: [2, 9, 4], assignee: 'Tony Ruiz',
    fields: { loadSize: 'Full', location: 'Backyard', itemTypes: '6-person hot tub, cut & haul' },
    items: [['Hot tub demo & haul', 1, 650]],
  },
  {
    division: 'junk-removal', client: 6, title: 'Estate cleanout — whole house', status: 'quoted', assignee: 'Tony Ruiz',
    fields: { loadSize: 'Full', location: 'Inside', itemTypes: 'Furniture, appliances, general household' },
    items: [['Full truck load', 3, 695], ['Appliance disposal', 4, 45]],
  },
  {
    division: 'junk-removal', client: 0, title: 'Water-damaged carpet & drywall haul-off', status: 'invoiced', start: [-3, 14, 2], assignee: 'Tony Ruiz',
    fields: { loadSize: '1/2', location: 'Basement', dumpFee: '60' },
    items: [['1/2 truck load', 1, 375]],
    description: 'Cross-division referral from Restoration job for Linda Harper.',
  },
  {
    division: 'junk-removal', client: 4, title: 'Couch & mattress pickup', status: 'paid', start: [-9, 11, 1], assignee: 'Tony Ruiz',
    fields: { loadSize: '1/8', location: 'Curbside' }, items: [['Minimum load', 1, 149]],
  },
  {
    division: 'janitorial', client: 1, title: 'Nightly clinic cleaning', status: 'in_progress', start: [0, 19, 4], assignee: 'Sam Patel',
    fields: { frequency: 'Nightly', squareFootage: '14500', contractEnd: date(200), accessInstructions: 'Alarm code in office safe. Enter via rear loading door.' },
    items: [['Monthly nightly service', 1, 6800]],
  },
  {
    division: 'janitorial', client: 3, title: 'Building C common areas', status: 'scheduled', start: [1, 18, 3], assignee: 'Sam Patel',
    fields: { frequency: 'Weekly', squareFootage: '8200', contractEnd: date(90) },
    items: [['Weekly service', 1, 780]],
  },
  {
    division: 'janitorial', client: 7, title: 'Dental office deep clean', status: 'completed', start: [-2, 17, 5], assignee: 'Sam Patel',
    fields: { frequency: 'One-time', squareFootage: '3100' },
    items: [['Deep clean', 1, 890], ['Floor strip & wax', 1, 450]],
  },
  {
    division: 'janitorial', client: 5, title: 'Post-renovation cleaning', status: 'request',
    fields: { frequency: 'One-time', squareFootage: '6000' }, items: [],
  },
  {
    division: 'hvac', client: 5, title: 'No heat — sanctuary RTU', status: 'in_progress', start: [0, 8, 4], assignee: 'Kim Nguyen',
    fields: { serviceType: 'Repair', systemType: 'RTU', equipmentBrand: 'Carrier', modelSerial: '48TCED08 / 2214G30012', maintenancePlan: 'None' },
    items: [['Diagnostic', 1, 149], ['Igniter replacement', 1, 285], ['Labor (hr)', 2, 125]],
  },
  {
    division: 'hvac', client: 3, title: 'Quarterly PM — 6 rooftop units', status: 'scheduled', start: [3, 7, 8], assignee: 'Chris Walker',
    fields: { serviceType: 'Maintenance', systemType: 'RTU', maintenancePlan: 'Gold' },
    items: [['RTU preventive maintenance', 6, 165], ['Filters (set)', 6, 42]],
  },
  {
    division: 'hvac', client: 6, title: 'Heat pump replacement', status: 'quoted', assignee: 'Kim Nguyen',
    fields: { serviceType: 'Install', systemType: 'Heat Pump', equipmentBrand: 'Trane', maintenancePlan: 'None' },
    items: [['3-ton heat pump system', 1, 8900], ['Install labor', 1, 2400], ['Permit', 1, 175]],
  },
  {
    division: 'hvac', client: 8, title: 'AC not cooling', status: 'completed', start: [-1, 13, 2], assignee: 'Chris Walker',
    fields: { serviceType: 'Repair', systemType: 'Split AC', equipmentBrand: 'Goodman', maintenancePlan: 'None' },
    items: [['Diagnostic', 1, 149], ['Capacitor', 1, 165], ['Refrigerant (lb)', 2, 95]],
  },
  {
    division: 'hvac', client: 7, title: 'Mini-split tune-up', status: 'paid', start: [-12, 10, 2], assignee: 'Kim Nguyen',
    fields: { serviceType: 'Maintenance', systemType: 'Mini-split', maintenancePlan: 'Silver' },
    items: [['Tune-up', 3, 119]],
  },
  {
    division: 'hvac', client: 0, title: 'Furnace inspection after water loss', status: 'scheduled', start: [4, 10, 2], assignee: 'Chris Walker',
    fields: { serviceType: 'Diagnostic', systemType: 'Furnace' },
    items: [['Safety inspection', 1, 189]],
    description: 'Cross-division referral from Restoration job for Linda Harper.',
  },
];

// Board groups: [name, color]
const BOARDS: { name: string; division: string | null; description: string; groups: [string, string][] }[] = [
  {
    name: 'Restoration Pipeline', division: 'restoration', description: 'Mitigation → insurance → rebuild for every loss',
    groups: [['Mitigation', '#e2445c'], ['Insurance & Billing', '#a25ddc'], ['Rebuild', '#fdab3d'], ['Done', '#00c875']],
  },
  {
    name: 'Junk Removal Ops', division: 'junk-removal', description: 'Truck, crew and follow-up work',
    groups: [['This Week', '#fdab3d'], ['Follow-ups', '#579bfc'], ['Done', '#00c875']],
  },
  {
    name: 'Janitorial Accounts', division: 'janitorial', description: 'Onboarding, inspections and supplies for contracts',
    groups: [['Onboarding', '#579bfc'], ['Quality Checks', '#a25ddc'], ['Supplies', '#fdab3d'], ['Done', '#00c875']],
  },
  {
    name: 'HVAC Service', division: 'hvac', description: 'Parts, follow-ups and maintenance agreements',
    groups: [['Parts on Order', '#fdab3d'], ['Follow-ups', '#579bfc'], ['Maintenance Plans', '#a25ddc'], ['Done', '#00c875']],
  },
  {
    name: 'Company Admin', division: null, description: 'Hiring, marketing and finance across all divisions',
    groups: [['Hiring', '#579bfc'], ['Marketing', '#ff7575'], ['Finance', '#00c875'], ['Done', '#c4c4c4']],
  },
];

interface SeedTask {
  board: string;
  group: string;
  title: string;
  status?: string;
  priority?: string;
  assignee?: string;
  due?: number;
  job?: string; // job title
  subtasks?: [string, string?][];
  updates?: [string, string][];
}

const TASKS: SeedTask[] = [
  { board: 'Restoration Pipeline', group: 'Mitigation', title: 'Daily moisture readings — Harper', status: 'working', priority: 'high', assignee: 'Dana Cruz', due: 0, job: 'Water mitigation — burst supply line',
    subtasks: [['Day 1 readings', 'done'], ['Day 2 readings', 'done'], ['Day 3 readings'], ['Final dry standard sign-off']],
    updates: [['Marcus Reed', 'Basement slab still reading 28%. Added 2 more air movers.']] },
  { board: 'Restoration Pipeline', group: 'Mitigation', title: 'Pack-out inventory photos — Gonzalez', priority: 'medium', assignee: 'Dana Cruz', due: 1, job: 'Kitchen fire — soot & smoke cleanup' },
  { board: 'Restoration Pipeline', group: 'Insurance & Billing', title: 'Send Xactimate estimate to adjuster', status: 'stuck', priority: 'critical', assignee: 'Jordan Lee', due: -2, job: 'Water mitigation — burst supply line',
    updates: [['Jordan Lee', 'Waiting on adjuster to confirm pricing list. Called twice.']] },
  { board: 'Restoration Pipeline', group: 'Insurance & Billing', title: 'Collect signed work authorization', status: 'done', priority: 'high', assignee: 'Marcus Reed', due: -3, job: 'Water mitigation — burst supply line' },
  { board: 'Restoration Pipeline', group: 'Insurance & Billing', title: 'Final invoice & photo report — Wells', status: 'working', priority: 'high', assignee: 'Jordan Lee', due: 1, job: 'Storm damage — roof leak into bedroom' },
  { board: 'Restoration Pipeline', group: 'Rebuild', title: 'Get drywall & paint bid for Wells bedroom', priority: 'medium', assignee: 'Marcus Reed', due: 5, job: 'Storm damage — roof leak into bedroom' },
  { board: 'Restoration Pipeline', group: 'Mitigation', title: 'Schedule mold clearance test — Riverbend 4B', priority: 'medium', assignee: 'Marcus Reed', due: 6, job: 'Unit 4B mold remediation' },

  { board: 'Junk Removal Ops', group: 'This Week', title: 'Confirm dump hours for Saturday', priority: 'low', assignee: 'Tony Ruiz', due: 2 },
  { board: 'Junk Removal Ops', group: 'This Week', title: 'Rent trailer for hot tub job', status: 'working', priority: 'high', assignee: 'Tony Ruiz', due: 1, job: 'Hot tub removal' },
  { board: 'Junk Removal Ops', group: 'Follow-ups', title: 'Collect payment — Harper haul-off', status: 'stuck', priority: 'high', assignee: 'Jordan Lee', due: -1, job: 'Water-damaged carpet & drywall haul-off' },
  { board: 'Junk Removal Ops', group: 'Follow-ups', title: 'Follow up on estate cleanout quote', priority: 'medium', assignee: 'Jordan Lee', due: 0, job: 'Estate cleanout — whole house' },
  { board: 'Junk Removal Ops', group: 'Done', title: 'Request Google review — Gonzalez', status: 'done', priority: 'low', assignee: 'Jordan Lee', due: -8, job: 'Couch & mattress pickup' },

  { board: 'Janitorial Accounts', group: 'Onboarding', title: 'Walkthrough & scope — First Baptist', priority: 'high', assignee: 'Sam Patel', due: 2, job: 'Post-renovation cleaning',
    subtasks: [['Measure sq ft'], ['Photo current condition'], ['Build cleaning checklist']] },
  { board: 'Janitorial Accounts', group: 'Quality Checks', title: 'Monthly QA inspection — Oakview', priority: 'medium', assignee: 'Sam Patel', due: 4, job: 'Nightly clinic cleaning' },
  { board: 'Janitorial Accounts', group: 'Quality Checks', title: 'Address complaint: trash missed in Suite 110', status: 'working', priority: 'high', assignee: 'Sam Patel', due: -1, job: 'Nightly clinic cleaning',
    updates: [['Sam Patel', 'Talked to night crew, added Suite 110 to checklist.']] },
  { board: 'Janitorial Accounts', group: 'Supplies', title: 'Reorder paper towels & liners', priority: 'low', assignee: 'Sam Patel', due: 3 },
  { board: 'Janitorial Accounts', group: 'Onboarding', title: 'Renewal proposal — Summit Office Park', priority: 'medium', assignee: 'Alex Morgan', due: 14, job: 'Building C common areas' },

  { board: 'HVAC Service', group: 'Parts on Order', title: 'Order igniter for Carrier RTU', status: 'done', priority: 'critical', assignee: 'Kim Nguyen', due: -1, job: 'No heat — sanctuary RTU' },
  { board: 'HVAC Service', group: 'Parts on Order', title: 'Confirm Trane equipment lead time', priority: 'medium', assignee: 'Kim Nguyen', due: 3, job: 'Heat pump replacement' },
  { board: 'HVAC Service', group: 'Follow-ups', title: 'Offer maintenance plan to Kevin O’Brien', priority: 'medium', assignee: 'Jordan Lee', due: 6, job: 'AC not cooling' },
  { board: 'HVAC Service', group: 'Maintenance Plans', title: 'Schedule fall tune-ups for Silver/Gold members', status: 'working', priority: 'high', assignee: 'Chris Walker', due: 7,
    subtasks: [['Pull member list', 'done'], ['Send scheduling texts'], ['Book routes']] },
  { board: 'HVAC Service', group: 'Follow-ups', title: 'EPA 608 cert renewal — Chris', priority: 'low', assignee: 'Chris Walker', due: 30 },

  { board: 'Company Admin', group: 'Hiring', title: 'Hire 2 restoration techs', status: 'working', priority: 'high', assignee: 'Alex Morgan', due: 10,
    subtasks: [['Post job ad', 'done'], ['Phone screens'], ['Ride-alongs']] },
  { board: 'Company Admin', group: 'Marketing', title: 'Cross-sell flyer: Restoration → Junk & HVAC', priority: 'medium', assignee: 'Jordan Lee', due: 5 },
  { board: 'Company Admin', group: 'Marketing', title: 'Update Google Business profiles (4 divisions)', priority: 'low', assignee: 'Jordan Lee', due: -4 },
  { board: 'Company Admin', group: 'Finance', title: 'Review division P&L for last month', priority: 'high', assignee: 'Alex Morgan', due: 2 },
  { board: 'Company Admin', group: 'Finance', title: 'Renew commercial auto policy', status: 'stuck', priority: 'critical', assignee: 'Alex Morgan', due: 8 },
];

// Seed rules reference divisions/boards by name; ids are resolved at insert time.
type SeedTrigger = { type: AutomationTrigger['type']; toStatus?: string; division?: string };
type SeedAction = Omit<Extract<AutomationAction, { type: 'create_task' }>, 'boardId' | 'groupId'> & { board: string; group: string };

const AUTOMATIONS: { name: string; trigger: SeedTrigger; action: SeedAction }[] = [
  {
    name: 'New restoration loss → contact adjuster',
    trigger: { type: 'job_created', division: 'restoration' },
    action: { type: 'create_task', board: 'Restoration Pipeline', group: 'Insurance & Billing', title: 'Contact adjuster for {{job.number}} ({{client.name}})', assignee: 'job_assignee', priority: 'high', dueInDays: 1 },
  },
  {
    name: 'Restoration job completed → final invoice package',
    trigger: { type: 'job_status_changed', toStatus: 'completed', division: 'restoration' },
    action: { type: 'create_task', board: 'Restoration Pipeline', group: 'Insurance & Billing', title: 'Final invoice & photo report — {{job.number}} {{client.name}}', priority: 'high', dueInDays: 2 },
  },
  {
    name: 'Junk job completed → ask for a review',
    trigger: { type: 'job_status_changed', toStatus: 'completed', division: 'junk-removal' },
    action: { type: 'create_task', board: 'Junk Removal Ops', group: 'Follow-ups', title: 'Request Google review — {{client.name}}', priority: 'low', dueInDays: 1 },
  },
  {
    name: 'New janitorial account → onboarding walkthrough',
    trigger: { type: 'job_created', division: 'janitorial' },
    action: { type: 'create_task', board: 'Janitorial Accounts', group: 'Onboarding', title: 'Walkthrough & scope — {{client.name}}', assignee: 'job_assignee', priority: 'high', dueInDays: 3 },
  },
  {
    name: 'HVAC repair completed → pitch maintenance plan',
    trigger: { type: 'job_status_changed', toStatus: 'completed', division: 'hvac' },
    action: { type: 'create_task', board: 'HVAC Service', group: 'Follow-ups', title: 'Offer maintenance plan to {{client.name}} ({{job.number}})', priority: 'medium', dueInDays: 5 },
  },
];

export function seed(db: DB) {
  tx(db, () => {
    const divisionIds: Record<string, number> = {};
    for (const d of DIVISIONS) {
      const r = db
        .prepare('INSERT INTO divisions (name, slug, prefix, color, icon, fields) VALUES (?, ?, ?, ?, ?, ?)')
        .run(d.name, d.slug, d.prefix, d.color, d.icon, JSON.stringify(d.fields));
      divisionIds[d.slug] = Number(r.lastInsertRowid);
    }

    const userIds: Record<string, number> = {};
    for (const [name, email, role, color, divs] of USERS) {
      const r = db
        .prepare('INSERT INTO users (name, email, role, color, division_ids) VALUES (?, ?, ?, ?, ?)')
        .run(name, email, role, color, JSON.stringify(divs.map((s) => divisionIds[s])));
      userIds[name] = Number(r.lastInsertRowid);
    }

    const clientIds = CLIENTS.map(([name, company, email, phone, address]) =>
      Number(
        db.prepare('INSERT INTO clients (name, company, email, phone, address) VALUES (?, ?, ?, ?, ?)').run(name, company, email, phone, address)
          .lastInsertRowid,
      ),
    );

    const jobIds: Record<string, number> = {};
    JOBS.forEach((j, i) => {
      const division = DIVISIONS.find((d) => d.slug === j.division)!;
      const [offset, hour, hours] = j.start ?? [0, 0, 0];
      const r = db
        .prepare(
          `INSERT INTO jobs (number, division_id, client_id, title, description, status, address, scheduled_start, scheduled_end, assignee_id, custom_fields, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`,
        )
        .run(
          `${division.prefix}-${1001 + i}`,
          divisionIds[j.division],
          clientIds[j.client],
          j.title,
          j.description ?? null,
          j.status,
          CLIENTS[j.client][4],
          j.start ? day(offset, hour) : null,
          j.start ? day(offset, hour + hours) : null,
          j.assignee ? userIds[j.assignee] : null,
          JSON.stringify(j.fields ?? {}),
          `-${14 - (i % 7)} days`,
          j.start && offset < 0 ? `${offset} days` : '-0 days',
        );
      const jobId = Number(r.lastInsertRowid);
      jobIds[j.title] = jobId;
      for (const [desc, qty, price] of j.items) {
        db.prepare('INSERT INTO line_items (job_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)').run(jobId, desc, qty, price);
      }
      db.prepare('INSERT INTO activity (kind, message, job_id) VALUES (?, ?, ?)').run('job', `Created job ${division.prefix}-${1001 + i}: ${j.title}`, jobId);
    });

    const boardIds: Record<string, number> = {};
    const groupIds: Record<string, number> = {};
    for (const b of BOARDS) {
      const r = db
        .prepare('INSERT INTO boards (name, description, division_id) VALUES (?, ?, ?)')
        .run(b.name, b.description, b.division ? divisionIds[b.division] : null);
      const boardId = Number(r.lastInsertRowid);
      boardIds[b.name] = boardId;
      b.groups.forEach(([name, color], i) => {
        const g = db.prepare('INSERT INTO groups (board_id, name, color, position) VALUES (?, ?, ?, ?)').run(boardId, name, color, i);
        groupIds[`${b.name}/${name}`] = Number(g.lastInsertRowid);
      });
    }

    const insertTask = db.prepare(
      `INSERT INTO tasks (board_id, group_id, parent_id, title, status, priority, assignee_id, due_date, job_id, position, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    TASKS.forEach((t, i) => {
      const status = t.status ?? 'not_started';
      const groupId = groupIds[`${t.board}/${t.group}`];
      const r = insertTask.run(
        boardIds[t.board],
        groupId,
        null,
        t.title,
        status,
        t.priority ?? 'medium',
        t.assignee ? userIds[t.assignee] : null,
        t.due != null ? date(t.due) : null,
        t.job ? jobIds[t.job] : null,
        i,
        status === 'done' ? new Date().toISOString() : null,
      );
      const taskId = Number(r.lastInsertRowid);
      t.subtasks?.forEach(([title, st], k) => {
        insertTask.run(boardIds[t.board], groupId, taskId, title, st ?? 'not_started', 'medium', t.assignee ? userIds[t.assignee] : null, null, null, k, st === 'done' ? new Date().toISOString() : null);
      });
      for (const [author, body] of t.updates ?? []) {
        db.prepare('INSERT INTO task_updates (task_id, author_id, body) VALUES (?, ?, ?)').run(taskId, userIds[author], body);
      }
    });

    for (const a of AUTOMATIONS) {
      const { division, ...trigger } = a.trigger;
      const { board, group, ...action } = a.action;
      db.prepare('INSERT INTO automations (name, trigger, action) VALUES (?, ?, ?)').run(
        a.name,
        JSON.stringify({ ...trigger, divisionId: division ? divisionIds[division] : null }),
        JSON.stringify({ ...action, boardId: boardIds[board], groupId: groupIds[`${board}/${group}`] }),
      );
    }
  });
}

export function seedIfEmpty(db: DB) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM divisions').get() as { n: number };
  if (n === 0) {
    seed(db);
    console.log('Seeded demo data.');
  }
}

const TABLES = ['activity', 'task_updates', 'tasks', 'groups', 'boards', 'automations', 'line_items', 'jobs', 'clients', 'users', 'divisions'];

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename) && process.argv.includes('--reset')) {
  const db = openDb(process.env.DB_PATH ?? resolve(import.meta.dirname, '../data/fieldboard.db'));
  tx(db, () => TABLES.forEach((t) => db.exec(`DELETE FROM ${t}`)));
  seed(db);
  console.log('Database reset with demo data.');
}
