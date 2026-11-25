import {
  isThreadHistoryFresh,
  neighborConversationIds,
  THREAD_HISTORY_FRESH_SKEW_MS,
} from "../whatsappStyleLoad.util";

describe("whatsappStyleLoad.util", () => {
  describe("isThreadHistoryFresh", () => {
    it("treats missing denorm as fresh", () => {
      expect(isThreadHistoryFresh(null, null)).toBe(true);
      expect(isThreadHistoryFresh(undefined, "2026-01-01T00:00:00Z")).toBe(true);
    });

    it("is stale when denorm is ahead of bubbles", () => {
      expect(
        isThreadHistoryFresh(
          "2026-01-01T00:00:05.000Z",
          "2026-01-01T00:00:00.000Z",
        ),
      ).toBe(false);
    });

    it("is fresh within skew", () => {
      const base = Date.parse("2026-01-01T00:00:00.000Z");
      const denorm = new Date(base + THREAD_HISTORY_FRESH_SKEW_MS).toISOString();
      expect(isThreadHistoryFresh(denorm, "2026-01-01T00:00:00.000Z")).toBe(true);
    });
  });

  describe("neighborConversationIds", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

    it("returns empty when open id missing", () => {
      expect(neighborConversationIds(rows, "z")).toEqual([]);
    });

    it("picks nearest neighbors first", () => {
      expect(neighborConversationIds(rows, "b", 2)).toEqual(["a", "c"]);
      expect(neighborConversationIds(rows, "a", 2)).toEqual(["b", "c"]);
      expect(neighborConversationIds(rows, "d", 2)).toEqual(["c", "b"]);
    });
  });
});
