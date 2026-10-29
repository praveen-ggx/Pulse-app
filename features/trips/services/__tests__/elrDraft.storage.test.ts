jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

import { emptyElrCompletionDraft } from "@/features/trips/services/elrCompletion.util";
import {
  clearElrDraft,
  parseElrDraft,
  readElrDraft,
  writeElrDraft,
} from "@/features/trips/services/elrDraft.storage";

describe("E-LR draft storage", () => {
  it("keeps valid choices and drops unknown ones", () => {
    const parsed = parseElrDraft(
      JSON.stringify({ weightUnit: "tons", consignorGst: "maybe", consigneeName: "Harbour Stores" }),
    );
    expect(parsed).toMatchObject({
      weightUnit: "tons",
      consignorGst: "",
      consigneeName: "Harbour Stores",
    });
  });

  it("round-trips an incomplete draft and can discard it", async () => {
    const draft = {
      ...emptyElrCompletionDraft(),
      consigneeName: "Harbour Stores",
      consigneeAddress: "Dock Road",
    };
    expect(parseElrDraft(null)).toBeNull();
    expect(parseElrDraft("{")).toBeNull();
    await writeElrDraft("trip-9", draft);
    await expect(readElrDraft("trip-9")).resolves.toMatchObject({
      consigneeName: "Harbour Stores",
      consigneeAddress: "Dock Road",
      consignorName: "",
    });
    await clearElrDraft("trip-9");
    await expect(readElrDraft("trip-9")).resolves.toBeNull();
  });
});
