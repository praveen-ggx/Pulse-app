import { useEffect, useState, type ReactNode } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { render, screen } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));

jest.mock("lucide-react-native", () => {
  const React = require("react");
  return new Proxy(
    {},
    {
      get: () =>
        function Icon() {
          return React.createElement(React.Fragment);
        },
    },
  );
});

jest.mock("../CreateTripDesktopPickers", () => ({
  CreateTripDesktopClientGrid: () => null,
  DesktopPartySearchField: () => null,
  DesktopPickerHeaderActions: () => null,
  filterClientsByPartyQuery: (clients: unknown[]) => clients,
}));

jest.mock("../CreateTripDesktopUi", () => ({
  DesktopSectionHeading: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("../createTripDesktop.styles", () => ({
  createTripDesktopStyles: new Proxy({}, { get: () => ({}) }),
}));

jest.mock("@/lib/webKeyboard", () => ({
  blurActiveElementOnWeb: () => false,
}));

jest.mock("@/features/clients/utils/clientContactDisplay.util", () => ({
  resolveWizardClientPhone: () => null,
}));

import { FullPageWizardShell } from "@/components/full-page-wizard/FullPageWizardShell";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";

import { CreateTripDesktopClientStep } from "../CreateTripDesktopClientStep";

jest.mock("../CreateTripLaneGatePanel", () => {
  const React = require("react");
  const { Text: RNText } = require("react-native");
  return {
    CreateTripLaneGatePanel: () => React.createElement(RNText, null, "lane-gate"),
  };
});

jest.mock("../ClientSaleKeypadFlow", () => {
  const React = require("react");
  const { Text: RNText } = require("react-native");
  return {
    ClientSaleKeypadFlow: () => React.createElement(RNText, null, "sale-keypad"),
  };
});

jest.mock("../ClientSaleDesktopModal", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ClientSaleDesktopModal: () => React.createElement(View, null),
  };
});

/**
 * Models the mount-only supplier fetch in useAddTripFleetResources.
 * A shell that swaps ScrollView and View would call this again on each flip.
 */
const getSuppliersByOrganization = jest.fn();

function SupplierProbe() {
  useEffect(() => {
    getSuppliersByOrganization("org-1");
  }, []);
  return null;
}

const client = {
  id: "client-1",
  name: "Acme Steel",
  phone: "9876543210",
} as ClientRow;

const lane = { id: "lane-1", origin_label: "Pune", destination_label: "Mumbai" } as ClientLaneRate;

function safeArea(children: ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 581 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}

function MobileCreate({
  clientId,
  lanes,
  loading,
  placeholder = false,
  onGate,
}: {
  clientId: string | null;
  lanes: ClientLaneRate[];
  loading: boolean;
  placeholder?: boolean;
  onGate: (active: boolean) => void;
}) {
  const [laneGateActive, setLaneGateActive] = useState(false);
  const saleFill = Boolean(clientId) && !laneGateActive;
  return safeArea(
    <FullPageWizardShell
      title="Create Trip"
      onBack={() => {}}
      fillBody={saleFill}
      scrollBody={!saleFill}
      footer={<Text>Continue</Text>}
    >
      <SupplierProbe />
      <CreateTripDesktopClientStep
        compact
        clients={clientId ? [client] : []}
        clientsLoading={false}
        clientId={clientId}
        clientListExpanded={false}
        onExpandClientList={() => {}}
        onToggleClientList={() => {}}
        onSelectClient={() => {}}
        onAddClient={() => {}}
        clientPrice=""
        onClientPriceChange={() => {}}
        onClearClient={() => {}}
        contractLanes={lanes}
        contractLanesLoading={loading}
        contractLanesPlaceholder={placeholder}
        onSelectLane={() => {}}
        onLaneGateActiveChange={(active) => {
          onGate(active);
          setLaneGateActive(active);
        }}
      />
    </FullPageWizardShell>,
  );
}

describe("mobile create-trip lane gate", () => {
  beforeEach(() => {
    getSuppliersByOrganization.mockClear();
  });

  it("keeps the wizard mounted when the shell switches between scroll and keypad", () => {
    const { rerender } = render(
      safeArea(
        <FullPageWizardShell
          title="Create Trip"
          onBack={() => {}}
          fillBody={false}
          scrollBody
          footer={<Text>Continue</Text>}
        >
          <SupplierProbe />
          <Text>step</Text>
        </FullPageWizardShell>,
      ),
    );
    const afterMount = getSuppliersByOrganization.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);

    rerender(
      safeArea(
        <FullPageWizardShell
          title="Create Trip"
          onBack={() => {}}
          fillBody
          scrollBody={false}
          footer={<Text>Continue</Text>}
        >
          <SupplierProbe />
          <Text>step</Text>
        </FullPageWizardShell>,
      ),
    );

    expect(getSuppliersByOrganization).toHaveBeenCalledTimes(afterMount);
    expect(screen.getByText("step")).toBeTruthy();
  });

  it("shows the lane gate once for a client with contract lanes and does not refetch suppliers", () => {
    const gates: boolean[] = [];
    const { rerender } = render(
      <MobileCreate
        clientId="client-1"
        lanes={[]}
        loading
        onGate={(active) => gates.push(active)}
      />,
    );
    const afterMount = getSuppliersByOrganization.mock.calls.length;
    expect(screen.getByText("lane-gate")).toBeTruthy();
    expect(gates[gates.length - 1]).toBe(true);

    rerender(
      <MobileCreate
        clientId="client-1"
        lanes={[lane]}
        loading={false}
        onGate={(active) => gates.push(active)}
      />,
    );

    expect(screen.getByText("lane-gate")).toBeTruthy();
    expect(screen.queryByText("sale-keypad")).toBeNull();
    expect(gates.filter((active, index) => index > 0 && gates[index - 1] === true && active === false)).toEqual([]);
    expect(gates[gates.length - 1]).toBe(true);
    expect(getSuppliersByOrganization).toHaveBeenCalledTimes(afterMount);
  });

  it("shows the sale keypad for a client without contract lanes", () => {
    const gates: boolean[] = [];
    const { rerender } = render(
      <MobileCreate
        clientId="client-1"
        lanes={[]}
        loading
        onGate={(active) => gates.push(active)}
      />,
    );
    const afterMount = getSuppliersByOrganization.mock.calls.length;

    rerender(
      <MobileCreate
        clientId="client-1"
        lanes={[]}
        loading={false}
        onGate={(active) => gates.push(active)}
      />,
    );

    expect(screen.getByText("sale-keypad")).toBeTruthy();
    expect(screen.queryByText("lane-gate")).toBeNull();
    expect(gates[gates.length - 1]).toBe(false);
    expect(getSuppliersByOrganization).toHaveBeenCalledTimes(afterMount);
  });

  it("clears the lane gate when the client is cleared", () => {
    const gates: boolean[] = [];
    const { rerender } = render(
      <MobileCreate
        clientId="client-1"
        lanes={[lane]}
        loading={false}
        onGate={(active) => gates.push(active)}
      />,
    );
    expect(gates[gates.length - 1]).toBe(true);

    rerender(
      <MobileCreate
        clientId={null}
        lanes={[]}
        loading={false}
        onGate={(active) => gates.push(active)}
      />,
    );

    expect(gates[gates.length - 1]).toBe(false);
    expect(screen.queryByText("lane-gate")).toBeNull();
    expect(screen.queryByText("sale-keypad")).toBeNull();
  });

  it("does not treat the previous client's placeholder lanes as this client's contracts", () => {
    const gates: boolean[] = [];
    const { rerender } = render(
      <MobileCreate
        clientId="client-1"
        lanes={[lane]}
        loading={false}
        onGate={(active) => gates.push(active)}
      />,
    );
    expect(screen.getByText("lane-gate")).toBeTruthy();

    rerender(
      <MobileCreate
        clientId="client-2"
        lanes={[lane]}
        loading
        placeholder
        onGate={(active) => gates.push(active)}
      />,
    );
    expect(screen.getByText("lane-gate")).toBeTruthy();

    rerender(
      <MobileCreate
        clientId="client-2"
        lanes={[]}
        loading={false}
        placeholder={false}
        onGate={(active) => gates.push(active)}
      />,
    );
    expect(screen.getByText("sale-keypad")).toBeTruthy();
    expect(screen.queryByText("lane-gate")).toBeNull();
    expect(gates[gates.length - 1]).toBe(false);
  });
});
