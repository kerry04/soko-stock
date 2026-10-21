import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";

/**
 * Start: the road from "curious" to "ready to open a real account", in
 * five steps. Every number on this page comes from the trading-pivot
 * research brief (CDS mechanics, the 0.34% levy stack, broker ranges).
 * Soko Stock teaches and lets you practise here; it never takes an
 * order or holds money — real trading hands off to licensed brokers.
 */
export const Route = createFileRoute("/start")({
  head: () => ({
    meta: [
      { title: "Start trading — Soko Stock" },
      {
        name: "description",
        content:
          "How buying your first share in Kenya actually works: what a share is, the CDS account, what a trade really costs, practice with paper money, then a real broker.",
      },
    ],
  }),
  component: StartPage,
});

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel padding="lg">
      <PanelHeader>
        <PanelTitle>Step {n} of 5</PanelTitle>
      </PanelHeader>
      <h2 className="font-display text-[20px] font-semibold leading-snug tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </Panel>
  );
}

function Explainer({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel padding="lg">
      <h3 className="font-display text-[17px] font-semibold leading-snug tracking-tight text-foreground">
        {title}
      </h3>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </Panel>
  );
}

const FEE_ROWS: { label: string; value: string }[] = [
  { label: "Brokerage commission — the broker's cut, and it is negotiable", value: "1.1–2.1%" },
  { label: "CMA transaction levy", value: "0.12%" },
  { label: "NSE transaction levy", value: "0.12%" },
  { label: "CDSC transaction levy", value: "0.08%" },
  { label: "Guarantee funds (CMA + CDSC)", value: "0.01% + 0.01%" },
  { label: "Stamp duty", value: "KSh 2 per KSh 10,000 traded" },
];

function StartPage() {
  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="STRT · Start trading"
          title="Start trading"
          description="How buying your first share in Kenya actually works, step by step. Read it in order, or jump to the step you are stuck on."
        />

        <div className="max-w-[860px] space-y-4">
          <Step n={1} title="A share is a piece of a company">
            <p>
              Buy one share of Safaricom and you own a tiny slice of Safaricom —
              its business, its profits and its risks. If the company does well
              and pays a dividend, you get your slice of that too. If it does
              badly, your slice is worth less. A share is not a bet on a chart;
              it is part-ownership of a real business.
            </p>
            <p>
              Since August 2025 you can buy a single share on the Nairobi
              Securities Exchange (NSE). The old minimum of 100 shares per trade
              is gone, so the smallest way in is the price of one share, plus
              the fees in step 3.
            </p>
          </Step>

          <Step n={2} title="You need a CDS account before anything else">
            <p>
              Your shares are not kept by an app or by your broker. They are
              recorded in an account in your name at the CDSC, the registry
              that keeps the record of who owns what. Think of a CDS account
              as a bank account that holds shares instead of cash. Without
              one, you cannot buy or sell a single NSE share. No exceptions.
            </p>
            <p>
              Only a licensed broker, an investment bank or a custodian bank
              can open one for you — an app that is none of those cannot.
              Opening is free. You need four things:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>A national ID or passport</li>
              <li>A KRA PIN certificate</li>
              <li>Passport photos</li>
              <li>
                A form called CDS 1, which the broker gives you to fill in
              </li>
            </ul>
            <p>
              Many brokers now do the whole thing online. Once the CDS account
              is open, you open a trading account with the same broker and put
              money in it — usually by M-PESA — and you can place your first
              order. Shares you buy show up in your CDS account within 24–48
              hours.
            </p>
            <p>
              One mix-up to avoid: a CDS account is not a DhowCSD account.
              DhowCSD is at the Central Bank and holds Treasury bills and
              bonds. Different account, different things.
            </p>
          </Step>

          <Step n={3} title="What a trade really costs">
            <p>
              Every trade pays a stack of small charges. The fixed ones are
              set by the market, not by your broker:
            </p>
            <div>
              {FEE_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 border-b border-border/50 py-1.5 last:border-0"
                >
                  <span>{row.label}</span>
                  <span className="num shrink-0 font-mono text-[13px] font-bold text-foreground">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <p>
              The levies alone come to 0.34% on every trade, before the broker
              takes anything. Add brokerage at a typical 2% and buying
              KSh 10,000 of shares costs roughly KSh 210–240 in charges.
              Selling costs about the same again, so a share has to rise
              around 4.5% before a buy-and-sell breaks even.
            </p>
            <p>
              And be plain about small trades: they are fee-heavy. The stamp
              duty alone is a flat KSh 2 minimum, so on a very small buy it
              can be most of the total cost. The worked example is in the
              explainers below.
            </p>
          </Step>

          <Step n={4} title="Practise here first, with paper money">
            <p>
              Paper trading means buying and selling with pretend money at
              real prices: you make the same decisions as a real trade, but
              nothing is at risk while you learn. This site has a paper
              portfolio with play money for exactly that.
            </p>
            <p>
              <Link
                to="/portfolio"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Open the paper portfolio →
              </Link>{" "}
              Make a few trades. Watch what moves your picks, and get used to
              the idea that prices fall as well as rise — before any real
              money is involved.
            </p>
          </Step>

          <Step n={5} title="Open a real account with a broker">
            <p>
              When you are ready, the real account is opened with a broker,
              not here. The broker checks your identity, opens your CDS
              account, takes your orders and places them on the NSE. That is
              the only door into the market, and every shilling of real money
              moves between you and the broker — never through this site.
            </p>
            <p>
              <Link
                to="/brokers"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                See the licensed brokers →
              </Link>{" "}
              Compare what each one charges and how their sign-up works, then
              open your account on the broker's own site or app.
            </p>
          </Step>

          <Panel variant="folio" padding="lg">
            <PanelHeader>
              <PanelTitle>How Soko Stock works</PanelTitle>
            </PanelHeader>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Soko Stock is information and practice. It shows prices and
                news, and lets you rehearse with paper money. It holds no
                client money, it cannot open a CDS account for you, and it
                cannot trade for you.
              </p>
              <p>
                Real trading happens through brokers licensed by the Capital
                Markets Authority (CMA). Nothing on this page is advice to
                buy or sell a specific share.
              </p>
            </div>
          </Panel>

          <div className="pt-2">
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 bg-primary" aria-hidden />
              Before you start · the questions everyone asks
            </p>
          </div>

          <Explainer title="What is a dividend?">
            <p>
              When a company makes a profit, it can share some of it with the
              people who own its shares. That payment is a dividend. Own 1,000
              shares of a company that pays KSh 1 per share, and you receive
              KSh 1,000 — usually into the account your broker holds for you.
            </p>
            <p>
              Dividends are taxed at 5%, taken off before the money reaches
              you (withholding tax). Not every company pays one, and a company
              can cut or skip a dividend in a bad year. A dividend is a
              return on owning the business, not a salary — it is never
              guaranteed.
            </p>
          </Explainer>

          <Explainer title="Why do share prices move?">
            <p>
              A price is the last deal struck between a buyer and a seller. It
              moves when what people are willing to pay changes — and that
              changes with the company's own news (its results, a new boss, a
              big contract, a fine), with the economy around it (interest
              rates, the shilling, fuel prices), and with plain mood: fear
              and greed move prices before the facts are in.
            </p>
            <p>
              Most days, a move has a story behind it. On any stock page on
              this site, the headlines matched to that company sit next to the
              price — reading them is the fastest way to see why a price
              moved, and whether the reason is real or just noise.
            </p>
          </Explainer>

          <Explainer title="Shares, a money market fund, or Treasury bills?">
            <p>
              Three different places to put money, three different deals:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="text-foreground">Shares.</span> Start with
                one share — its price plus fees. You own part of a company.
                The value can rise or fall sharply, and there is no promised
                return. Dividends, when paid, are taxed at 5%.
              </li>
              <li>
                <span className="text-foreground">Money market fund (MMF).</span>{" "}
                Start with about KSh 1,000. Your money is pooled and lent out
                at interest by a fund manager. Returns are steadier and
                lower, and the interest is taxed at 15%.
              </li>
              <li>
                <span className="text-foreground">Treasury bills.</span>{" "}
                Start with KSh 100,000, bought from the Central Bank through
                a DhowCSD account. You are lending to the government for 3,
                6 or 12 months at a fixed rate agreed up front.
              </li>
            </ul>
            <p>
              None of the three is "the best one." They pay differently
              because they risk differently. Plenty of people hold a mix:
              bills or a fund for money they cannot afford to lose, shares
              for money they can leave alone for years.
            </p>
          </Explainer>

          <Explainer title="What happens if my broker collapses?">
            <p>
              Your shares survive it. They are recorded in your CDS account,
              in your name, at the CDSC — not on the broker's own books. If
              the broker fails, your shares are still yours, and you can move
              them to another broker. The broker never owned them; it only
              placed your orders.
            </p>
            <p>
              Cash is the exposed part. If a licensed broker fails while owing
              you money, the Investor Compensation Fund, run by the CMA, can
              pay you — but only up to KSh 50,000. That cap is the honest
              part of the story: the protection is real, and it is limited.
              It is one more reason to use a licensed broker and to keep
              records of your own trades.
            </p>
          </Explainer>

          <Explainer title="The one-share rule — and its catch">
            <p>
              Until August 2025, the NSE made you buy at least 100 shares at a
              time. For a company trading at a few hundred shillings a share,
              that put the minimum ticket out of reach for most people. The
              rule is gone: one share is now a legal trade, and the minimum
              amount you can invest is one share's price plus fees.
            </p>
            <p>
              The catch is the fee stack from step 3, above all the stamp
              duty: a flat KSh 2 minimum on every trade. On one real purchase
              of a single Absa share at Sh30.20, the total charges came to
              Sh2.45 — and Sh2 of that was stamp duty alone. One share is a
              fine way to start and to learn. Just know that, per shilling,
              it is the most expensive way to trade, and the cost evens out as
              the trade gets bigger.
            </p>
          </Explainer>
        </div>
      </PageContainer>
    </TerminalShell>
  );
}
