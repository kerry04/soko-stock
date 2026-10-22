import { createFileRoute, Link } from "@tanstack/react-router";
import { TerminalShell } from "@/components/nav/TerminalShell";
import { PageContainer } from "@/components/nav/PageContainer";
import { PageHeader } from "@/components/nav/PageHeader";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/table";

/**
 * The broker directory — the handoff point for real trading.
 *
 * Real trading in Kenya happens through a CMA-licensed broker: the broker
 * opens your CDS account, holds the cash side, and places the order on
 * the NSE. Soko Stock holds no client money and takes no orders.
 *
 * Rows and facts come from the trading-pivot research brief (21 Oct
 * 2026). Where the brief did not verify a per-broker fact — commission,
 * minimum, whether CDS opening is fully online — the cell says "Check
 * with the broker" rather than guessing. Those numbers change, and a
 * wrong figure here costs a reader real money. Every row is stamped
 * with the date the facts were checked.
 *
 * Outbound links were verified separately on 21 Oct 2026 by fetching
 * each firm's site and confirming it loads under the firm's own
 * branding — all 11 rows carry a link. (faida.co.ke is an unrelated
 * point-of-sale app, not the investment bank; Faida's site is
 * fib.co.ke, verified by fetch the same evening.)
 */

const CHECK = "Check with the broker";
const CHECKED = "21 Oct 2026";

interface BrokerRow {
  broker: string;
  note?: string;
  app: string;
  cdsOnline: string;
  mpesa: string;
  commission: string;
  minimum: string;
  site?: string;
  checked: string;
}

const row = (broker: string, app: string, note?: string, site?: string): BrokerRow => ({
  broker,
  note,
  app,
  cdsOnline: CHECK,
  mpesa: CHECK,
  commission: CHECK,
  minimum: CHECK,
  site,
  checked: CHECKED,
});

// CMA-licensed retail brokers named in the research brief; alphabetical.
const BROKERS: BrokerRow[] = [
  row("ABC Capital", "Online platform", undefined, "https://www.abccapital.co.ke"),
  row("AIB-AXYS Africa", "DigiTrader", undefined, "https://aib-axysafrica.com"),
  row("Dyer & Blair Investment Bank", CHECK, undefined, "https://www.dyerandblair.com"),
  row("Faida Investment Bank", "M-Trader", "Also sits behind the Hisa app.", "https://fib.co.ke"),
  row("Genghis Capital", CHECK, undefined, "https://genghis-capital.com"),
  row(
    "Kestrel Capital",
    CHECK,
    "The broker behind Ziidi Trader inside M-PESA, and behind Bamboo's Kenya operation.",
    "https://kestrelcapital.com",
  ),
  row(
    "Kingdom Securities",
    CHECK,
    "For Co-operative Bank customers.",
    "https://kingdomsecurities.co.ke",
  ),
  row("NCBA Investment Bank", CHECK, undefined, "https://ncbagroup.com"),
  row("SBG Securities", "iTrader", undefined, "https://www.sbgsecurities.co.ke"),
  row("Standard Investment Bank", CHECK, undefined, "https://sib.co.ke"),
  row("Sterling Capital", CHECK, undefined, "https://sterlingib.com"),
];

const muted = (v: string) =>
  v === CHECK ? <span className="text-muted-foreground">{v}</span> : v;

const brokerColumns: DataTableColumn<BrokerRow>[] = [
  {
    key: "broker",
    header: "Broker",
    render: (b) => (
      <div>
        <span className="font-semibold text-foreground">{b.broker}</span>
        {b.note && (
          <p className="mt-0.5 max-w-56 text-[11px] font-normal leading-snug text-muted-foreground">
            {b.note}
          </p>
        )}
      </div>
    ),
  },
  { key: "app", header: "App", render: (b) => muted(b.app) },
  { key: "cdsOnline", header: "Opens CDS online", render: (b) => muted(b.cdsOnline) },
  { key: "mpesa", header: "M-PESA funding", render: (b) => muted(b.mpesa) },
  { key: "commission", header: "Published commission", render: (b) => muted(b.commission) },
  { key: "minimum", header: "Minimum", render: (b) => muted(b.minimum) },
  {
    key: "link",
    header: "Link out",
    render: (b) =>
      b.site ? (
        <a
          href={b.site}
          target="_blank"
          rel="noreferrer"
          className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
        >
          {b.site.replace(/^https?:\/\//, "").replace(/\/$/, "")} →
        </a>
      ) : (
        muted(CHECK)
      ),
  },
  {
    key: "checked",
    header: "Checked",
    render: (b) => <span className="text-muted-foreground">{b.checked}</span>,
  },
];

export const Route = createFileRoute("/brokers")({
  head: () => ({
    meta: [
      { title: "Brokers — Soko Stock" },
      {
        name: "description",
        content:
          "CMA-licensed brokers who can open your CDS account and trade NSE shares for you. Soko Stock doesn't hold your money — brokers do the trading.",
      },
    ],
  }),
  component: BrokersPage,
});

function BrokersPage() {
  return (
    <TerminalShell>
      <PageContainer className="py-4 sm:py-6">
        <PageHeader
          slug="BRKR · Brokers"
          title="Brokers"
          description="Real trading happens with a licensed broker, not here."
        />

        <div className="max-w-3xl space-y-3 text-sm leading-relaxed">
          <p>
            These are the licensed brokers who can open your CDS account —
            a broker is the only firm allowed to place orders on the Nairobi
            Securities Exchange, and your shares are recorded in that CDS
            account at the CDSC, in your name.{" "}
            <strong>Soko Stock doesn&apos;t hold your money</strong> and
            can&apos;t trade for you; your money sits with the broker you
            choose.
          </p>
          <p>
            Opening a CDS account is free. You need a national ID or
            passport, a KRA PIN certificate, passport photos, and a form
            called CDS 1, which the broker gives you to fill in. Brokers charge roughly 1.1–2.1% brokerage per trade — the
            rate is negotiable — on top of fixed market levies of 0.34%.
            Many brokers now open the account fully online, and funding is
            commonly by M-PESA. Compare those three things on the
            broker&apos;s own site before you choose: they change, and this
            page does not track them live.
          </p>
        </div>

        <Panel variant="folio" padding="none" className="mt-6 overflow-hidden">
          <PanelHeader className="px-4 pt-4">
            <PanelTitle>CMA-licensed retail brokers</PanelTitle>
          </PanelHeader>
          <DataTable
            columns={brokerColumns}
            rows={BROKERS}
            rowKey={(b) => b.broker}
            maxHeight="70vh"
          />
        </Panel>

        <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          The CMA licenses around 22 investment banks plus standalone
          stockbrokers; this page lists the retail brokers covered in our
          research so far. If a broker ever asks you to send money to a
          personal number, stop — that is not how a licensed broker works.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
          Fields marked &ldquo;check with the broker&rdquo; are facts we
          have not verified for that firm yet — we would rather show a gap
          than a guess. Checked {CHECKED}.
        </p>
      </PageContainer>
    </TerminalShell>
  );
}
