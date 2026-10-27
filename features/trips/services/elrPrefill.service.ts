import { supabase } from "@/lib/supabase";
import { parseEwayFieldEntries } from "@/features/trips/services/ewayBillFields.util";
import type { ElrCanonicalPrefill } from "@/features/trips/services/elrCompletion.util";
import type { ElrTripSource } from "@/features/trips/services/elrSnapshot.util";

type ClientPartyRow = {
  legal_name: string | null;
  name: string | null;
  registered_address: string | null;
  address: string | null;
  state: string | null;
  gstin: string | null;
};

function clientAddress(row: ClientPartyRow | null): string {
  return (row?.registered_address || row?.address || "").trim();
}

async function readMaybe<R extends { data: unknown; error: unknown }>(
  run: () => PromiseLike<R>,
): Promise<NonNullable<R["data"]> | null> {
  try {
    const { data, error } = await run();
    if (error) return null;
    return (data ?? null) as NonNullable<R["data"]> | null;
  } catch {
    return null;
  }
}

/**
 * Reads party, vehicle, order, and e-way references that already exist.
 * Does not invent a consignee from the destination, and does not write anything.
 */
export async function loadElrCanonicalPrefill(
  source: ElrTripSource,
): Promise<ElrCanonicalPrefill> {
  const prefill: ElrCanonicalPrefill = {};
  const clientId = (source.clientId ?? "").trim();
  const organizationId = (source.organizationId ?? "").trim();
  const vehicleId = (source.vehicleId ?? "").trim();
  const indentId = (source.indentRecordId ?? "").trim();
  const tripId = source.tripId.trim();

  const [client, org, vehicle] = await Promise.all([
    clientId
      ? readMaybe(() =>
          supabase()
            .from("clients")
            .select("legal_name, name, registered_address, address, state, gstin")
            .eq("id", clientId)
            .maybeSingle(),
        )
      : Promise.resolve(null),
    organizationId
      ? readMaybe(() =>
          supabase()
            .from("organizations")
            .select("address_line, city, state, pincode, gstin, gst_not_applicable")
            .eq("id", organizationId)
            .maybeSingle(),
        )
      : Promise.resolve(null),
    vehicleId
      ? readMaybe(() =>
          supabase()
            .from("vehicles")
            .select("vehicle_type, type")
            .eq("id", vehicleId)
            .maybeSingle(),
        )
      : Promise.resolve(null),
  ]);

  if (client) {
    prefill.consignorAddress = clientAddress(client as ClientPartyRow);
    prefill.consignorState = (client as ClientPartyRow).state;
    prefill.consignorGstin = (client as ClientPartyRow).gstin;
  }

  if (org) {
    prefill.transporterAddress = org.address_line;
    prefill.transporterCity = org.city;
    prefill.transporterState = org.state;
    prefill.transporterPin = org.pincode;
    prefill.transporterGstin = org.gstin;
    prefill.transporterUnregistered = org.gst_not_applicable === true && !org.gstin;
  }

  const vehicleType = (vehicle?.vehicle_type || vehicle?.type || "").trim();
  if (vehicleType) prefill.vehicleType = vehicleType;

  const [indent, ewayRows] = await Promise.all([
    indentId
      ? readMaybe(() =>
          supabase().from("indents").select("sales_order_id").eq("id", indentId).maybeSingle(),
        )
      : Promise.resolve(null),
    tripId
      ? readMaybe(() =>
          supabase()
            .from("trip_documents")
            .select("document_number")
            .eq("trip_id", tripId)
            .eq("document_type", "eway_bill")
            .limit(5),
        )
      : Promise.resolve(null),
  ]);

  const salesOrderId = (indent?.sales_order_id ?? "").trim();
  if (salesOrderId) {
    const order = await readMaybe(() =>
      supabase()
        .from("sales_orders")
        .select("customer_id, order_number, total_amount, drop_warehouse_id")
        .eq("id", salesOrderId)
        .maybeSingle(),
    );
    if (order?.order_number) prefill.orderReference = order.order_number;
    if (order?.total_amount != null && Number(order.total_amount) > 0) {
      prefill.goodsValue = Number(order.total_amount);
    }
    const customerId = (order?.customer_id ?? "").trim();
    const warehouseId = (order?.drop_warehouse_id ?? "").trim();
    const [customer, warehouse] = await Promise.all([
      customerId && customerId !== clientId
        ? readMaybe(() =>
            supabase()
              .from("clients")
              .select("legal_name, name, registered_address, address, state, gstin")
              .eq("id", customerId)
              .maybeSingle(),
          )
        : Promise.resolve(null),
      warehouseId
        ? readMaybe(() =>
            supabase()
              .from("client_warehouses")
              .select("address, city, state, pincode")
              .eq("id", warehouseId)
              .maybeSingle(),
          )
        : Promise.resolve(null),
    ]);
    const party = (customer ?? null) as ClientPartyRow | null;
    if (party) {
      prefill.consigneeName = (party.legal_name || party.name || "").trim();
      prefill.consigneeAddress = clientAddress(party);
      prefill.consigneeState = party.state;
      prefill.consigneeGstin = party.gstin;
    }
    if (warehouse && !prefill.consigneeAddress) {
      prefill.consigneeAddress = warehouse.address;
      prefill.consigneeCity = warehouse.city;
      prefill.consigneeState = warehouse.state;
      prefill.consigneePin = warehouse.pincode;
    }
  }

  for (const row of Array.isArray(ewayRows) ? ewayRows : []) {
    const entries = parseEwayFieldEntries(row.document_number);
    const number = entries.find((entry) => /^\d{12}$/.test(entry.ewayNo.trim()))?.ewayNo;
    if (number) {
      prefill.ewayBillNumber = number.trim();
      break;
    }
  }

  return prefill;
}
