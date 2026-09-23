/**
 * Pulse Platform — suite catalogue for workspace hub and product panel.
 *
 * Suites: Execution, Commerce, Network, Finance, Compliance, Workforce,
 * Intelligence, Collaboration.
 */
import {
  isBundledActiveProduct,
  type ProductId,
} from "@/lib/productRegistry";
import {
  isCommercePlatformModule,
  isWorkspaceProductLocked,
  isCommerceDataQueryEnabled,
} from "@/lib/suite/productLock";

export type PlatformSuiteId =
  | "execution"
  | "commerce"
  | "network"
  | "finance"
  | "compliance"
  | "workforce"
  | "intelligence"
  | "collaboration";

/** @deprecated Use PlatformSuiteId */
export type PlatformPillarId = PlatformSuiteId;

export type PlatformModule = {
  id: string;
  label: string;
  /** Primary product for logo, catalogue drill-down, and activation. */
  productId: ProductId;
  /** When set, module is active if any listed product is active/bundled. */
  activeProductIds?: readonly ProductId[];
  /** Roadmap module — always shown locked in the hub until shipped. */
  future?: boolean;
};

export type PlatformSuite = {
  id: PlatformSuiteId;
  label: string;
  modules: PlatformModule[];
};

/** @deprecated Use PlatformSuite */
export type PlatformPillar = PlatformSuite;

export const PULSE_PLATFORM_TITLE = "Pulse Platform";

export const PULSE_PLATFORM_CATALOG: PlatformSuite[] = [
  {
    id: "execution",
    label: "Execution Suite",
    modules: [
      {
        id: "execution_indent",
        label: "Indent",
        productId: "pulse_core",
      },
      {
        id: "execution_core",
        label: "Dispatch",
        productId: "pulse_core",
      },
      {
        id: "execution_route",
        label: "Route",
        productId: "pulse_ai",
        future: true,
      },
      {
        id: "execution_fleet",
        label: "Fleet",
        productId: "pulse_fleet_pro",
      },
      {
        id: "execution_driver",
        label: "Driver",
        productId: "pulse_driver",
      },
    ],
  },
  {
    id: "commerce",
    label: "Commerce Suite",
    modules: [
      {
        id: "commerce_catalog",
        label: "Catalog",
        productId: "pulse_marketplace",
        activeProductIds: ["pulse_marketplace", "pulse_core"],
        future: true,
      },
      {
        id: "commerce_inventory",
        label: "Inventory",
        productId: "pulse_marketplace",
        activeProductIds: ["pulse_marketplace", "pulse_core"],
        future: true,
      },
      {
        id: "commerce_orders",
        label: "Orders",
        productId: "pulse_marketplace",
        activeProductIds: ["pulse_marketplace", "pulse_core"],
        future: true,
      },
      {
        id: "commerce_merge",
        label: "Merge",
        productId: "pulse_marketplace",
        activeProductIds: ["pulse_marketplace", "pulse_core"],
        future: true,
      },
    ],
  },
  {
    id: "network",
    label: "Network Suite",
    modules: [
      {
        id: "network_hub",
        label: "Network",
        productId: "pulse_network",
      },
      {
        id: "network_exchange",
        label: "Exchange",
        productId: "pulse_exchange",
      },
      {
        id: "network_marketplace",
        label: "Marketplace",
        productId: "pulse_marketplace",
      },
      {
        id: "network_bidding",
        label: "Bidding",
        productId: "pulse_network_bidding",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance Suite",
    modules: [
      {
        id: "finance_hub",
        label: "Finance",
        productId: "pulse_finance_pro",
        future: true,
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance Suite",
    modules: [
      {
        id: "compliance_hub",
        label: "Compliance",
        productId: "pulse_compliance",
      },
    ],
  },
  {
    id: "workforce",
    label: "Workforce Suite",
    modules: [
      {
        id: "workforce_people",
        label: "People",
        productId: "pulse_people",
      },
      {
        id: "workforce_talent",
        label: "Talent",
        productId: "pulse_talent",
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence Suite",
    modules: [
      {
        id: "intelligence_ai",
        label: "AI",
        productId: "pulse_ai",
      },
      {
        id: "intelligence_insights",
        label: "Insights",
        productId: "pulse_ai",
        future: true,
      },
      {
        id: "intelligence_forecast",
        label: "Forecast",
        productId: "pulse_ai",
        future: true,
      },
      {
        id: "intelligence_automate",
        label: "Automate",
        productId: "pulse_ai",
        future: true,
      },
    ],
  },
  {
    id: "collaboration",
    label: "Collaboration Suite",
    modules: [
      {
        id: "collaboration_chat",
        label: "Chat",
        productId: "pulse_chat",
      },
    ],
  },
];

const PRODUCT_SUITE_MAP: Record<ProductId, PlatformSuiteId> = {
  pulse_core: "execution",
  pulse_driver: "execution",
  pulse_pod_pro: "execution",
  pulse_fleet_pro: "execution",
  pulse_marketplace: "network",
  pulse_network: "network",
  pulse_exchange: "network",
  pulse_network_bidding: "network",
  pulse_finance_pro: "finance",
  pulse_invoice_pro: "finance",
  pulse_compliance: "compliance",
  pulse_people: "workforce",
  pulse_talent: "workforce",
  pulse_ai: "intelligence",
  pulse_chat: "collaboration",
  pulse_reach: "network",
};

export function getPlatformModuleCount(): number {
  return PULSE_PLATFORM_CATALOG.reduce(
    (sum, suite) => sum + suite.modules.length,
    0,
  );
}

export function getSuiteForProduct(productId: ProductId): PlatformSuiteId {
  return PRODUCT_SUITE_MAP[productId] ?? "execution";
}

/** @deprecated Use getSuiteForProduct */
export const getPillarForProduct = getSuiteForProduct;

export function getSuiteById(id: PlatformSuiteId): PlatformSuite {
  const suite = PULSE_PLATFORM_CATALOG.find((entry) => entry.id === id);
  if (!suite) throw new Error(`Unknown platform suite: ${id}`);
  return suite;
}

/** @deprecated Use getSuiteById */
export const getPillarById = getSuiteById;

export function isPlatformModuleActive(
  module: PlatformModule,
  activeProductIds: Set<ProductId>,
): boolean {
  if (module.future) return false;
  if (isCommercePlatformModule(module.id) && !isCommerceDataQueryEnabled()) {
    return false;
  }
  if (isWorkspaceProductLocked(module.productId)) return false;
  const ids = module.activeProductIds ?? [module.productId];
  return ids.some(
    (id) =>
      !isWorkspaceProductLocked(id) &&
      (activeProductIds.has(id) || isBundledActiveProduct(id)),
  );
}

export function countActivePlatformModules(
  activeProductIds: Set<ProductId>,
): number {
  let count = 0;
  for (const suite of PULSE_PLATFORM_CATALOG) {
    for (const module of suite.modules) {
      if (isPlatformModuleActive(module, activeProductIds)) count += 1;
    }
  }
  return count;
}
