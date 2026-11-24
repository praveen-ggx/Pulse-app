import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";

export type BulkUpdateHistoryTag = "updated" | "edited" | "failed";

export type BulkUpdateHistoryRow = {
  tripId: string;
  tripLabel: string;
  transactionId: string;
  previousUtr: string;
  appliedUtr: string;
  previousDate: string;
  appliedDate: string;
  tag: BulkUpdateHistoryTag;
  error?: string;
};

export type BulkUpdateBatch = {
  id: string;
  organizationId: string;
  fileName: string;
  category: ComplianceLedgerCategory;
  createdAt: string;
  rows: BulkUpdateHistoryRow[];
};

const STORAGE_LIMIT = 30;

function storageKey(organizationId: string): string {
  return `pulse.compliance.bulk-updates.${organizationId}`;
}

export async function loadBulkUpdateBatches(organizationId: string): Promise<BulkUpdateBatch[]> {
  if (!organizationId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BulkUpdateBatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveBulkUpdateBatch(batch: BulkUpdateBatch): Promise<BulkUpdateBatch[]> {
  const existing = await loadBulkUpdateBatches(batch.organizationId);
  const next = [batch, ...existing.filter((item) => item.id !== batch.id)].slice(0, STORAGE_LIMIT);
  await AsyncStorage.setItem(storageKey(batch.organizationId), JSON.stringify(next));
  return next;
}

export async function replaceBulkUpdateBatch(batch: BulkUpdateBatch): Promise<BulkUpdateBatch[]> {
  const existing = await loadBulkUpdateBatches(batch.organizationId);
  const next = existing.map((item) => (item.id === batch.id ? batch : item));
  await AsyncStorage.setItem(storageKey(batch.organizationId), JSON.stringify(next));
  return next;
}
