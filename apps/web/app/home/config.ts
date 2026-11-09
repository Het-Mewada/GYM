export const BRAND = 'GymOS';

export const PRIMARY_CTA = {
  label: 'Book a demo',
  href: '#demo'
};

export const SECONDARY_CTA = {
  label: 'See how it works',
  href: '#story'
};

export const NAV_LINKS = [
  { label: 'Architecture', href: '#platform' },
  { label: 'Feature Story', href: '#story' },
  { label: 'Live Operations', href: '#gallery' },
  { label: 'Capabilities', href: '#features' },
  { label: 'Members Portal', href: '/members', testId: 'members-directory-link' }
];

export const SOCIAL_PROOF_PLACEHOLDERS = {
  activeBranches: '[Add real number]',
  dailyCheckins: '[Add real number]',
  revenueProcessed: '[Add real number]',
  retentionLift: '[Add real number]'
};

export const OWNER_PAIN_BEATS = [
  {
    num: '01',
    label: 'REVENUE LEAKAGE',
    headline: 'Lost in spreadsheets and missed membership renewals.',
    body: 'Manual Excel registers let memberships lapse unnoticed. Front-desk staff lose hours calculating remaining days while recurring revenue quietly bleeds away.'
  },
  {
    num: '02',
    label: 'CASH DISCREPANCY',
    headline: 'Cash disappearing at the reception counter.',
    body: 'When staff take physical cash without instant receipts or locked audit logs, branch reconciliation becomes guesswork at the end of the month.'
  },
  {
    num: '03',
    label: 'OPERATIONAL BLINDSPOT',
    headline: 'Zero real-time visibility across your gym branches.',
    body: 'Managing multiple locations means driving across town or waiting for WhatsApp end-of-day summaries. You have no single pane of glass into current facility capacity.'
  }
];

export const PLATFORM_COMPONENTS = [
  {
    id: 'bar',
    name: 'Bar Core',
    subtitle: 'Platform Core & Tenant Isolation',
    description: 'Cryptographically separated multi-tenant schemas and row-level security ensuring each gym\'s member records are strictly isolated.'
  },
  {
    id: 'plates',
    name: 'Calibrated Plates',
    subtitle: 'Branch-Level Autonomy (Stealth Urethane & Volt)',
    description: 'Precision-calibrated independent operating units, multi-tier capacity control, dedicated branch dashboards, and member transfers.'
  },
  {
    id: 'collars',
    name: 'Lock Collars',
    subtitle: 'Security & Access Control',
    description: 'Fine-grained RBAC, least-privilege staff permissions, and immutable append-only audit trail logs.'
  },
  {
    id: 'endcaps',
    name: 'End Caps',
    subtitle: 'Custom Billing & Plans',
    description: 'Gym-specific subscription tiers, flexible session packs, automated invoice generation, and tax tracking.'
  }
];

export const STORY_SCENES = [
  {
    id: 'branches',
    assetId: 'story-1-branches',
    tag: 'MULTI-GYM, MULTI-BRANCH',
    title: 'One platform. Every branch running in real time.',
    subtitle: 'Scale from one boutique box to twenty multi-city fitness facilities without duplicating administrative overhead.',
    features: [
      'Tenant data isolation',
      'Admin registration',
      'Branch-level dashboard',
      'Member transfer between branches'
    ]
  },
  {
    id: 'access',
    assetId: 'story-2-access',
    tag: 'ACCESS CONTROL',
    title: 'Granular permissions. Zero shared credentials.',
    subtitle: 'Give front-desk staff, trainers, and branch managers the exact tools they need to operate, protected by strict role boundaries.',
    features: [
      'Role-based access control (RBAC)',
      'Permission-based access control',
      'Staff permissions management'
    ]
  },
  {
    id: 'accountability',
    assetId: 'story-3-accountability',
    tag: 'ACCOUNTABILITY',
    title: 'Immutable audit logs. Every transaction tracked.',
    subtitle: 'Track every member record creation, subscription discount override, and cash collection with cryptographically verifiable timestamps.',
    features: [
      'Audit logs',
      'Activity logs',
      'Staff activity tracking'
    ]
  },
  {
    id: 'memberships',
    assetId: 'story-4-memberships',
    tag: 'MEMBERSHIPS',
    title: 'Automated renewal reminders. Zero lapsed members.',
    subtitle: 'Define custom membership pricing structures per gym location and trigger automated expiry alerts before memberships expire.',
    features: [
      'Custom membership plans defined per gym',
      'Membership expiry tracking and automatic reminders'
    ]
  },
  {
    id: 'frontdesk',
    assetId: 'story-5-frontdesk',
    tag: 'FRONT DESK',
    title: 'Sub-second member check-in. Zero reception queues.',
    subtitle: 'Instant digital check-in scans with real-time membership validity verification and permanent attendance record keeping.',
    features: [
      'Member check-in/out',
      'Attendance history'
    ]
  },
  {
    id: 'money',
    assetId: 'story-6-money',
    tag: 'FINANCIAL OPS',
    title: 'Unified payment collection. Cash and digital reconciled.',
    subtitle: 'Seamless payment handling supporting card gateways and manual front-desk cash receipts with instant printable tax invoices.',
    features: [
      'Payment collection (manual cash entry supported)',
      'Invoice generation',
      'Discount management'
    ]
  }
];

export const GALLERY_PANELS = [
  {
    id: 'frontdesk',
    assetId: 'gallery-1-frontdesk',
    title: 'Front Desk Check-In Hub',
    subtitle: 'Lightning-fast QR & badge check-in with immediate visual status verification.',
    mockupType: 'checkin'
  },
  {
    id: 'floor',
    assetId: 'gallery-2-floor',
    title: 'Live Floor Attendance',
    subtitle: 'Real-time facility capacity telemetry and peak-hour density metrics.',
    mockupType: 'capacity'
  },
  {
    id: 'manager',
    assetId: 'gallery-3-manager',
    title: 'Branch Executive Dashboard',
    subtitle: 'High-level financial summaries, new enrolments, and trainer allocation at a glance.',
    mockupType: 'analytics'
  },
  {
    id: 'billing',
    assetId: 'gallery-4-billing',
    title: 'Ledger & Cash Flow Reconciler',
    subtitle: 'Automated reconciliation for online gateway deposits and counter cash receipts.',
    mockupType: 'ledger'
  },
  {
    id: 'comms',
    assetId: 'gallery-5-comms',
    title: 'Automated Comms & Data Export',
    subtitle: 'Instant WhatsApp renewal prompts and one-click PDF, CSV, and Excel exports.',
    mockupType: 'exports'
  }
];

export const FEATURE_GROUPS = [
  {
    category: 'Multi-tenant and Branches',
    features: [
      'Tenant data isolation',
      'Branch-level dashboard',
      'Member transfer between branches',
      'Gym-specific subscription plans',
      'Admin registration'
    ]
  },
  {
    category: 'Access and Security',
    features: [
      'RBAC',
      'Permission-based access control',
      'Audit logs',
      'Data backup'
    ]
  },
  {
    category: 'People',
    features: [
      'Staff/Trainer/Member invitation',
      'Staff activity tracking',
      'Staff permissions management'
    ]
  },
  {
    category: 'Memberships',
    features: [
      'Custom membership plans',
      'Membership expiry tracking and reminders',
      'Member check-in/out',
      'Attendance history'
    ]
  },
  {
    category: 'Money',
    features: [
      'Payment collection (manual cash entry supported)',
      'Invoice generation',
      'Discount management'
    ]
  },
  {
    category: 'Communication and Data',
    features: [
      'WhatsApp and email integration',
      'PDF/CSV/Excel export',
      'Mobile-friendly',
      'Activity logs'
    ]
  }
];

export const TRUST_METRICS = [
  {
    title: 'Tenant Data Isolation',
    body: 'Each gym\'s members, payments, and staff records exist in logically segregated partitions with strict boundary enforcement.',
    spec: 'Row-Level Security + Gym ID Invariants'
  },
  {
    title: 'Cryptographic Audit Trail',
    body: 'Append-only logs track every administrative mutation, status change, and cash intake with user attribution.',
    spec: 'Non-repudiable Event History'
  },
  {
    title: 'Continuous Data Backup',
    body: 'Automated continuous point-in-time recovery and snapshot replication protects against hardware failure.',
    spec: 'Automated Redundant Snapshots'
  },
  {
    title: 'Open Data Portability',
    body: 'Your business data belongs to you. Export complete member rosters, payment histories, and attendance in CSV, Excel, or PDF anytime.',
    spec: 'Zero Vendor Lock-In'
  }
];
