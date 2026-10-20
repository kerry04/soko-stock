import { describe, expect, it } from "vitest";
import { isMarketRelevant } from "./relevance";

// Fixtures are real headlines pulled from the live wire on 2026-10-20.
describe("isMarketRelevant — drops (real junk from the live wire)", () => {
  const drops = [
    "Ne-Yo arrives in Nairobi for long-awaited return to Kenyan stage",
    "Enrico Letta Siblings: Getting to Know Vincenzo Letta",
    "Mario Monti Siblings: All About Claudia Monti",
    "Selena Gomez reveals vaping changed her voice, urges fans to quit",
    "Tanasha Donna teams up with twin sister Hadaya Eliana for new song 'Tea'",
    "Ronaldo handed 30-day ban for leaving Portugal camp following coach Jesus rift",
    "Kenya races to upgrade stadiums ahead of AFCON 2027",
    "Ruto Issues New Directive on Eldoret's Kipchoge Keino Stadium",
    "28 arrested after water bowser set ablaze following pedestrian accident in Nairobi",
    "Decomposed body of unidentified man found in Ngong River, Nairobi",
    "Cleaner, 21, dies after falling from 17th floor of Nairobi apartment",
    "Suspected gang member shot after attacking police officers in Huruma",
    "Musician Mbuvi recognised among Kenya's national heroes for arts contribution",
    "Comedian Nasra Yusuf declares bid for Garissa Women Rep seat in 2027",
    "Canada Lists 10 General Holidays When Workers Can Get Paid Days Off",
    "NOCK Deputy Barnaba Korir among 25 sportmen and women honoured in Mashujaa celebrations",
    "\"We're hoping for the best\": Jaguar brings in NACADA to rehabilitate actor Onyi",
    "“Bora tuelewe”: Bungoma mum's cheeky graduation post for PP2 son amuses Kenyans",
  ];
  it.each(drops)("drops: %s", (t) => expect(isMarketRelevant(t)).toBe(false));
});

describe("isMarketRelevant — keeps (market-moving or borderline)", () => {
  const keeps = [
    "Treasury Gives Progress Update on Nairobi-Mombasa Expressway Project",
    "Ruto defends Sh42bn Kenya Pipeline share transfer, says deal signals investor confidence",
    "Relief for Fuel After Two Kenya-Bound Oil Tankers Hit by Drone Strikes",
    "State Raises PAYE Exemption Limit, Reveals Tax Relief Timeline",
    "Ruto Proposes PAYE Exemption for Workers Earning Up to Sh32,333 Monthly",
    "Ksh.5 billion to be injected into Hustler Fund this year - Ruto",
    "Treasury Proposes New Rules to Curb Fraud in Govt Tenders",
    "Green Card Ban: US Govt Bans Tech Firm From Hiring Foreign Workers, Fines It KSh 260 Million",
    "Ruto Announces New Milk Prices Starting This Month",
    "US bans use of China's DeepSeek by govt agencies",
    "Drone strikes across Sudan kill more than 100",
    "MPs plan to stop election results livestreaming in legal change",
    "Ruto announces plan to scale up National Internship Programme to 50,000 slots",
    "EACC arrests county official over Sh12m graft",
    "Safaricom appoints new chief executive officer",
    "KCB issues profit warning as earnings fall",
    "Kenya races to upgrade stadiums ahead of AFCON 2027 — Sh9bn construction tender opens", // keep-gate wins: tender
  ];
  it.each(keeps)("keeps: %s", (t) => expect(isMarketRelevant(t)).toBe(true));
});
