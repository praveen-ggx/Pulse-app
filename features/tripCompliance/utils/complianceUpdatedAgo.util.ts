/** "Updated 3 min ago" for the last successful Compliance read; null before the first one. */
export function formatComplianceUpdatedAgo(updatedAt: number, now: number): string | null {
  if (!updatedAt) return null;
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated ${Math.floor(minutes / 60)} h ago`;
}
