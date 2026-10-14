export type PodInwardDraft = {
  receivedDate: string;
  courierName: string;
  docketNumber: string;
};

export type PodInwardTripOption = {
  tripId: string;
  label: string;
  detail: string;
};

export function toggleTripId(selected: string[], tripId: string): string[] {
  return selected.includes(tripId) ? selected.filter((id) => id !== tripId) : [...selected, tripId];
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function podInwardErrors(draft: PodInwardDraft): Partial<Record<keyof PodInwardDraft, string>> {
  const errors: Partial<Record<keyof PodInwardDraft, string>> = {};
  if (!isIsoDate(draft.receivedDate.trim())) {
    errors.receivedDate = "POD Received Date is required.";
  }
  if (!draft.courierName.trim()) errors.courierName = "Courier Name is required.";
  if (!draft.docketNumber.trim()) errors.docketNumber = "Docket Number is required.";
  return errors;
}

export function canMarkPodInward(draft: PodInwardDraft): boolean {
  return Object.keys(podInwardErrors(draft)).length === 0;
}
