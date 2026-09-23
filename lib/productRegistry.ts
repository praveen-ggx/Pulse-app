/**
 * Pulse Workspace — Product Registry
 *
 * Single source of truth for all Pulse products.
 * Architecture mirrors Zoho One / HubSpot product catalog.
 *
 * Design principles:
 *   • Products are defined statically here (never fetched from DB for display)
 *   • Activation state is stored per-org in the DB (workspace_products table)
 *   • Capabilities are gated by active products at runtime
 *   • Dependency graph enforces Pulse Core as a prerequisite for all products
 */

import { isWorkspaceProductLocked } from '@/lib/suite/productLock';

// ── Product identifiers ──────────────────────────────────────────────────────

export type ProductId =
  | 'pulse_core'
  | 'pulse_driver'
  | 'pulse_network'
  | 'pulse_network_bidding'
  | 'pulse_chat'
  | 'pulse_pod_pro'
  | 'pulse_invoice_pro'
  | 'pulse_finance_pro'
  | 'pulse_fleet_pro'
  | 'pulse_people'
  | 'pulse_talent'
  | 'pulse_marketplace'
  | 'pulse_exchange'
  | 'pulse_compliance'
  | 'pulse_ai'
  | 'pulse_reach';

// ── Status types ─────────────────────────────────────────────────────────────

export type ProductStatus =
  | 'active'        // Currently available, can be subscribed
  | 'coming_soon'   // In development, no ETA
  | 'private_beta'  // Available to select customers on waitlist
  | 'early_access'  // Public beta, free or discounted
  | 'planned';      // On roadmap, not yet started

export type PricingModel =
  | 'free'
  | 'per_seat'
  | 'usage_based'
  | 'flat_monthly'
  | 'commission'
  | 'custom';

export type BadgeVariant = 'green' | 'indigo' | 'amber' | 'rose' | 'gray';

// ── Product definition ───────────────────────────────────────────────────────

export interface ProductModule {
  name: string;
  description: string;
  icon: string;  // lucide-react-native icon name
}

export interface ProductPricing {
  model: PricingModel;
  startsAt?: number;       // INR per month
  unit?: string;           // "per seat", "per trip", "% of transaction"
  freeTrialDays?: number;
  customQuote?: boolean;
}

export interface ProductDefinition {
  id: ProductId;
  name: string;
  tagline: string;
  description: string;
  icon: string;             // lucide-react-native icon
  color: string;            // brand color for this product
  status: ProductStatus;
  badge?: {
    label: string;
    variant: BadgeVariant;
  };
  pricing: ProductPricing;
  dependencies: ProductId[];  // must be active first
  modules: ProductModule[];
  capabilities: string[];     // capabilities unlocked when this product is active
  learnMoreUrl?: string;
  vision: string;
  upgradeFrom?: ProductId;    // which product this upgrades from
}

/** Core business apps — always connected in every workspace (free). */
export const BUNDLED_ACTIVE_PRODUCT_IDS = [
  'pulse_core',
  'pulse_driver',
  'pulse_network',
  'pulse_network_bidding',
  'pulse_chat',
] as const satisfies readonly ProductId[];

export function isBundledActiveProduct(id: ProductId): boolean {
  return (BUNDLED_ACTIVE_PRODUCT_IDS as readonly ProductId[]).includes(id);
}

export function withBundledActiveProducts(ids: Iterable<ProductId>): Set<ProductId> {
  const next = new Set(ids);
  for (const id of BUNDLED_ACTIVE_PRODUCT_IDS) {
    next.add(id);
  }
  for (const id of [...next]) {
    if (isWorkspaceProductLocked(id)) next.delete(id);
  }
  return next;
}

// ── The Registry ─────────────────────────────────────────────────────────────

export const PRODUCT_REGISTRY: Record<ProductId, ProductDefinition> = {

  pulse_core: {
    id: 'pulse_core',
    name: 'Pulse Core',
    tagline: 'The foundation of your logistics business',
    description: 'Trip management, driver coordination, client and supplier records, real-time GPS, and trip-level finance. The operational backbone every logistics team runs on.',
    icon: 'Zap',
    color: '#4D3636',
    status: 'active',
    pricing: { model: 'free' },
    dependencies: [],
    capabilities: ['dispatch', 'fleet_management', 'finance_view', 'finance_manage'],
    modules: [
      { name: 'Trip Management',     description: 'Create, assign, track trips end-to-end',           icon: 'Truck' },
      { name: 'GPS Tracking',        description: 'Real-time location for every active trip',          icon: 'MapPin' },
      { name: 'Client Management',   description: 'Customer database with contact and trip history',   icon: 'Users' },
      { name: 'Supplier Records',    description: 'Subcontractors, fleet owners, and vendor contacts',   icon: 'Building2' },
      { name: 'Basic Finance',       description: 'Trip-level revenue and cost tracking',              icon: 'IndianRupee' },
    ],
    vision: 'Pulse Core is the operating system for logistics companies. Every team member, every truck, every trip — in one place.',
  },

  pulse_driver: {
    id: 'pulse_driver',
    name: 'Pulse Driver app',
    tagline: 'Native app for drivers on the road',
    description: 'Mobile-first experience for assigned drivers — trip execution, odometer and expense capture, POD upload, live status updates, and fleet chat. Free with Pulse Core.',
    icon: 'Smartphone',
    color: '#16a34a',
    status: 'active',
    pricing: { model: 'free' },
    dependencies: ['pulse_core'],
    capabilities: [
      'driver_mobile',
      'driver_trip_execution',
      'driver_expenses',
      'driver_odometer',
      'driver_pod_capture',
    ],
    modules: [
      { name: 'Trip execution',      description: 'Accept trips, update status, complete deliveries', icon: 'Truck' },
      { name: 'Expense capture',     description: 'Fuel, toll, and receipt OCR on the go',           icon: 'Receipt' },
      { name: 'Odometer photos',     description: 'Start/end KM with Pulse Scan',                     icon: 'Gauge' },
      { name: 'POD & documents',     description: 'Capture and upload proof from the cab',            icon: 'Camera' },
      { name: 'Driver chat',         description: 'Trip threads with dispatch and fleet',             icon: 'MessageSquare' },
    ],
    vision: 'Every driver gets a purpose-built app — no dispatcher login, no clutter, just the trip in their pocket.',
  },

  pulse_network: {
    id: 'pulse_network',
    name: 'Pulse Social network',
    tagline: 'Connect, grow, and win freight together',
    description: 'Build your logistics network — connect with verified partners, grow alliances, bid on loads, and share updates on your Pulse story feed.',
    icon: 'Network',
    color: '#3730A3',
    status: 'active',
    pricing: { model: 'free' },
    dependencies: ['pulse_core'],
    capabilities: [
      'network_connections',
      'network_discover',
      'marketplace_post',
      'marketplace_bid',
      'social_feed',
    ],
    modules: [
      { name: 'Your Connections',    description: 'Integrated clients, suppliers, and fleet partners', icon: 'Users' },
      { name: 'Grow Your Network',   description: 'Discover allies and send connection invites',       icon: 'UserPlus' },
      { name: 'Load Bidding',        description: 'Post freight and bid on open marketplace loads',    icon: 'Gavel' },
      { name: 'Stories & Feed',      description: 'Share updates and follow partner activity',         icon: 'Rss' },
    ],
    vision: 'Your logistics rolodex — connected partners, open freight, and a feed that keeps your network in motion.',
  },

  pulse_network_bidding: {
    id: 'pulse_network_bidding',
    name: 'Pulse Network bidding',
    tagline: 'Bid on integrated trip loads from your network',
    description:
      'Place and manage bids on freight posted by connected partners — integrated trip indents flow into your load board so you can quote, win, and deploy without leaving Pulse.',
    icon: 'Gavel',
    color: '#d97706',
    status: 'active',
    pricing: { model: 'free' },
    dependencies: ['pulse_core', 'pulse_network'],
    capabilities: [
      'network_bidding',
      'integrated_trip_bids',
      'indent_bidding',
      'marketplace_bid',
    ],
    modules: [
      { name: 'Integrated trip bids', description: 'Bid on loads from connected shippers and brokers', icon: 'Truck' },
      { name: 'Live bid board',       description: 'Track open indents and your submitted quotes',      icon: 'Gavel' },
      { name: 'Award & deploy',       description: 'Win a bid and convert straight to trip execution',  icon: 'CheckCircle' },
      { name: 'Rate history',         description: 'Past bids and lane pricing for smarter quotes',     icon: 'TrendingUp' },
    ],
    vision: 'Every integrated trip is an opportunity — discover partner freight, bid in seconds, and keep trucks moving.',
  },

  pulse_chat: {
    id: 'pulse_chat',
    name: 'Pulse Chat',
    tagline: 'Trip threads and business messaging',
    description: 'Slack-style coordination for operations — trip chat with drivers and dispatchers, plus business chat with connected partner organisations.',
    icon: 'MessageSquare',
    color: '#5b5ef4',
    status: 'active',
    pricing: { model: 'free' },
    dependencies: ['pulse_core'],
    capabilities: ['trip_chat', 'business_chat', 'chat_reactions', 'chat_media'],
    modules: [
      { name: 'Trip Chat',           description: 'Per-trip threads with drivers, clients, and ops',     icon: 'Truck' },
      { name: 'Business Chat',       description: 'Direct messages with connected organisations',        icon: 'MessageCircle' },
      { name: 'Media & Documents',   description: 'Photos, PODs, and files in conversation context',   icon: 'Paperclip' },
    ],
    vision: 'One inbox for every trip and every partner — no more WhatsApp chaos.',
  },

  pulse_reach: {
    id: 'pulse_reach',
    name: 'Pulse Reach',
    tagline: 'Turn your Story into a paid campaign',
    description: 'Boost any Story into a targeted campaign with CTAs, scheduling, and full engagement analytics — pay with cash or Pulse Credits, reach verified fleet owners across the network.',
    icon: 'Megaphone',
    color: '#E82127',
    status: 'early_access',
    badge: { label: 'Early Access', variant: 'rose' },
    pricing: {
      model: 'usage_based',
      startsAt: 250,
      unit: 'per campaign (credits or cash)',
    },
    dependencies: ['pulse_core', 'pulse_network'],
    capabilities: ['reach_campaigns', 'reach_analytics', 'pulse_credits'],
    modules: [
      { name: 'Campaign Studio',      description: 'Turn a Story into a scheduled, CTA-driven campaign', icon: 'Megaphone' },
      { name: 'Audience Builder',     description: 'Target by role, geography, org type, or device',      icon: 'Users' },
      { name: 'Engagement Analytics', description: 'Reach, completion rate, CTA CTR, replies, shares',     icon: 'BarChart3' },
      { name: 'Pulse Credits',        description: 'Earn credits via referral or verification, spend on Reach', icon: 'Coins' },
    ],
    vision: 'Every Story can become a campaign — verified reach, real analytics, paid in cash or credits you already earned.',
    upgradeFrom: 'pulse_network',
  },

  pulse_pod_pro: {
    id: 'pulse_pod_pro',
    name: 'Pulse POD Pro',
    tagline: 'Paperless proof of delivery. Instantly.',
    description: 'Digital POD capture, AI-powered document verification, automatic LR generation, e-way bill tracking, and client-accessible delivery confirmation portal.',
    icon: 'FileCheck',
    color: '#059669',
    status: 'early_access',
    badge: { label: 'Early Access', variant: 'green' },
    pricing: {
      model: 'per_seat',
      startsAt: 999,
      unit: 'per dispatcher/month',
      freeTrialDays: 14,
    },
    dependencies: ['pulse_core'],
    capabilities: ['pod_management', 'document_ai'],
    modules: [
      { name: 'Digital POD Capture',    description: 'Drivers capture POD on mobile, instant sync',         icon: 'Camera' },
      { name: 'LR / Bilty Generator',   description: 'Generate GST-compliant lorry receipts automatically',  icon: 'FileText' },
      { name: 'E-Way Bill Tracking',    description: 'Track validity and alert before expiry',               icon: 'AlertCircle' },
      { name: 'Client Delivery Portal', description: 'Customers track and confirm delivery themselves',       icon: 'Globe' },
      { name: 'AI Document Scan',       description: 'OCR extraction from uploaded POD images',               icon: 'ScanLine' },
    ],
    vision: 'Eliminate paper from every delivery. Every shipment confirmed digitally, every LR generated in seconds.',
    upgradeFrom: 'pulse_core',
  },

  pulse_invoice_pro: {
    id: 'pulse_invoice_pro',
    name: 'Pulse Invoice Pro',
    tagline: 'GST-compliant billing. Automated.',
    description: 'Sequential GST invoicing, e-invoice (IRP) integration, automatic invoice scheduling, client payment portal, and aging-based collections automation.',
    icon: 'Receipt',
    color: '#d97706',
    status: 'early_access',
    badge: { label: 'Early Access', variant: 'amber' },
    pricing: {
      model: 'per_seat',
      startsAt: 1499,
      unit: 'per finance user/month',
      freeTrialDays: 14,
    },
    dependencies: ['pulse_core'],
    capabilities: ['invoice_pro', 'finance_manage'],
    modules: [
      { name: 'Sequential Invoicing',    description: 'GST-compliant consecutive invoice numbers per FY',    icon: 'Hash' },
      { name: 'E-Invoice (IRP)',          description: 'Direct IRP portal integration for e-invoicing',       icon: 'Link' },
      { name: 'Bulk Invoice Generation', description: 'Invoice 50 trips in one click',                       icon: 'Layers' },
      { name: 'Payment Portal',          description: 'UPI/bank transfer links in every invoice',            icon: 'CreditCard' },
      { name: 'Collections Automation',  description: 'Auto-reminders for overdue invoices',                 icon: 'Bell' },
      { name: 'Aging Reports',           description: '0-30, 31-60, 90+ day receivables breakdown',          icon: 'BarChart3' },
    ],
    vision: 'Never chase an invoice again. Automated billing, automated reminders, automatic reconciliation.',
    upgradeFrom: 'pulse_core',
  },

  pulse_finance_pro: {
    id: 'pulse_finance_pro',
    name: 'Pulse Finance Pro',
    tagline: 'Complete logistics accounting. Built-in.',
    description: 'Full double-entry ledger, GST filing reports, TDS tracking on supplier payments, multi-bank reconciliation, profit & loss by trip and branch.',
    icon: 'BarChart2',
    color: '#7c3aed',
    status: 'coming_soon',
    badge: { label: 'Locked', variant: 'gray' },
    pricing: {
      model: 'flat_monthly',
      startsAt: 4999,
      unit: 'per organisation/month',
      freeTrialDays: 30,
    },
    dependencies: ['pulse_core'],
    capabilities: ['finance_manage', 'accounting', 'gst_filing'],
    modules: [
      { name: 'Double-Entry Ledger',    description: 'Complete accounting with debit/credit postings',      icon: 'BookOpen' },
      { name: 'GST Filing Reports',     description: 'GSTR-1, GSTR-3B ready exports',                       icon: 'FileSpreadsheet' },
      { name: 'TDS Management',         description: 'Auto-TDS on supplier payments (194C)',                 icon: 'Percent' },
      { name: 'Bank Reconciliation',    description: 'Match bank statement to Pulse transactions',           icon: 'ArrowLeftRight' },
      { name: 'Branch P&L',             description: 'Profit and loss per branch, per lane, per driver',    icon: 'TrendingUp' },
      { name: 'Working Capital',        description: 'Cash flow forecasting and receivable insights',        icon: 'Wallet' },
    ],
    vision: 'Replace Tally for logistics. Every rupee tracked, every GST return ready, every branch profitable.',
    upgradeFrom: 'pulse_core',
  },

  pulse_fleet_pro: {
    id: 'pulse_fleet_pro',
    name: 'Pulse Fleet Pro',
    tagline: 'Every truck. Every driver. One screen.',
    description: 'Live fleet map, predictive maintenance alerts, fuel efficiency tracking, driver performance scoring, compliance document management, and vehicle utilisation reports.',
    icon: 'Truck',
    color: '#0891b2',
    status: 'coming_soon',
    badge: { label: 'Coming Soon', variant: 'gray' },
    pricing: {
      model: 'per_seat',
      startsAt: 299,
      unit: 'per vehicle/month',
    },
    dependencies: ['pulse_core'],
    capabilities: ['fleet_management', 'fleet_intelligence'],
    modules: [
      { name: 'Live Fleet Map',       description: 'All vehicles on one map, real-time',                  icon: 'Map' },
      { name: 'Maintenance Alerts',   description: 'Service due, insurance expiry, fitness alerts',       icon: 'Wrench' },
      { name: 'Fuel Analytics',       description: 'Mileage tracking and fuel efficiency by vehicle',     icon: 'Fuel' },
      { name: 'Driver Scoring',       description: 'Performance rating based on on-time, safety, speed', icon: 'Award' },
      { name: 'Utilisation Reports',  description: 'Days idle, revenue per vehicle, efficiency score',    icon: 'Activity' },
      { name: 'Document Vault',       description: 'All vehicle docs stored, expiry alerts',              icon: 'Shield' },
    ],
    vision: 'From 1 truck to 1,000 — manage your entire fleet with the visibility of a logistics CTO.',
  },

  pulse_people: {
    id: 'pulse_people',
    name: 'Pulse People',
    tagline: 'Your workforce. Simplified.',
    description: 'Driver payroll management, attendance tracking, advance and salary workflows, performance reviews, and compliance with labour laws.',
    icon: 'Users',
    color: '#0284c7',
    status: 'coming_soon',
    badge: { label: 'Coming Soon', variant: 'gray' },
    pricing: {
      model: 'per_seat',
      startsAt: 199,
      unit: 'per driver/month',
    },
    dependencies: ['pulse_core'],
    capabilities: ['payroll', 'hr_management'],
    modules: [
      { name: 'Driver Payroll',     description: 'Trip-based and monthly salary calculation',    icon: 'IndianRupee' },
      { name: 'Attendance',         description: 'Clock-in/out via GPS and app',                 icon: 'Clock' },
      { name: 'Advance Management', description: 'Track salary advances and deductions',         icon: 'Minus' },
      { name: 'Leave Management',   description: 'Leave requests and approval flow',             icon: 'Calendar' },
      { name: 'Compliance',         description: 'PF, ESIC, labour law compliance reports',      icon: 'FileCheck' },
    ],
    vision: 'The HR system logistics companies never had. Payroll, compliance, and performance — built for trucking.',
  },

  pulse_talent: {
    id: 'pulse_talent',
    name: 'Pulse Talent',
    tagline: 'Find. Verify. Hire. Instantly.',
    description: 'Driver recruitment marketplace, background verification, licence validation, skill-based matching, and structured onboarding for new drivers.',
    icon: 'UserSearch',
    color: '#9333ea',
    status: 'planned',
    badge: { label: 'Planned', variant: 'indigo' },
    pricing: {
      model: 'usage_based',
      unit: 'per successful hire',
      customQuote: true,
    },
    dependencies: ['pulse_core', 'pulse_people'],
    capabilities: ['talent_marketplace'],
    modules: [
      { name: 'Driver Marketplace',    description: 'Post requirements, receive applications',          icon: 'Search' },
      { name: 'Background Checks',     description: 'Police verification, address check integration',   icon: 'ShieldCheck' },
      { name: 'Licence Validation',    description: 'DL validity and traffic violation lookup',         icon: 'CreditCard' },
      { name: 'Skill Matching',        description: 'Match driver profile to route requirements',       icon: 'Sliders' },
      { name: 'Digital Onboarding',    description: 'Document collection and agreement signing',        icon: 'ClipboardList' },
    ],
    vision: 'Hire verified, experienced drivers in hours, not weeks. Built on the Pulse driver network.',
  },

  pulse_marketplace: {
    id: 'pulse_marketplace',
    name: 'Pulse Marketplace',
    tagline: 'Book. Bid. Move. Anywhere in India.',
    description: 'Open freight exchange where shippers post loads and carriers bid. Real-time auctions, reputation scores, verified carriers, and instant booking confirmation.',
    icon: 'Store',
    color: '#16a34a',
    status: 'early_access',
    badge: { label: 'Early Access', variant: 'green' },
    pricing: {
      model: 'commission',
      unit: '0.5% on awarded load value',
    },
    dependencies: ['pulse_core'],
    capabilities: ['marketplace_post', 'marketplace_bid'],
    modules: [
      { name: 'Load Board',            description: 'Post and discover freight loads nationwide',        icon: 'LayoutGrid' },
      { name: 'Live Bidding',          description: 'Real-time auction with instant notifications',       icon: 'Activity' },
      { name: 'Carrier Verification',  description: 'Verified carrier badges, document checks',          icon: 'BadgeCheck' },
      { name: 'Reputation System',     description: 'Ratings, reviews, on-time performance scores',      icon: 'Star' },
      { name: 'Instant Booking',       description: 'Direct book at fixed rate, no bidding',             icon: 'Zap' },
    ],
    vision: 'The Uber Freight of India. Connect 50,000 shippers with 5,00,000 carriers on one platform.',
  },

  pulse_exchange: {
    id: 'pulse_exchange',
    name: 'Pulse Exchange',
    tagline: 'Multi-company collaboration. Seamlessly.',
    description: 'B2B freight collaboration between fleet owners, brokers, and shippers. Shared trip visibility, joint invoicing, cross-org settlements, and network profit sharing.',
    icon: 'ArrowLeftRight',
    color: '#0369a1',
    status: 'private_beta',
    badge: { label: 'Private Beta', variant: 'indigo' },
    pricing: {
      model: 'flat_monthly',
      startsAt: 2999,
      unit: 'per organisation/month',
    },
    dependencies: ['pulse_core', 'pulse_marketplace'],
    capabilities: ['b2b_exchange', 'shared_ledger'],
    modules: [
      { name: 'Shared Trip Visibility', description: 'Both parties see the same trip data',            icon: 'Eye' },
      { name: 'Joint Invoicing',        description: 'Split billing between client and carrier',       icon: 'Receipt' },
      { name: 'Cross-Org Settlement',   description: 'Reconcile payables between companies',           icon: 'RefreshCw' },
      { name: 'Network Contracts',      description: 'Rate contracts between connected organisations', icon: 'FileSignature' },
      { name: 'Dispute Resolution',     description: 'Structured dispute and credit note workflow',    icon: 'Scale' },
    ],
    vision: 'The settlement layer for Indian freight. Every broker, shipper, and carrier connected — books balanced automatically.',
  },

  pulse_compliance: {
    id: 'pulse_compliance',
    name: 'Pulse Compliance',
    tagline: 'Never lose a truck to an expired certificate.',
    description: 'Fleet and driver compliance management: vehicle RC, insurance, fitness, permits, driver DL and medical — with multi-level expiry alerts, full audit trails, and KYC verification for clients and suppliers.',
    icon: 'ShieldCheck',
    color: '#0369a1',
    status: 'early_access',
    badge: { label: 'Early Access', variant: 'green' },
    pricing: {
      model: 'flat_monthly',
      startsAt: 1999,
      unit: 'per organisation/month',
    },
    dependencies: ['pulse_core'],
    capabilities: ['compliance_dashboard', 'document_vault', 'expiry_alerts', 'audit_trail_full', 'kyc_verification'],
    modules: [
      { name: 'Compliance Dashboard',   description: 'Fleet health score with expiry risk heatmap',   icon: 'Activity' },
      { name: 'Document Vault',         description: 'RC, insurance, fitness, DL — all in one place', icon: 'Archive' },
      { name: 'Multi-Level Alerts',     description: '60-day, 30-day, 7-day, and day-of expiry alerts', icon: 'Bell' },
      { name: 'Full Audit Trail',       description: 'Every upload, view, and approval logged',        icon: 'FileCheck' },
      { name: 'KYC Verification',       description: 'GSTIN, CIN, PAN lookup for clients and suppliers', icon: 'BadgeCheck' },
      { name: 'Regulatory Checklist',   description: 'RTO compliance, FSSAI, dangerous goods checks', icon: 'ClipboardList' },
    ],
    vision: 'Eliminate compliance failures before they happen. Every vehicle road-legal, every driver document current, every audit ready.',
  },

  pulse_ai: {
    id: 'pulse_ai',
    name: 'Pulse AI',
    tagline: 'Your operations copilot. Powered by AI.',
    description: 'AI-driven operations intelligence: exception alerts, route optimisation, demand forecasting, automated dispatching, and a natural language assistant for daily operations.',
    icon: 'Brain',
    color: '#6d28d9',
    status: 'coming_soon',
    badge: { label: 'Coming Soon', variant: 'indigo' },
    pricing: {
      model: 'per_seat',
      startsAt: 9999,
      unit: 'per organisation/month',
      customQuote: true,
    },
    dependencies: ['pulse_core'],
    capabilities: ['ai_copilot', 'ai_intelligence'],
    modules: [
      { name: 'Operations Copilot',     description: 'Natural language queries over your trip data',    icon: 'MessageCircle' },
      { name: 'Exception Alerts',       description: 'Proactive alerts for late deliveries, overdue payments', icon: 'AlertTriangle' },
      { name: 'Demand Forecasting',     description: 'Predict load requirements by lane and season',    icon: 'TrendingUp' },
      { name: 'Rate Intelligence',      description: 'AI-recommended freight rates by route',           icon: 'DollarSign' },
      { name: 'Auto-Dispatch',          description: 'AI assigns best driver/vehicle to incoming loads', icon: 'Cpu' },
      { name: 'Financial Insights',     description: 'Why is my margin dropping? AI explains.',         icon: 'Lightbulb' },
    ],
    vision: 'Every logistics manager with an AI co-pilot. Decisions in seconds, exceptions caught before they become problems.',
  },
};

// ── Utility functions ─────────────────────────────────────────────────────────

export function getProduct(id: ProductId): ProductDefinition {
  return PRODUCT_REGISTRY[id];
}

export function getAllProducts(): ProductDefinition[] {
  return Object.values(PRODUCT_REGISTRY);
}

const HIDDEN_SUITE_PRODUCT_IDS: ReadonlySet<ProductId> = new Set([
  'pulse_pod_pro',
  'pulse_invoice_pro',
]);

const DISPLAY_PRIORITY: ProductId[] = [...BUNDLED_ACTIVE_PRODUCT_IDS];

/** Returns products in display order (Core trio first, then by status priority) */
export function getProductsInDisplayOrder(): ProductDefinition[] {
  const statusOrder: Record<ProductStatus, number> = {
    active: 0, early_access: 1, private_beta: 2, coming_soon: 3, planned: 4,
  };
  return getAllProducts()
    .filter((product) => !HIDDEN_SUITE_PRODUCT_IDS.has(product.id))
    .sort((a, b) => {
    const ai = DISPLAY_PRIORITY.indexOf(a.id);
    const bi = DISPLAY_PRIORITY.indexOf(b.id);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return statusOrder[a.status] - statusOrder[b.status];
  });
}

/** Returns all products that depend on a given product */
export function getDependents(id: ProductId): ProductDefinition[] {
  return getAllProducts().filter(p => p.dependencies.includes(id));
}

/** Returns true if all dependencies for a product are in the active set */
export function canActivate(id: ProductId, activeProductIds: Set<ProductId>): boolean {
  if (isWorkspaceProductLocked(id)) return false;
  const product = PRODUCT_REGISTRY[id];
  return product.dependencies.every(dep => activeProductIds.has(dep));
}

export const BADGE_COLORS: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  green:  { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  indigo: { bg: '#E5F4FB', text: '#4D3636', border: 'rgba(77, 54, 54, 0.22)' },
  amber:  { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  rose:   { bg: '#fff1f2', text: '#be123c', border: '#fda4af' },
  gray:   { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
};
