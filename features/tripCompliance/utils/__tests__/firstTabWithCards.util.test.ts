import { firstTabWithCards } from "@/features/tripCompliance/utils/firstTabWithCards.util";

describe("firstTabWithCards", () => {
  const order = ["all", "hold", "rejected"] as const;

  it("keeps the current tab when it has cards", () => {
    expect(firstTabWithCards({ all: 2, hold: 1, rejected: 0 }, order, "all")).toBe("all");
  });

  it("opens the first sibling with cards when All is empty", () => {
    expect(firstTabWithCards({ all: 0, hold: 0, rejected: 3 }, order, "all")).toBe("rejected");
  });

  it("does not leave a tab the user opened on purpose", () => {
    expect(
      firstTabWithCards({ all: 0, hold: 2, rejected: 1 }, order, "hold", { autoLeave: ["all"] }),
    ).toBe("hold");
    expect(
      firstTabWithCards({ all: 0, hold: 2, rejected: 1 }, order, "all", { autoLeave: ["all"] }),
    ).toBe("hold");
  });

  it("stays put when every tab is empty", () => {
    expect(firstTabWithCards({ all: 0, hold: 0, rejected: 0 }, order, "all")).toBe("all");
  });
});
