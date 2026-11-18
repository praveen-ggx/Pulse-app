import { READ_ALL_ID_CHUNK, readByIdChunks } from "@/lib/pagination";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${String(i).padStart(4, "0")}`);

describe("readByIdChunks", () => {
  it("reads batches of 100, one at a time, and sends every id exactly once", async () => {
    const input = [...ids(250), "id-0003", "id-0120", ""];
    const seen: string[] = [];
    const sizes: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const { data, error } = await readByIdChunks(input, async (chunk) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      sizes.push(chunk.length);
      seen.push(...chunk);
      inFlight -= 1;
      return { data: chunk.map((id) => ({ id })), error: null };
    });

    expect(error).toBeNull();
    expect(READ_ALL_ID_CHUNK).toBe(100);
    expect(sizes).toEqual([100, 100, 50]);
    expect(maxInFlight).toBe(1);
    expect(seen).toEqual(ids(250));
    expect(new Set(seen).size).toBe(seen.length);
    expect(data.map((row) => row.id)).toEqual(ids(250));
  });

  it("returns the error and no rows when any batch fails, and stops reading", async () => {
    let calls = 0;
    const failure = { message: "Bad Request" };
    const { data, error } = await readByIdChunks(ids(250), async (chunk) => {
      calls += 1;
      if (calls === 2) return { data: null, error: failure };
      return { data: chunk.map((id) => ({ id })), error: null };
    });

    expect(error).toBe(failure);
    expect(data).toEqual([]);
    expect(calls).toBe(2);
  });

  it("makes no request for an empty id list", async () => {
    const readChunk = jest.fn();
    await expect(readByIdChunks([], readChunk)).resolves.toEqual({ data: [], error: null });
    expect(readChunk).not.toHaveBeenCalled();
  });
});
