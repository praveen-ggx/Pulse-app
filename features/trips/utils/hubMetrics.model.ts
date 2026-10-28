/** Hub rail types with no imports, so trips.service can use them without an import cycle. */

export type TripMetricId =
  | "indent"
  | "unassigned"
  | "assigned"
  | "loading"
  | "in_transit"
  | "unloading"
  | "delivered_docs_pending";

export type HubTripFact = {
  id: string;
  status: string | null;
  driver_id: string | null;
  indent_id: string | null;
  pickup_date: string | null;
  created_at: string | null;
};

export type HubIndentFact = {
  id: string;
  status: string | null;
  pickup_date: string | null;
  created_at: string | null;
};

export type OrgHubCountSource = {
  trips: HubTripFact[];
  documentTripIds: string[];
  indents: HubIndentFact[];
};
