import { describe, expect, it } from "vitest";
import { parseOrderInput } from "./orders";

describe("parseOrderInput", () => {
  it("accepts a valid market order", () => {
    expect(
      parseOrderInput({
        ticker: "NPN.JO",
        side: "BUY",
        qty: 10,
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toEqual({
      ticker: "NPN.JO",
      side: "BUY",
      qty: 10,
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects unknown side", () => {
    expect(
      parseOrderInput({ ticker: "NPN.JO", side: "HOLD", qty: 1, idempotencyKey: "k12345678" }),
    ).toEqual({ error: "invalid_side" });
  });

  it("rejects non-positive qty", () => {
    expect(
      parseOrderInput({ ticker: "NPN.JO", side: "SELL", qty: 0, idempotencyKey: "k12345678" }),
    ).toEqual({ error: "invalid_qty" });
  });

  it("rejects fractional qty", () => {
    expect(
      parseOrderInput({ ticker: "NPN.JO", side: "BUY", qty: 1.5, idempotencyKey: "k12345678" }),
    ).toEqual({ error: "invalid_qty" });
  });

  it("rejects short idempotency keys (double-submit guard needs entropy)", () => {
    expect(
      parseOrderInput({ ticker: "NPN.JO", side: "BUY", qty: 1, idempotencyKey: "abc" }),
    ).toEqual({ error: "invalid_idempotency_key" });
  });

  it("rejects blank ticker", () => {
    expect(
      parseOrderInput({ ticker: "  ", side: "BUY", qty: 1, idempotencyKey: "k12345678" }),
    ).toEqual({ error: "invalid_ticker" });
  });
});
