/**
 * Create Trip / Create Load — shared client picker (indent-style).
 * Collapsed summary card + Change / Add client; expanded list matches Create Load.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  WizardClientPicker,
  WizardClientSummaryCard,
  WIZARD_PARTY_GRID_COLUMNS,
} from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import type { ClientRow } from "@/features/clients/services/clients.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { CheckCircle2, Clock } from "lucide-react-native";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type TripClientPickerSectionProps = {
  clients: ClientRow[];
  clientsLoading: boolean;
  clientId: string | null;
  clientListExpanded: boolean;
  setClientListExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectClient: (client: ClientRow) => void;
  onAddClient?: () => void;
  hasError?: boolean;
  /** Stepped mobile wizard — flat picker / summary card only. */
  wizardMode?: boolean;
  /** Party grid columns (desktop create-trip uses 4). */
  columns?: number;
  fieldLabelStyle?: StyleProp<TextStyle>;
  isDenseForm?: boolean;
  /** Left-align “Add client” under the party grid (desktop create-trip). */
  addClientAlign?: "start" | "center" | "stretch";
};

export function TripClientPickerSection({
  clients,
  clientsLoading,
  clientId,
  clientListExpanded,
  setClientListExpanded,
  onSelectClient,
  onAddClient: _onAddClient,
  hasError = false,
  wizardMode = false,
  columns,
  fieldLabelStyle,
  isDenseForm = false,
  addClientAlign = "stretch",
}: TripClientPickerSectionProps) {
  const selectedClientRow =
    clients.find((c) => c.id === clientId) ?? null;
  const showClientList = !clientId || clientListExpanded;
  const showClientSummary = Boolean(
    clientId && !clientListExpanded && selectedClientRow,
  );
  const webPointer =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const pickerColumns = columns ?? WIZARD_PARTY_GRID_COLUMNS;

  if (wizardMode) {
    return (
      <View style={styles.wrap}>
        {showClientSummary && selectedClientRow ? (
          <View style={styles.summaryCardFull}>
            <WizardClientSummaryCard
              name={selectedClientRow.name ?? "Client"}
              subtitle={
                resolveWizardClientPhone(selectedClientRow.phone) ?? undefined
              }
              avatarUrl={selectedClientRow.avatar_url ?? null}
              avatarSeed={selectedClientRow.avatar_seed ?? null}
              onPress={() => setClientListExpanded(true)}
            />
          </View>
        ) : (
          <WizardClientPicker
            clients={clients}
            loading={clientsLoading}
            selectedClientId={clientId}
            onSelect={onSelectClient}
            onAddClient={undefined}
            columns={pickerColumns}
            addClientAlign={addClientAlign}
            showListShell={false}
          />
        )}
        {hasError ? (
          <Text style={styles.errorText}>Select a client from the list.</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, hasError && styles.fieldGroupRing]}>
      <View style={styles.sectionLabelRow}>
        <Text
          style={[
            styles.fieldLabel,
            styles.sectionLabelTight,
            fieldLabelStyle,
          ]}
        >
          Select client
        </Text>
        <View style={styles.sectionLabelActions}>
          {clientId ? (
            <TouchableOpacity
              style={styles.changeSelectionBtn}
              onPress={() => setClientListExpanded((p) => !p)}
              activeOpacity={0.85}
            >
              <Text style={styles.changeSelectionBtnText}>
                {clientListExpanded ? "Collapse" : "Change"}
              </Text>
              <FontAwesome
                name={clientListExpanded ? "chevron-up" : "chevron-down"}
                size={11}
                color={Theme.iconPrimary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {clientsLoading ? (
        <ActivityIndicator color={Theme.iconPrimary} />
      ) : clients.length === 0 ? (
        <Text style={styles.mutedSmall}>
          No clients yet. Add the party from Customers first.
        </Text>
      ) : showClientSummary && selectedClientRow ? (
        <TouchableOpacity
          style={[styles.clientCard, styles.selectionSummaryCard]}
          onPress={() => setClientListExpanded(true)}
          activeOpacity={0.85}
        >
          <View style={styles.clientMain}>
            <PartyAvatar
              name={
                selectedClientRow.name ??
                selectedClientRow.contact_person ??
                "Client"
              }
              avatarUrl={selectedClientRow.avatar_url ?? null}
              avatarSeed={selectedClientRow.avatar_seed ?? null}
              entityType="client"
              size={isDenseForm ? 32 : 38}
              borderStyle={styles.clientAvatarOn}
            />
            <View style={styles.clientTextCol}>
              <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                {selectedClientRow.name}
              </Text>
              {selectedClientRow.address ? (
                <Text style={styles.selectionSummarySub} numberOfLines={1}>
                  {selectedClientRow.address}
                </Text>
              ) : resolveWizardClientPhone(selectedClientRow.phone) ? (
                <Text style={styles.selectionSummarySub} numberOfLines={1}>
                  {resolveWizardClientPhone(selectedClientRow.phone)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.selectionSummaryPill}>
            <Text style={styles.selectionSummaryPillText}>Change</Text>
          </View>
        </TouchableOpacity>
      ) : showClientList ? (
        <ScrollView
          style={styles.clientList}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {clients.map((client) => {
            const selected = clientId === client.id;
            return (
              <TouchableOpacity
                key={client.id}
                style={[
                  styles.clientCard,
                  selected && styles.clientCardRowSelected,
                  webPointer,
                ]}
                onPress={() => onSelectClient(client)}
                activeOpacity={0.85}
              >
                <View style={styles.clientMain}>
                  <PartyAvatar
                    name={client.name ?? client.contact_person ?? "Client"}
                    avatarUrl={client.avatar_url ?? null}
                    avatarSeed={client.avatar_seed ?? null}
                    entityType="client"
                    size={isDenseForm ? 32 : 38}
                    borderStyle={
                      selected ? styles.clientAvatarOn : styles.clientAvatar
                    }
                  />
                  <View style={styles.clientTextCol}>
                    <Text
                      style={[
                        styles.clientName,
                        selected && styles.clientNameOn,
                      ]}
                      numberOfLines={1}
                    >
                      {client.name}
                    </Text>
                    {client.address ? (
                      <View style={styles.clientMetaRow}>
                        <Clock size={11} color={Theme.textMuted} />
                        <Text style={styles.clientSub} numberOfLines={1}>
                          {client.address}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    selected && styles.radioOuterOn,
                  ]}
                >
                  {selected ? (
                    <CheckCircle2 size={16} color={Theme.primary} />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {hasError ? (
        <Text style={styles.errorText}>Select a client from the list.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
    gap: 8,
  },
  summaryCardFull: {
    width: "100%",
    alignSelf: "stretch",
  },
  fieldGroupRing: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.teslaRed,
    padding: 8,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 28,
  },
  sectionLabelTight: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sectionLabelActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  changeSelectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  changeSelectionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 36,
  },
  addClientBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clientList: {
    maxHeight: 320,
  },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 6,
  },
  clientCardRowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.04)",
  },
  selectionSummaryCard: {
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  clientMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clientTextCol: {
    flex: 1,
    minWidth: 0,
  },
  clientAvatar: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  clientAvatarOn: {
    borderWidth: 2,
    borderColor: Theme.primary,
  },
  clientName: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  clientNameOn: {
    color: Theme.primary,
  },
  clientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  clientSub: {
    flex: 1,
    fontSize: 11,
    color: Theme.textMuted,
  },
  selectionSummaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  selectionSummarySub: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  selectionSummaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  selectionSummaryPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
  },
  mutedSmall: {
    fontSize: 12,
    color: Theme.textMuted,
    lineHeight: 17,
  },
  errorText: {
    fontSize: 11,
    color: Theme.teslaRed,
    marginTop: 4,
  },
});
