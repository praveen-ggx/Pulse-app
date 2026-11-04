import {
  parseBankStatementCsv,
  parseStatementAmount,
  parseStatementDate,
  splitCsv,
} from "@/features/invoicing/utils/bankStatementCsv.util";

describe("splitCsv", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    expect(splitCsv('a,"b, c","d ""q"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "q"'],
      ["1", "2", "3"],
    ]);
  });
  it("drops blank lines", () => {
    expect(splitCsv("\n\na,b\n\n")).toEqual([["a", "b"]]);
  });
});

describe("parseStatementDate", () => {
  it.each([
    ["2026-11-03", "2026-11-03"],
    ["03/11/2026", "2026-11-03"],
    ["3-11-26", "2026-11-03"],
    ["03 Nov 2026", "2026-11-03"],
    ["03-Sept-2026", "2026-09-03"],
  ])("%s -> %s (day first)", (input, expected) => {
    expect(parseStatementDate(input)).toBe(expected);
  });
  it.each(["31/02/2026", "13/13/2026", "2026-02-30", "Nov 3 2026", ""])("rejects %s", (input) => {
    expect(parseStatementDate(input)).toBeNull();
  });
});

describe("parseStatementAmount", () => {
  it.each([
    ["1,23,456.70", 123456.7],
    ["₹ 500", 500],
    ["(250.00)", -250],
    ["250 Dr", -250],
    ["250 Cr", 250],
    ["-75.5", -75.5],
    ["", 0],
    ["-", 0],
  ])("%s -> %s", (input, expected) => {
    expect(parseStatementAmount(input)).toBe(expected);
  });
  it.each(["12.345", "abc", "1.2.3"])("rejects %s", (input) => {
    expect(parseStatementAmount(input)).toBeNull();
  });
});

describe("parseBankStatementCsv", () => {
  it("maps a bank export with a header row", () => {
    const parsed = parseBankStatementCsv(
      "Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt\n03/11/2026,NEFT CUSTOMER,UTR1,,\"1,80,000.00\"\n04/11/2026,CHARGES,CHG,59.00,\n",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { txn_date: "2026-11-03", reference: "UTR1", description: "NEFT CUSTOMER", credit: "180000.00", debit: "0" },
      { txn_date: "2026-11-04", reference: "CHG", description: "CHARGES", credit: "0", debit: "59.00" },
    ]);
  });

  it("maps a signed amount column", () => {
    const parsed = parseBankStatementCsv("Date,Reference,Description,Amount\n2026-11-03,R1,In,500\n2026-11-03,R2,Out,-20");
    expect(parsed.rows.map((row) => [row.credit, row.debit])).toEqual([
      ["500.00", "0"],
      ["0", "20.00"],
    ]);
  });

  it("reads headerless rows as date, reference, description, credit", () => {
    const parsed = parseBankStatementCsv("2026-04-01, UTR1, Megha, 180000");
    expect(parsed.rows).toEqual([{ txn_date: "2026-04-01", reference: "UTR1", description: "Megha", credit: "180000.00", debit: "0" }]);
  });

  it("reports bad rows with their line number and does not send them", () => {
    const parsed = parseBankStatementCsv("Date,Reference,Credit,Debit\n2026-11-03,A,100,\n31/31/2026,B,5,\n2026-11-03,C,,\n2026-11-03,D,5,5\n2026-11-03,E,abc,");
    expect(parsed.rows.map((row) => row.reference)).toEqual(["A"]);
    expect(parsed.errors.map((error) => error.line)).toEqual([3, 4, 5, 6]);
  });

  it("refuses a header without a date or credit column", () => {
    const parsed = parseBankStatementCsv("When,Text,Value\n2026-11-03,a,1");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]?.message).toMatch(/date and credit/);
  });
});
