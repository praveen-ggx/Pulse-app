/**
 * Wizard lane-gate guard: two flips before React re-renders (on → off in one
 * batch) must both reach the parent. A ref that only syncs on render would
 * drop the second flip and leave the gate stuck on.
 */
import { act, render } from "@testing-library/react-native";

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

jest.mock("moti", () => {
  const { View } = require("react-native");
  return { MotiView: View };
});

jest.mock("react-native-reanimated", () => ({
  Easing: { bezier: () => () => 0 },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));

jest.mock("@/lib/queries/useClientWarehousesQuery", () => ({
  useClientWarehousesQuery: () => ({ data: [], isLoading: false }),
}));
jest.mock("@/lib/queries/useClientLaneRatesQuery", () => ({
  useClientLaneRatesQuery: () => ({ data: [], isLoading: false, isPlaceholderData: false }),
}));
jest.mock("@/lib/queries/useLinkedClientOrgLocationsQuery", () => ({
  useLinkedClientOrgLocationsQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock("@/features/clients/services/clients.service", () => ({
  getClientById: jest.fn(),
}));

jest.mock("../useAddTripFleetResources", () => ({
  // Unlisted fields default to empty lists; the client step never reads them.
  useAddTripFleetResources: () =>
    new Proxy(
      { fleetLoading: false, suppliersLoading: false, driverPhoneLookupLoading: false },
      { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : []) },
    ),
}));

let captured: ((active: boolean) => void) | undefined;
jest.mock("../CreateTripDesktopClientStep", () => ({
  CreateTripDesktopClientStep: (props: {
    onLaneGateActiveChange?: (active: boolean) => void;
  }) => {
    captured = props.onLaneGateActiveChange;
    return null;
  },
}));

import { CreateTripDesktopWizard } from "../CreateTripDesktopWizard";
import { ADD_TRIP_FORM_INITIAL_STATE } from "../useAddTripForm";

const setters = new Proxy({}, { get: () => jest.fn() }) as never;

describe("CreateTripDesktopWizard lane-gate sync", () => {
  it("forwards on → off flips made before a re-render", () => {
    const onGate = jest.fn();
    render(
      <CreateTripDesktopWizard
        wizardStep="client"
        state={{ ...ADD_TRIP_FORM_INITIAL_STATE, clientId: "client-1" }}
        setters={setters}
        clients={[]}
        clientsLoading={false}
        organizationId="org-1"
        validationIssues={[]}
        onLaneGateActiveChange={onGate}
      />,
    );
    expect(captured).toBeDefined();

    act(() => {
      captured?.(true);
      captured?.(false);
    });
    expect(onGate.mock.calls.map((c) => c[0])).toEqual([true, false]);

    // Repeat value after the batch is still de-duped.
    act(() => {
      captured?.(false);
    });
    expect(onGate).toHaveBeenCalledTimes(2);
  });
});
