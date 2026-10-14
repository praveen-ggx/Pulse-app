import fs from "fs";
import path from "path";

const migrationPath = path.join(
  __dirname,
  "../20270930235100_refund_test_marketplace_fee_and_revoke_indent.sql",
);
const revokePath = path.join(
  __dirname,
  "../20270925214500_revoke_indent_award.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const revokeSql = fs.readFileSync(revokePath, "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to);
}

const fn = between(
  sql,
  "CREATE OR REPLACE FUNCTION public.refund_test_marketplace_fee_and_revoke_indent",
  "REVOKE ALL ON FUNCTION public.refund_test_marketplace_fee_and_revoke_indent",
);

describe("refund_test_marketplace_fee migration", () => {
  it("does not replace revoke_indent_award or its fee_paid guard", () => {
    expect(sql).not.toContain("FUNCTION public.revoke_indent_award");
    expect(revokeSql).toContain(
      "RAISE EXCEPTION 'fee_paid: marketplace fee is already paid for this award'",
    );
  });

  it("adds refunded and a separate refund record without reusing cancelled", () => {
    expect(sql).toContain("'refunded'");
    expect(sql).toContain("CREATE TABLE public.marketplace_fee_refunds");
    expect(sql).toContain("provider = 'test_online'");
    expect(sql).toContain("marketplace_fee_refunds_one_succeeded_per_payment");
    expect(fn).toContain("'test_online_refund_'");
    expect(fn).not.toContain("status = 'cancelled'");
  });

  it("selects the paid payment only through the accepted bid on this indent", () => {
    expect(fn).toContain("WHERE indent_id = v_indent.id");
    expect(fn).toContain("AND status = 'accepted'");
    expect(fn).toContain("WHERE market_bid_id = v_bid.id");
    expect(fn).toContain("AND status = 'paid'");
    expect(fn).toContain("v_payment.market_bid_id IS DISTINCT FROM v_bid.id");
    expect(fn).toContain("v_bid.indent_id IS DISTINCT FROM v_indent.id");
    expect(fn).not.toMatch(
      /FROM public\.marketplace_fee_payments[\s\S]{0,180}indent_id = p_indent_id/,
    );
  });

  it("refuses a non-test provider before any refund insert", () => {
    const providerCheck = fn.indexOf("unsupported_provider");
    const insertAt = fn.indexOf("INSERT INTO public.marketplace_fee_refunds");
    expect(providerCheck).toBeGreaterThan(-1);
    expect(providerCheck).toBeLessThan(insertAt);
  });

  it("marks refunded, preserves provider ids, then calls revoke with no exception handler", () => {
    const paymentUpdate = fn.indexOf("SET status = 'refunded'");
    const bidUpdate = fn.indexOf("SET fee_payment_status = 'refunded'");
    const revokeCall = fn.lastIndexOf("public.revoke_indent_award");
    expect(paymentUpdate).toBeGreaterThan(-1);
    expect(bidUpdate).toBeGreaterThan(paymentUpdate);
    expect(revokeCall).toBeGreaterThan(bidUpdate);
    expect(fn).not.toMatch(/provider_order_id\s*=/);
    expect(fn).not.toMatch(/provider_payment_id\s*=/);
    expect(fn).not.toMatch(/provider_event_id\s*=/);
    expect(fn).not.toMatch(/EXCEPTION\s+WHEN/i);
  });

  it("treats a second click as the existing refund and does not insert again", () => {
    const already = fn.indexOf("already_refunded_and_revoked");
    const insertAt = fn.indexOf("INSERT INTO public.marketplace_fee_refunds");
    expect(already).toBeGreaterThan(-1);
    expect(already).toBeLessThan(insertAt);
    expect(fn).toContain("revoke_retried");
  });
});
