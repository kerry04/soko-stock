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

const wart = (title: string, published_at: string, desk: "africa" | "world") => ({
  title,
  published_at,
  desk,
});

describe("pickLeadStory tiers", () => {
  it("tier 1: a qualifying pipeline story beats a newer world story", () => {
    const wire = [
      art("County launches a new bursary programme for students"),
      art("Safaricom expands M-Pesa services into Ethiopia"),
    ];
    const world = [
      wart("Fed signals another rate cut as markets rally", "2026-10-22T10:00:00Z", "world"),
    ];
    expect(pickLeadStory(wire, HEAT, world)?.title).toBe(
      "Safaricom expands M-Pesa services into Ethiopia",
    );
  });

  it("tier 2: a world story beats a non-qualifying pipeline wire", () => {
    // Regression, live wire 2026-10-22: nothing on the pipeline wire
    // qualified, so the newest-story fallback crowned this blotter
    // story. A market-relevant world story is the better lead.
    const wire = [
      art("Bus Driver Faces 12 Charges Over Fatal Crash Involving University Students"),
      art("County launches a new bursary programme for students"),
    ];
    const world = [
      wart("Nigeria's central bank holds its benchmark rate", "2026-10-22T09:00:00Z", "africa"),
    ];
    expect(pickLeadStory(wire, HEAT, world)?.title).toBe(
      "Nigeria's central bank holds its benchmark rate",
    );
  });

  it("tier 2: an Africa story at similar freshness beats a fresher World story", () => {
    const wire = [art("County launches a new bursary programme for students")];
    const world = [
      wart("Oil prices climb as OPEC weighs output cuts", "2026-10-22T10:00:00Z", "world"),
      wart("Ghana's cedi strengthens against the dollar", "2026-10-22T08:30:00Z", "africa"),
    ];
    expect(pickLeadStory(wire, HEAT, world)?.title).toBe(
      "Ghana's cedi strengthens against the dollar",
    );
  });

  it("tier 2: a much fresher World story beats a stale Africa story", () => {
    const wire = [art("County launches a new bursary programme for students")];
    const world = [
      wart("Oil prices climb as OPEC weighs output cuts", "2026-10-22T10:00:00Z", "world"),
      wart("Zambia's kwacha steady ahead of budget speech", "2026-10-21T20:00:00Z", "africa"),
    ];
    expect(pickLeadStory(wire, HEAT, world)?.title).toBe(
      "Oil prices climb as OPEC weighs output cuts",
    );
  });

  it("tier 2: a world story leads when the pipeline wire is empty", () => {
    const world = [
      wart("Nigeria's central bank holds its benchmark rate", "2026-10-22T09:00:00Z", "africa"),
    ];
    expect(pickLeadStory([], HEAT, world)?.title).toBe(
      "Nigeria's central bank holds its benchmark rate",
    );
  });

  it("tier 3: with no world candidates the newest pipeline story still leads", () => {
    const wire = [
      art("County launches a new bursary programme for students"),
      art("Governors meet in Nairobi for a two-day summit"),
    ];
    expect(pickLeadStory(wire, HEAT, [])?.title).toBe(wire[0].title);
  });
});

describe("pickLeadStory enforcement door", () => {
  // Regression, live wire 2026-10-22: this crime story was the newest
  // pipeline item and led /news through the event door — "arrested
  // over" classifies as enforcement, and any classified event used to
  // qualify. Enforcement stories stay on the wire, but the class no
  // longer opens the lead door on its own.
  const KILIFI = "Prison warder arrested over murder of 74-year-old man in Kilifi";

  it("a crime story does not lead when a qualifying company story exists", () => {
    const wire = [
      art(KILIFI),
      art("Safaricom expands M-Pesa services into Ethiopia"),
    ];
    expect(pickLeadStory(wire, HEAT)?.title).toBe(
      "Safaricom expands M-Pesa services into Ethiopia",
    );
  });

  it("a crime story does not lead when a tier-2 world business story exists", () => {
    const wire = [
      art(KILIFI),
      art("County launches a new bursary programme for students"),
    ];
    const world = [
      wart("Nigeria's central bank holds its benchmark rate", "2026-10-22T09:00:00Z", "africa"),
    ];
    expect(pickLeadStory(wire, HEAT, world)?.title).toBe(
      "Nigeria's central bank holds its benchmark rate",
    );
  });

  it("a market event still beats a newer crime story", () => {
    const wire = [art(KILIFI), art("KCB declares dividend after half-year results")];
    expect(pickLeadStory(wire, HEAT)?.title).toBe(
      "KCB declares dividend after half-year results",
    );
  });

  it("an enforcement story about a named heat company still leads via the company door", () => {
    const wire = [art(KILIFI), art("Safaricom fined by regulator over M-Pesa outage")];
    const world = [
      wart("Oil prices climb as OPEC weighs output cuts", "2026-10-22T10:00:00Z", "world"),
    ];
    expect(pickLeadStory(wire, HEAT, world)?.title).toBe(
      "Safaricom fined by regulator over M-Pesa outage",
    );
  });

  it("a crash story does not lead via a false 'university' company match", () => {
    // Regression, live wire 2026-10-22: with University Press in the
    // heat set, the bus-crash story led through the company door
    // because bare "university" used to match the publisher's name.
    const wire = [
      art("Bus Driver Faces 12 Charges Over Fatal Crash Involving University Students"),
      art("Safaricom expands M-Pesa services into Ethiopia"),
    ];
    expect(pickLeadStory(wire, [...HEAT, "University Press"])?.title).toBe(
      "Safaricom expands M-Pesa services into Ethiopia",
    );
  });

  it("a crime story still leads as the last resort when nothing else qualifies", () => {
    const wire = [art(KILIFI), art("County launches a new bursary programme for students")];
    expect(pickLeadStory(wire, HEAT, [])?.title).toBe(KILIFI);
  });
});
