import { describe, expect, it } from "vitest";
import { pickLeadStory } from "./lead";

const art = (title: string) => ({ title });
const HEAT = ["Safaricom", "Dangote Cement"];

describe("pickLeadStory", () => {
  it("a just-landed blotter story does not lead when a heat company story exists", () => {
    // Regression, live wire 2026-10-22: the Kirinyaga body-recovery
    // story was the newest item on the merged wire and got crowned lead
    // through the newest-story fallback.
    const wire = [
      art("Body of Kirinyaga University student recovered from River Thiba after four-day search"),
      art("Safaricom expands M-Pesa services into Ethiopia"),
      art("Traders watch the shilling ahead of the rate decision"),
    ];
    expect(pickLeadStory(wire, HEAT)?.title).toBe(
      "Safaricom expands M-Pesa services into Ethiopia",
    );
  });

  it("a classified market event leads over a newer unqualified story", () => {
    const wire = [
      art("County launches a new bursary programme for students"),
      art("KCB issues profit warning as earnings fall"),
    ];
    expect(pickLeadStory(wire, HEAT)?.title).toBe(
      "KCB issues profit warning as earnings fall",
    );
  });

  it("the newest story leads when nothing qualifies", () => {
    const wire = [
      art("County launches a new bursary programme for students"),
      art("Governors meet in Nairobi for a two-day summit"),
    ];
    expect(pickLeadStory(wire, HEAT)?.title).toBe(wire[0].title);
  });

  it("an empty wire has no lead", () => {
    expect(pickLeadStory([], HEAT)).toBeNull();
  });
});
