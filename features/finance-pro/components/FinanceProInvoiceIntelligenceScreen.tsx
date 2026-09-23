import { ROUTES } from "@/lib/routes";
import {
  FinanceProDataTable,
  FinanceProKpiCard,
  FinanceProKpiRow,
  FinanceProPageHero,
  FinanceProQuietAction,
  FinanceProStack,
  type FinanceProTableColumn,
} from "./FinanceProCanvas";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import { FINANCE_PRO_LAUNCH } from "./financeProLaunch";
import { formatCount, formatFinanceInr } from "./financeProFormat";
import { pipelineStageById } from "../model/buildFinanceProModel";
import type { TripFinancialFact } from "../model/financeProTypes";
import { usePathname, useRouter } from "expo-router";

export function FinanceProInvoiceIntelligenceScreen() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <FinanceProWorkspaceFrame title="Invoice intelligence" hideTitle>
      {(model) => {
        const ready = pipelineStageById(model.pipeline, "ready_to_invoice");
        const exposureByInvoice = (tripIds: string[]) =>
          tripIds.reduce((sum, id) => {
            const trip = model.tripFacts.find((t) => t.tripId === id);
            return sum + (trip?.remainingDue ?? 0);
          }, 0);
        const tripCols: FinanceProTableColumn<TripFinancialFact>[] = [
          { key: "c", label: "Client", flex: 1.3, minWidth: 140, render: (r) => r.clientName },
          { key: "t", label: "Trip", flex: 1, minWidth: 120, render: (r) => r.tripLabel },
          {
            key: "v",
            label: "Value",
            flex: 1,
            minWidth: 110,
            align: "right",
            render: (r) => formatFinanceInr(r.sales),
          },
        ];
        const invoiceCols: FinanceProTableColumn<(typeof model.issuedInvoiceDocuments)[number]>[] =
          [
            {
              key: "n",
              label: "Invoice",
              flex: 1.2,
              minWidth: 140,
              render: (r) => r.invoiceNumber,
            },
            {
              key: "c",
              label: "Customer",
              flex: 1.3,
              minWidth: 140,
              render: (r) => r.clientName ?? "—",
            },
            {
              key: "v",
              label: "Value",
              flex: 1,
              minWidth: 110,
              align: "right",
              render: (r) => formatFinanceInr(r.documentAmount),
            },
            {
              key: "src",
              label: "Source",
              flex: 0.9,
              minWidth: 96,
              render: (r) => r.sourceLabel ?? "Trip",
            },
            {
              key: "ref",
              label: "Reference",
              flex: 1,
              minWidth: 110,
              render: (r) => r.sourceReference ?? "—",
            },
            { key: "d", label: "Date", flex: 0.9, minWidth: 100, render: (r) => r.invoiceDate },
            { key: "s", label: "Status", flex: 0.8, minWidth: 88, render: (r) => r.status },
            {
              key: "e",
              label: "Trip exposure",
              flex: 1,
              minWidth: 120,
              align: "right",
              render: (r) => formatFinanceInr(exposureByInvoice(r.tripIds)),
            },
            {
              key: "a",
              label: "Action",
              flex: 0.9,
              minWidth: 110,
              variant: "muted",
              render: (r) => (
                <FinanceProQuietAction
                  label="Open detail"
                  onPress={() => router.push(ROUTES.financeProInvoice(r.id))}
                />
              ),
            },
          ];

        return (
          <FinanceProStack>
            <FinanceProPageHero
              eyebrow="Invoice intelligence"
              value={formatCount(model.issuedInvoiceDocuments.length)}
              caption="Issued billing documents · not invoice AR"
            />
            <FinanceProKpiRow>
              <FinanceProKpiCard
                label="Ready to bill"
                value={formatFinanceInr(ready.value)}
                sub={`${formatCount(ready.count)} trips with physical POD`}
              />
              <FinanceProKpiCard
                label="Issued last 30 days"
                value={formatFinanceInr(model.issuedLast30Value)}
                sub={`${formatCount(model.issuedLast30Count)} documents`}
              />
              <FinanceProKpiCard
                label="Issued this month"
                value={formatFinanceInr(model.issuedThisMonthValue)}
                sub={`${formatCount(model.issuedThisMonthCount)} documents`}
              />
              <FinanceProKpiCard
                label="Issued documents"
                value={formatCount(model.issuedInvoiceDocuments.length)}
                sub="Document value is not outstanding"
              />
            </FinanceProKpiRow>

            <FinanceProDataTable
              title="Create invoice"
              kicker="Finance workspace: trips or Manual Invoice. Commerce Orders stay separate."
              searchPlaceholder=""
              action={
                <>
                  <FinanceProQuietAction
                    label="Open Pulse Invoice"
                    onPress={() => router.push(FINANCE_PRO_LAUNCH.pulseInvoice(pathname))}
                  />
                  <FinanceProQuietAction
                    label="Create Manual Invoice"
                    onPress={() => router.push(ROUTES.INVOICING_EXECUTE)}
                  />
                </>
              }
              columns={tripCols}
              rows={[]}
              keyExtractor={(r) => r.tripId}
              empty="Open Finance Pro to invoice trips or create a Manual Invoice for the selected client."
            />

            <FinanceProDataTable
              title="Issued invoices"
              kicker="Document value is not outstanding"
              searchPlaceholder="Search invoices, customers…"
              columns={invoiceCols}
              rows={model.issuedInvoiceDocuments}
              keyExtractor={(r) => r.id}
              onRowPress={(row) => router.push(ROUTES.financeProInvoice(row.id))}
              empty="No issued invoices."
            />
          </FinanceProStack>
        );
      }}
    </FinanceProWorkspaceFrame>
  );
}
