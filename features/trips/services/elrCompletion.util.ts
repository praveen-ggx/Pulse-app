/**
 * E-LR completion. Trip identity can be prefilled. Missing LR fields are
 * entered on the receipt only and are not written back to the trip.
 * No approved carrier declaration is stored in the product, so none is printed.
 */

import {
  buildElrSnapshot,
  type ElrSnapshot,
  type ElrTripSource,
} from "@/features/trips/services/elrSnapshot.util";

export const ELR_VEHICLE_TYPES = [
  "Open body",
  "Container",
  "Trailer",
  "Tanker",
  "Tipper",
  "LCV",
] as const;

export const ELR_QUANTITY_UNITS = ["Nos", "Bags", "Boxes", "Cartons", "Drums", "Bundles"] as const;

export const ELR_SOURCE_DOCUMENT_TYPES = [
  { id: "tax_invoice", label: "Tax invoice" },
  { id: "bill_of_supply", label: "Bill of supply" },
  { id: "delivery_challan", label: "Delivery challan" },
  { id: "other", label: "Other transport document" },
] as const;

export type ElrGstChoice = "" | "registered" | "unregistered";
export type ElrWeightUnit = "" | "kg" | "tons";
export type ElrSourceDocumentType = "" | (typeof ELR_SOURCE_DOCUMENT_TYPES)[number]["id"];

export type ElrCompletionDraft = {
  consignorName: string;
  consignorAddress: string;
  consignorCity: string;
  consignorState: string;
  consignorPin: string;
  consignorGst: ElrGstChoice;
  consignorGstin: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneeCity: string;
  consigneeState: string;
  consigneePin: string;
  consigneeGst: ElrGstChoice;
  consigneeGstin: string;
  transporterName: string;
  transporterAddress: string;
  transporterCity: string;
  transporterState: string;
  transporterPin: string;
  transporterGst: ElrGstChoice;
  transporterGstin: string;
  vehicleType: string;
  origin: string;
  destination: string;
  cargoDescription: string;
  quantity: string;
  quantityUnit: string;
  weight: string;
  weightUnit: ElrWeightUnit;
  hsn: string;
  sourceDocumentType: ElrSourceDocumentType;
  sourceDocumentNumber: string;
  sourceDocumentDate: string;
  goodsValue: string;
  freight: string;
  ewayBillNumber: string;
  orderReference: string;
  driverName: string;
  driverLicense: string;
};

export type ElrFieldIssue = { field: string; label: string; message: string };

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PIN_PATTERN = /^[1-9][0-9]{5}$/;

export function emptyElrCompletionDraft(): ElrCompletionDraft {
  return {
    consignorName: "",
    consignorAddress: "",
    consignorCity: "",
    consignorState: "",
    consignorPin: "",
    consignorGst: "",
    consignorGstin: "",
    consigneeName: "",
    consigneeAddress: "",
    consigneeCity: "",
    consigneeState: "",
    consigneePin: "",
    consigneeGst: "",
    consigneeGstin: "",
    transporterName: "",
    transporterAddress: "",
    transporterCity: "",
    transporterState: "",
    transporterPin: "",
    transporterGst: "",
    transporterGstin: "",
    vehicleType: "",
    origin: "",
    destination: "",
    cargoDescription: "",
    quantity: "",
    quantityUnit: "",
    weight: "",
    weightUnit: "",
    hsn: "",
    sourceDocumentType: "",
    sourceDocumentNumber: "",
    sourceDocumentDate: "",
    goodsValue: "",
    freight: "",
    ewayBillNumber: "",
    orderReference: "",
    driverName: "",
    driverLicense: "",
  };
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function fillEmpty(current: string, next: string | null | undefined): string {
  return current.trim() ? current : text(next);
}

/** Trip fields only. Destination is never copied into the consignee. */
export function draftFromTripSource(source: ElrTripSource): ElrCompletionDraft {
  const draft = emptyElrCompletionDraft();
  draft.consignorName = text(source.clientName);
  draft.transporterName = text(source.transporterName);
  draft.origin = text(source.origin);
  draft.destination = text(source.destination);
  draft.cargoDescription = text(source.loadType);
  draft.driverName = text(source.driverName);
  if (source.loadTons != null && Number.isFinite(source.loadTons) && source.loadTons > 0) {
    draft.weight = String(source.loadTons);
    draft.weightUnit = "tons";
  }
  if (source.freight != null && Number.isFinite(source.freight) && source.freight > 0) {
    draft.freight = String(source.freight);
  }
  return draft;
}

/** Values already stored on the trip. The E-LR form must not rewrite them. */
export function elrTripLockedFields(source: ElrTripSource): Array<keyof ElrCompletionDraft> {
  const fromTrip = draftFromTripSource(source);
  return (Object.keys(fromTrip) as Array<keyof ElrCompletionDraft>).filter((key) =>
    String(fromTrip[key] ?? "").trim(),
  );
}

/** Puts trip-owned values back so a receipt edit cannot replace them. */
export function lockElrTripFields(
  draft: ElrCompletionDraft,
  source: ElrTripSource,
): ElrCompletionDraft {
  const fromTrip = draftFromTripSource(source);
  const next: ElrCompletionDraft = { ...draft };
  for (const key of elrTripLockedFields(source)) {
    const value = fromTrip[key];
    if (typeof value === "string") {
      next[key] = value as never;
    }
  }
  return next;
}

export type ElrCanonicalPrefill = {
  consignorAddress?: string | null;
  consignorCity?: string | null;
  consignorState?: string | null;
  consignorPin?: string | null;
  consignorGstin?: string | null;
  consignorUnregistered?: boolean;
  consigneeName?: string | null;
  consigneeAddress?: string | null;
  consigneeCity?: string | null;
  consigneeState?: string | null;
  consigneePin?: string | null;
  consigneeGstin?: string | null;
  transporterAddress?: string | null;
  transporterCity?: string | null;
  transporterState?: string | null;
  transporterPin?: string | null;
  transporterGstin?: string | null;
  transporterUnregistered?: boolean;
  vehicleType?: string | null;
  orderReference?: string | null;
  goodsValue?: number | null;
  ewayBillNumber?: string | null;
};

/** Fills only blanks. A destination label is never written into the consignee name. */
export function applyElrCanonicalPrefill(
  draft: ElrCompletionDraft,
  prefill: ElrCanonicalPrefill,
): ElrCompletionDraft {
  const next: ElrCompletionDraft = { ...draft };
  next.consignorAddress = fillEmpty(next.consignorAddress, prefill.consignorAddress);
  next.consignorCity = fillEmpty(next.consignorCity, prefill.consignorCity);
  next.consignorState = fillEmpty(next.consignorState, prefill.consignorState);
  next.consignorPin = fillEmpty(next.consignorPin, prefill.consignorPin);
  if (!next.consignorGst && prefill.consignorUnregistered) next.consignorGst = "unregistered";
  if (!next.consignorGstin && text(prefill.consignorGstin)) {
    next.consignorGstin = text(prefill.consignorGstin).toUpperCase();
    if (!next.consignorGst) next.consignorGst = "registered";
  }
  const destination = text(next.destination);
  const consigneeName = text(prefill.consigneeName);
  if (!next.consigneeName && consigneeName && consigneeName.toLowerCase() !== destination.toLowerCase()) {
    next.consigneeName = consigneeName;
  }
  next.consigneeAddress = fillEmpty(next.consigneeAddress, prefill.consigneeAddress);
  next.consigneeCity = fillEmpty(next.consigneeCity, prefill.consigneeCity);
  next.consigneeState = fillEmpty(next.consigneeState, prefill.consigneeState);
  next.consigneePin = fillEmpty(next.consigneePin, prefill.consigneePin);
  if (!next.consigneeGstin && text(prefill.consigneeGstin)) {
    next.consigneeGstin = text(prefill.consigneeGstin).toUpperCase();
    if (!next.consigneeGst) next.consigneeGst = "registered";
  }
  next.transporterAddress = fillEmpty(next.transporterAddress, prefill.transporterAddress);
  next.transporterCity = fillEmpty(next.transporterCity, prefill.transporterCity);
  next.transporterState = fillEmpty(next.transporterState, prefill.transporterState);
  next.transporterPin = fillEmpty(next.transporterPin, prefill.transporterPin);
  if (!next.transporterGst && prefill.transporterUnregistered) next.transporterGst = "unregistered";
  if (!next.transporterGstin && text(prefill.transporterGstin)) {
    next.transporterGstin = text(prefill.transporterGstin).toUpperCase();
    if (!next.transporterGst) next.transporterGst = "registered";
  }
  next.vehicleType = fillEmpty(next.vehicleType, prefill.vehicleType);
  next.orderReference = fillEmpty(next.orderReference, prefill.orderReference);
  if (!next.goodsValue && prefill.goodsValue != null && prefill.goodsValue > 0) {
    next.goodsValue = String(prefill.goodsValue);
  }
  next.ewayBillNumber = fillEmpty(next.ewayBillNumber, prefill.ewayBillNumber);
  return applyElrRoutePlaces(next);
}

/** Trip-card route is "City, State" when both parts were saved. */
export function splitElrRoutePlace(location: string | null | undefined): {
  city: string;
  state: string;
} {
  const raw = (location ?? "").trim();
  if (!raw) return { city: "", state: "" };
  const comma = raw.indexOf(",");
  if (comma === -1) return { city: raw, state: "" };
  return {
    city: raw.slice(0, comma).trim(),
    state: raw.slice(comma + 1).trim(),
  };
}

/**
 * Movement stays the trip-card route. Consignor place follows origin.
 * Consignee place follows destination. The destination is never the consignee name.
 */
export function applyElrRoutePlaces(draft: ElrCompletionDraft): ElrCompletionDraft {
  const next: ElrCompletionDraft = { ...draft };
  const origin = splitElrRoutePlace(next.origin);
  const destination = splitElrRoutePlace(next.destination);
  if (origin.city) next.consignorCity = origin.city;
  if (origin.state) next.consignorState = origin.state;
  if (destination.city) next.consigneeCity = destination.city;
  if (destination.state) next.consigneeState = destination.state;
  return next;
}

export function alignElrDraftToTripRoute(
  draft: ElrCompletionDraft,
  source: ElrTripSource,
): ElrCompletionDraft {
  const next: ElrCompletionDraft = { ...draft };
  const origin = text(source.origin);
  const destination = text(source.destination);
  if (origin) next.origin = origin;
  if (destination) next.destination = destination;
  return applyElrRoutePlaces(next);
}

function canonicalDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const year = iso ? Number(iso[1]) : dmy ? Number(dmy[3]) : NaN;
  const month = iso ? Number(iso[2]) : dmy ? Number(dmy[2]) : NaN;
  const day = iso ? Number(iso[3]) : dmy ? Number(dmy[1]) : NaN;
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function validDate(value: string): boolean {
  return canonicalDate(value) != null;
}

function positiveNumber(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function partyIssues(
  prefix: string,
  fieldPrefix: string,
  name: string,
  address: string,
  city: string,
  state: string,
  pin: string,
  gst: ElrGstChoice,
  gstin: string,
): ElrFieldIssue[] {
  const issues: ElrFieldIssue[] = [];
  const add = (field: string, label: string, message: string) => {
    issues.push({ field: `${fieldPrefix}${field}`, label: `${prefix} ${label}`, message });
  };
  if (!name.trim()) add("Name", "name", "Required");
  if (!address.trim()) add("Address", "address", "Required");
  if (!city.trim()) add("City", "city", "Required");
  if (!state.trim()) add("State", "state", "Required");
  if (!PIN_PATTERN.test(pin.trim())) {
    add("Pin", "PIN", pin.trim() ? "Enter a 6-digit PIN" : "Required");
  }
  if (gst === "registered") {
    if (!GSTIN_PATTERN.test(gstin.trim().toUpperCase())) {
      add("Gstin", "GSTIN", gstin.trim() ? "Enter a valid GSTIN" : "Required");
    }
  } else if (gst !== "unregistered") {
    add("Gst", "GST status", "Choose registered or unregistered");
  }
  return issues;
}

/** Business-required E-LR fields. GSTIN is required only when the party is marked registered. */
export function validateElrCompletion(draft: ElrCompletionDraft): ElrFieldIssue[] {
  const issues: ElrFieldIssue[] = [
    ...partyIssues(
      "Consignor",
      "consignor",
      draft.consignorName,
      draft.consignorAddress,
      draft.consignorCity,
      draft.consignorState,
      draft.consignorPin,
      draft.consignorGst,
      draft.consignorGstin,
    ),
    ...partyIssues(
      "Consignee",
      "consignee",
      draft.consigneeName,
      draft.consigneeAddress,
      draft.consigneeCity,
      draft.consigneeState,
      draft.consigneePin,
      draft.consigneeGst,
      draft.consigneeGstin,
    ),
    ...partyIssues(
      "Transporter",
      "transporter",
      draft.transporterName,
      draft.transporterAddress,
      draft.transporterCity,
      draft.transporterState,
      draft.transporterPin,
      draft.transporterGst,
      draft.transporterGstin,
    ),
  ];
  if (!draft.vehicleType.trim()) {
    issues.push({ field: "vehicleType", label: "Vehicle type", message: "Required" });
  }
  if (!draft.origin.trim()) {
    issues.push({ field: "origin", label: "Origin", message: "Required" });
  }
  if (!draft.destination.trim()) {
    issues.push({ field: "destination", label: "Destination", message: "Required" });
  }
  if (!draft.cargoDescription.trim()) {
    issues.push({ field: "cargoDescription", label: "Goods description", message: "Required" });
  }
  if (positiveNumber(draft.quantity) == null) {
    issues.push({
      field: "quantity",
      label: "Quantity",
      message: draft.quantity.trim() ? "Enter a positive quantity" : "Required",
    });
  }
  if (!draft.quantityUnit.trim()) {
    issues.push({ field: "quantityUnit", label: "Quantity unit", message: "Required" });
  }
  if (positiveNumber(draft.weight) == null) {
    issues.push({
      field: "weight",
      label: "Weight",
      message: draft.weight.trim() ? "Enter a positive weight" : "Required",
    });
  }
  if (draft.weightUnit !== "kg" && draft.weightUnit !== "tons") {
    issues.push({ field: "weightUnit", label: "Weight unit", message: "Required" });
  }
  const hsn = draft.hsn.trim();
  if (hsn && !/^\d{4,8}$/.test(hsn)) {
    issues.push({ field: "hsn", label: "HSN code", message: "Use 4–8 digits" });
  }
  if (!draft.sourceDocumentType) {
    issues.push({ field: "sourceDocumentType", label: "Source document", message: "Required" });
  }
  if (!draft.sourceDocumentNumber.trim()) {
    issues.push({
      field: "sourceDocumentNumber",
      label: "Source document number",
      message: "Required",
    });
  }
  if (!validDate(draft.sourceDocumentDate.trim())) {
    issues.push({
      field: "sourceDocumentDate",
      label: "Source document date",
      message: draft.sourceDocumentDate.trim() ? "Use DD/MM/YYYY" : "Required",
    });
  }
  if (positiveNumber(draft.goodsValue) == null) {
    issues.push({
      field: "goodsValue",
      label: "Goods value",
      message: draft.goodsValue.trim() ? "Enter a positive amount" : "Required",
    });
  }
  const eway = draft.ewayBillNumber.trim();
  if (eway && !/^\d{12}$/.test(eway)) {
    issues.push({ field: "ewayBillNumber", label: "E-way bill number", message: "Use 12 digits" });
  }
  if (draft.freight.trim() && positiveNumber(draft.freight) == null) {
    issues.push({ field: "freight", label: "Freight", message: "Enter a positive amount" });
  }
  return issues;
}

export function elrCompletionMessage(issues: readonly Pick<ElrFieldIssue, "label">[]): string {
  return `E-LR cannot be generated.\n\nComplete the following:\n${issues
    .map((issue) => `• ${issue.label}`)
    .join("\n")}`;
}

function partySnapshot(
  name: string,
  address: string,
  city: string,
  state: string,
  pin: string,
  gst: ElrGstChoice,
  gstin: string,
): ElrSnapshot["consignor"] {
  return {
    name: name.trim(),
    address: address.trim(),
    city: city.trim(),
    state: state.trim(),
    pin: pin.trim(),
    gstStatus: gst === "unregistered" ? "unregistered" : "registered",
    ...(gst === "registered" ? { gstin: gstin.trim().toUpperCase() } : {}),
  };
}

export function buildCompletedElrSnapshot(input: {
  source: ElrTripSource;
  draft: ElrCompletionDraft;
  generatedBy?: string | null;
}): { ok: true; snapshot: ElrSnapshot } | { ok: false; missing: string[] } {
  const draft = alignElrDraftToTripRoute(input.draft, input.source);
  const identity = buildElrSnapshot({
    ...input.source,
    clientName: draft.consignorName,
    transporterName: draft.transporterName,
    origin: draft.origin,
    destination: draft.destination,
    loadType: draft.cargoDescription,
  });
  const issues = validateElrCompletion(draft);
  const missing = [
    ...(identity.ok ? [] : identity.missing),
    ...issues.map((issue) => issue.label),
  ];
  if (!identity.ok || issues.length > 0) return { ok: false, missing };

  const quantity = positiveNumber(draft.quantity)!;
  const weight = positiveNumber(draft.weight)!;
  const goodsValue = positiveNumber(draft.goodsValue)!;
  const freight = draft.freight.trim() ? positiveNumber(draft.freight) : null;
  const weightTons = draft.weightUnit === "tons" ? weight : weight / 1000;
  const snapshot: ElrSnapshot = {
    ...identity.snapshot,
    workspaceId: text(input.source.organizationId) || undefined,
    generatedBy: text(input.generatedBy) || undefined,
    consignor: partySnapshot(
      draft.consignorName,
      draft.consignorAddress,
      draft.consignorCity,
      draft.consignorState,
      draft.consignorPin,
      draft.consignorGst,
      draft.consignorGstin,
    ),
    consignee: partySnapshot(
      draft.consigneeName,
      draft.consigneeAddress,
      draft.consigneeCity,
      draft.consigneeState,
      draft.consigneePin,
      draft.consigneeGst,
      draft.consigneeGstin,
    ),
    transporter: partySnapshot(
      draft.transporterName,
      draft.transporterAddress,
      draft.transporterCity,
      draft.transporterState,
      draft.transporterPin,
      draft.transporterGst,
      draft.transporterGstin,
    ),
    vehicle: {
      ...identity.snapshot.vehicle,
      type: draft.vehicleType.trim(),
    },
    route: {
      origin: draft.origin.trim(),
      destination: draft.destination.trim(),
    },
    cargo: {
      description: draft.cargoDescription.trim(),
      quantity,
      unit: draft.quantityUnit.trim(),
      weight,
      weightUnit: draft.weightUnit === "kg" ? "kg" : "tons",
      weightTons,
      ...(draft.hsn.trim() ? { hsn: draft.hsn.trim() } : {}),
    },
    commercial: {
      goodsValue,
      sourceDocument: {
        type: draft.sourceDocumentType as Exclude<ElrSourceDocumentType, "">,
        number: draft.sourceDocumentNumber.trim(),
        date: canonicalDate(draft.sourceDocumentDate.trim()) ?? draft.sourceDocumentDate.trim(),
      },
      ...(freight != null ? { freight } : {}),
      ...(text(input.source.freightBasis)
        ? { freightBasis: text(input.source.freightBasis) }
        : {}),
    },
  };
  const orderReference = draft.orderReference.trim();
  const eway = draft.ewayBillNumber.trim();
  if (orderReference || eway) {
    snapshot.references = {
      ...(orderReference ? { orderNumber: orderReference } : {}),
      ...(eway ? { ewayBillNumber: eway } : {}),
    };
  }
  const license = draft.driverLicense.trim();
  const driverName = draft.driverName.trim();
  if (driverName || license) {
    snapshot.driver = {
      ...(driverName ? { name: driverName } : {}),
      ...(driverName && text(input.source.driverPhone)
        ? { phone: text(input.source.driverPhone) }
        : {}),
      ...(license ? { license } : {}),
    };
  } else {
    delete snapshot.driver;
  }
  return { ok: true, snapshot };
}

export type ElrDetailPhase =
  | "not_eligible"
  | "before_loading"
  | "start"
  | "ready_to_complete"
  | "ready_to_generate"
  | "view";

export function elrDetailPhase(input: {
  eligible: boolean;
  hasExisting: boolean;
  missingCount: number;
  hasDraft?: boolean;
  afterLoading?: boolean;
}): ElrDetailPhase {
  if (input.hasExisting) return "view";
  if (input.afterLoading === false) return "before_loading";
  if (!input.eligible) return "not_eligible";
  if (input.hasDraft) {
    return input.missingCount > 0 ? "ready_to_complete" : "ready_to_generate";
  }
  return "start";
}

/** Missing LR fields never block the form. A finished receipt is the view state. */
export function elrFormCanOpen(input: { eligible: boolean; hasFinal: boolean }): boolean {
  return input.eligible && !input.hasFinal;
}

function partyIsComplete(party: ElrSnapshot["consignor"] | undefined): boolean {
  if (!party?.name?.trim() || !party.address?.trim() || !party.city?.trim()) return false;
  if (!party.state?.trim() || !party.pin?.trim()) return false;
  if (party.gstStatus === "registered") return Boolean(party.gstin?.trim());
  return party.gstStatus === "unregistered";
}

/** Receipts saved before the completion form do not count as a finished E-LR. */
export function isCompleteElrSnapshot(snapshot: ElrSnapshot): boolean {
  const cargo = snapshot.cargo;
  const sourceDocument = snapshot.commercial?.sourceDocument;
  return (
    partyIsComplete(snapshot.consignor) &&
    partyIsComplete(snapshot.consignee) &&
    partyIsComplete(snapshot.transporter) &&
    Boolean(snapshot.vehicle.type?.trim()) &&
    Boolean(cargo?.description?.trim()) &&
    cargo?.quantity != null &&
    Boolean(cargo.unit?.trim()) &&
    cargo.weight != null &&
    (cargo.weightUnit === "kg" || cargo.weightUnit === "tons") &&
    snapshot.commercial?.goodsValue != null &&
    Boolean(sourceDocument?.type && sourceDocument.number?.trim() && sourceDocument.date?.trim())
  );
}

/** Copies values already printed on an incomplete receipt into the form. Does not invent the rest. */
export function mergeStoredElrIntoDraft(
  draft: ElrCompletionDraft,
  snapshot: ElrSnapshot,
): ElrCompletionDraft {
  const next: ElrCompletionDraft = { ...draft };
  const use = (current: string, value: string | null | undefined) =>
    current.trim() ? current : (value ?? "").trim();
  next.consignorName = use(next.consignorName, snapshot.consignor.name);
  next.consignorAddress = use(next.consignorAddress, snapshot.consignor.address);
  next.consignorCity = use(next.consignorCity, snapshot.consignor.city);
  next.consignorState = use(next.consignorState, snapshot.consignor.state);
  next.consignorPin = use(next.consignorPin, snapshot.consignor.pin);
  if (!next.consignorGst && snapshot.consignor.gstStatus) next.consignorGst = snapshot.consignor.gstStatus;
  next.consignorGstin = use(next.consignorGstin, snapshot.consignor.gstin);
  next.consigneeName = use(next.consigneeName, snapshot.consignee?.name);
  next.consigneeAddress = use(next.consigneeAddress, snapshot.consignee?.address);
  next.consigneeCity = use(next.consigneeCity, snapshot.consignee?.city);
  next.consigneeState = use(next.consigneeState, snapshot.consignee?.state);
  next.consigneePin = use(next.consigneePin, snapshot.consignee?.pin);
  if (!next.consigneeGst && snapshot.consignee?.gstStatus) {
    next.consigneeGst = snapshot.consignee.gstStatus;
  }
  next.consigneeGstin = use(next.consigneeGstin, snapshot.consignee?.gstin);
  next.transporterName = use(next.transporterName, snapshot.transporter.name);
  next.transporterAddress = use(next.transporterAddress, snapshot.transporter.address);
  next.transporterCity = use(next.transporterCity, snapshot.transporter.city);
  next.transporterState = use(next.transporterState, snapshot.transporter.state);
  next.transporterPin = use(next.transporterPin, snapshot.transporter.pin);
  if (!next.transporterGst && snapshot.transporter.gstStatus) {
    next.transporterGst = snapshot.transporter.gstStatus;
  }
  next.transporterGstin = use(next.transporterGstin, snapshot.transporter.gstin);
  next.vehicleType = use(next.vehicleType, snapshot.vehicle.type);
  next.origin = use(next.origin, snapshot.route.origin);
  next.destination = use(next.destination, snapshot.route.destination);
  next.cargoDescription = use(next.cargoDescription, snapshot.cargo?.description);
  if (!next.quantity && snapshot.cargo?.quantity != null) next.quantity = String(snapshot.cargo.quantity);
  next.quantityUnit = use(next.quantityUnit, snapshot.cargo?.unit);
  if (!next.weight && snapshot.cargo?.weight != null) next.weight = String(snapshot.cargo.weight);
  else if (!next.weight && snapshot.cargo?.weightTons != null) {
    next.weight = String(snapshot.cargo.weightTons);
    if (!next.weightUnit) next.weightUnit = "tons";
  }
  if (!next.weightUnit && snapshot.cargo?.weightUnit) next.weightUnit = snapshot.cargo.weightUnit;
  next.hsn = use(next.hsn, snapshot.cargo?.hsn);
  if (!next.goodsValue && snapshot.commercial?.goodsValue != null) {
    next.goodsValue = String(snapshot.commercial.goodsValue);
  }
  if (!next.freight && snapshot.commercial?.freight != null) {
    next.freight = String(snapshot.commercial.freight);
  }
  if (!next.sourceDocumentType && snapshot.commercial?.sourceDocument?.type) {
    next.sourceDocumentType = snapshot.commercial.sourceDocument.type;
  }
  next.sourceDocumentNumber = use(next.sourceDocumentNumber, snapshot.commercial?.sourceDocument?.number);
  next.sourceDocumentDate = use(next.sourceDocumentDate, snapshot.commercial?.sourceDocument?.date);
  next.orderReference = use(next.orderReference, snapshot.references?.orderNumber);
  next.ewayBillNumber = use(next.ewayBillNumber, snapshot.references?.ewayBillNumber);
  next.driverName = use(next.driverName, snapshot.driver?.name);
  next.driverLicense = use(next.driverLicense, snapshot.driver?.license);
  return next;
}

export function elrTripStatusCopy(
  phase: ElrDetailPhase,
  lrNumber?: string | null,
): { action: string | null; hint: string } {
  if (phase === "before_loading") {
    return { action: null, hint: "E-LR available after loading" };
  }
  if (phase === "not_eligible") {
    return { action: null, hint: "E-LR available after vehicle assignment" };
  }
  if (phase === "view") {
    const number = (lrNumber ?? "").trim();
    return { action: "View E-LR", hint: number ? `E-LR: ${number}` : "E-LR" };
  }
  if (phase === "ready_to_generate") {
    return { action: "Generate E-LR", hint: "E-LR ready to preview" };
  }
  if (phase === "ready_to_complete") {
    return { action: "Generate E-LR", hint: "E-LR details required" };
  }
  if (phase === "start") {
    return { action: "Generate E-LR", hint: "Generate E-LR" };
  }
  return { action: "Generate E-LR", hint: "E-LR details required" };
}

/** Fields already filled from the trip or a linked record. Empty fields stay manual. */
export function elrPrefilledFields(
  source: ElrTripSource,
  prefill: ElrCanonicalPrefill,
): Array<keyof ElrCompletionDraft> {
  const filled = applyElrCanonicalPrefill(draftFromTripSource(source), prefill);
  return (Object.keys(filled) as Array<keyof ElrCompletionDraft>).filter((key) =>
    String(filled[key] ?? "").trim(),
  );
}
