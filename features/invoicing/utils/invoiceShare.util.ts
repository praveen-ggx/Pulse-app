import { Linking } from "react-native";

export type InvoiceShareDraft = {
  status: "draft" | "issued";
  organization: string;
  gstin?: string | null;
  cin?: string | null;
  pan?: string | null;
  address?: string | null;
  client: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  tripCount: number;
};

function line(label: string, value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? `${label}: ${text}` : null;
}

export function buildInvoiceShareText(input: InvoiceShareDraft): string {
  const heading = input.status === "issued" ? "Tax invoice" : "Draft invoice";
  const rows = [
    `*${heading}*`,
    line("From", input.organization),
    line("GSTIN", input.gstin),
    line("CIN", input.cin),
    line("PAN", input.pan),
    line("Registered office", input.address),
    "",
    line("To", input.client),
    line("Invoice", input.invoiceNumber),
    line("Date", input.invoiceDate),
    line("Due", input.dueDate),
    line("Amount", input.amount),
    line("Trips", String(input.tripCount)),
    "",
    input.status === "issued"
      ? "Issued from Pulse."
      : "This is a draft. It is not a tax invoice until it is issued.",
  ];
  return rows.filter((row) => row != null).join("\n");
}

export function whatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export async function shareInvoiceOnWhatsApp(
  text: string,
  phone?: string | null,
): Promise<void> {
  const number = whatsAppNumber(phone);
  const url = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  await Linking.openURL(url);
}

export async function shareInvoiceByEmail(args: {
  to?: string | null;
  subject: string;
  body: string;
}): Promise<void> {
  const to = (args.to ?? "").trim();
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(args.subject)}&body=${encodeURIComponent(args.body)}`;
  await Linking.openURL(url);
}
