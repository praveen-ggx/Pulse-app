import { act, renderHook } from "@testing-library/react-native";
import {
  COMPLIANCE_QUEUE_WINDOW_SIZE,
  useComplianceListWindow,
} from "@/features/tripCompliance/hooks/useComplianceListWindow";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

describe("useComplianceListWindow", () => {
  beforeEach(() => {
    jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1 as unknown as number;
    });
    jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the first 15 items and appends 15 more on loadMore", () => {
    const items = ids(344);
    const { result } = renderHook(() => useComplianceListWindow(items, { resetKey: "all" }));

    expect(result.current.visibleItems).toEqual(items.slice(0, COMPLIANCE_QUEUE_WINDOW_SIZE));
    expect(result.current.total).toBe(344);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.allLoaded).toBe(false);

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleItems).toEqual(items.slice(0, 30));
    expect(result.current.visibleItems).toHaveLength(30);
    expect(new Set(result.current.visibleItems).size).toBe(30);

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleItems).toEqual(items.slice(0, 45));
  });

  it("resets to the first 15 when the filter key changes", () => {
    const all = ids(40);
    const docs = all.slice(20);
    const { result, rerender } = renderHook(
      ({ items, resetKey }: { items: string[]; resetKey: string }) =>
        useComplianceListWindow(items, { resetKey }),
      { initialProps: { items: all, resetKey: "all" } },
    );

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(30);

    rerender({ items: docs, resetKey: "docs" });
    expect(result.current.visibleItems).toEqual(docs.slice(0, 15));
    expect(result.current.total).toBe(docs.length);
  });

  it("does not load past the end and ignores overlapping loadMore calls", () => {
    const items = ids(20);
    const { result } = renderHook(() => useComplianceListWindow(items, { resetKey: "all" }));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(result.current.visibleItems).toEqual(items);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.allLoaded).toBe(true);
  });

  it("expands the window to include a selected trip beyond the first page", () => {
    const items = ids(50);
    const { result } = renderHook(() => useComplianceListWindow(items, { resetKey: "all" }));

    act(() => {
      result.current.revealThrough(22);
    });
    expect(result.current.visibleCount).toBe(30);
    expect(result.current.visibleItems).toContain("t23");
  });
});
