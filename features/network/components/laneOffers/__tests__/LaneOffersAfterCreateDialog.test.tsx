import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { LaneOffersAfterCreateDialog } from "@/features/network/components/laneOffers/LaneOffersAfterCreateDialog";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/LoadingIndicator", () => ({ LoadingIndicator: () => null }));
jest.mock("@/features/network/components/laneOffers/LaneOffersSection", () => ({
  LaneOffersSection: () => null,
}));

const mockAttach = jest.fn();
jest.mock("@/features/network/services/laneOffers.service", () => ({
  attachLaneCommitmentsForIndent: (id: string) => mockAttach(id),
}));

type MockQuery = { data?: unknown; isFetched: boolean; isError: boolean };
let mockQuery: MockQuery = { isFetched: false, isError: false };
const mockQueryEnabled: boolean[] = [];
jest.mock("@/lib/queries/useLaneOffersQuery", () => ({
  useInvalidateLaneOffers: () => jest.fn(),
  useLaneOffersForIndentQuery: (_id: string | null, opts: { enabled: boolean }) => {
    mockQueryEnabled.push(opts.enabled);
    return opts.enabled ? mockQuery : { isFetched: false, isError: false };
  },
}));

const page = (p: Record<string, unknown>) => ({
  pages: [
    {
      network_open: true,
      marketplace_open: false,
      network_count: 0,
      marketplace_count: 0,
      total_count: 0,
      min_marketplace_amount: null,
      ...p,
    },
  ],
});

function renderDialog(onDone = jest.fn(), timeout?: number) {
  render(
    <LaneOffersAfterCreateDialog
      indentId="ind-1"
      onDone={onDone}
      onPostToMarketplace={jest.fn(async () => true)}
      loadingTimeoutMs={timeout}
    />,
  );
  return onDone;
}

const flush = () => act(async () => {});

beforeEach(() => {
  jest.useFakeTimers();
  mockAttach.mockReset();
  mockQueryEnabled.length = 0;
  mockQuery = { isFetched: false, isError: false };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("LaneOffersAfterCreateDialog", () => {
  it("slow check: shows a Skip button and does not navigate on its own before the timeout", async () => {
    mockAttach.mockReturnValue(new Promise(() => {}));
    const onDone = renderDialog();
    await flush();
    expect(screen.getByText("Checking offers on this lane…")).toBeTruthy();
    expect(screen.getByLabelText("Skip offer check")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(7999);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("skip: closes immediately while loading, exactly once", async () => {
    mockAttach.mockReturnValue(new Promise(() => {}));
    const onDone = renderDialog();
    await flush();
    fireEvent.press(screen.getByLabelText("Skip offer check"));
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("close");
  });

  it("timeout: a check that never settles closes after the timeout", async () => {
    mockAttach.mockReturnValue(new Promise(() => {}));
    const onDone = renderDialog(jest.fn(), 3000);
    await flush();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("close");
  });

  it("timeout: a lane list that never settles after attach also closes", async () => {
    mockAttach.mockResolvedValue({ error: null, attached: 0 });
    const onDone = renderDialog(jest.fn(), 3000);
    await flush();
    expect(mockQueryEnabled).toContain(true);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalledWith("close");
  });

  it("rejected attach: continues to the lane check instead of spinning forever", async () => {
    mockAttach.mockRejectedValue(new Error("network down"));
    mockQuery = { data: page({ network_count: 1, total_count: 1 }), isFetched: true, isError: false };
    const onDone = renderDialog();
    await flush();
    expect(mockQueryEnabled).toContain(true);
    expect(screen.getByText("Offers on this lane")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("failed lane list with nothing attached: closes without waiting", async () => {
    mockAttach.mockResolvedValue({ error: null, attached: 0 });
    mockQuery = { isFetched: false, isError: true };
    const onDone = renderDialog();
    await flush();
    expect(onDone).toHaveBeenCalledWith("close");
  });

  it("success: shows attached lane rates and Review offers navigates to review", async () => {
    mockAttach.mockResolvedValue({ error: null, attached: 2 });
    mockQuery = { data: page({}), isFetched: true, isError: false };
    const onDone = renderDialog();
    await flush();
    expect(screen.getByText(/2 Network lane rates were added/)).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Review offers"));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("review");
  });
});
