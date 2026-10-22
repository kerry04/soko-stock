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
    "Ronaldo handed Sh38,000 fine, 30-day suspension after Portugal walkout",
    "\"I'm 47 years fresh\": Ne-Yo lands in Kenya ahead of his first headline show",
    "David Lee Roth net worth 2026: Van Halen and solo music success",
    // From the world wire (Fox News firehose), 2026-10-21 — US sports are
    // not in the football-family patterns above.
    "World Series preview: Why the Milwaukee Brewers are the team to beat",
    // Body-recovery blotter, live wire 2026-10-22 — neither matched the
    // older "body found / found dead" family, so both passed as borderline
    // and the first was crowned the /news lead story.
    "Body of Kirinyaga University student recovered from River Thiba after four-day search",
    "Woman drowns in Kirinyaga stream after suspected epileptic seizure",
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
    "CMA fines broker Sh10m over market abuse",
    "Safaricom appoints new chief executive officer",
    "KCB issues profit warning as earnings fall",
    "Kenya races to upgrade stadiums ahead of AFCON 2027 — Sh9bn construction tender opens", // keep-gate wins: tender
    "Dangote net worth jumps as refinery shares rally", // net-worth phrase, market story — format patterns must not swallow it
    "KRA recovers Sh2 billion in unpaid taxes from importers", // keep-gate (tax) must outrank the body-recovery blotter family
    "Markets recover as shilling strengthens against the dollar", // plain "recover" is not a blotter signature
  ];
  it.each(keeps)("keeps: %s", (t) => expect(isMarketRelevant(t)).toBe(true));
});
