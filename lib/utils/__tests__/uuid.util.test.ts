import { isUuid, onlyUuids } from "../uuid.util";

const A = "860a2a68-dbda-4aed-a6db-cb5833c8c1f1";
const B = "11111111-1111-7111-8111-111111111111";

describe("uuid.util", () => {
  it("isUuid accepts any-version UUIDs and rejects names", () => {
    expect(isUuid(A)).toBe(true);
    expect(isUuid(` ${B} `)).toBe(true);
    expect(isUuid("Sivakozhunthu")).toBe(false);
    expect(isUuid("Mohamed Asik Hussain")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("onlyUuids drops names/blanks and de-duplicates (prod 22P02 batch poisoning)", () => {
    expect(onlyUuids([A, "Sivakozhunthu", null, undefined, "", ` ${A} `, B, "Rithwik Anand"])).toEqual([A, B]);
  });
});
