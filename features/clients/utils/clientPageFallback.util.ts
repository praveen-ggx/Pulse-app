export function mapClientPageTripIdRows(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);
}

export function shouldFailClosedWithoutTripIdRpc(missingRpc: boolean): boolean {
  return missingRpc;
}

export function shouldFetchNextTransactionPage(
  pageLength: number,
  pageSize: number,
): boolean {
  return pageLength >= pageSize;
}

export const CLIENT_PAGE_TX_PAGE_SIZE = 200;
