import { ExternalLink } from "lucide-react";
import { EventBadge } from "@/components/stocks/badges";
import { summarizeMove, type MoveArticle, type MoveBar } from "@/lib/stocks/why-moved";
import { timeAgo } from "@/lib/stocks/format";

/**
 * Why it moved — facts the app already has. The sentence comes from the
 * pure move helper; headlines are context, never a claimed cause.
 */
export function MovePanel({
  name,
  bars,
  lastChangePercent,
  boardAveragePercent,
  boardName,
  articles,
}: {
  name: string;
  bars: MoveBar[];
  lastChangePercent: number | null;
  boardAveragePercent: number | null;
  boardName: string | null;
  articles: MoveArticle[];
}) {
  const summary = summarizeMove({
    name,
    bars,
    lastChangePercent,
    boardAveragePercent,
    boardName,
    articles,
  });

  return (
    <section aria-label="Why it moved" className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-2">
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 shrink-0 bg-primary" aria-hidden />
          Why it moved
        </p>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          {summary.kind === "five-day" ? "Last five trading days" : "Last close"}
        </span>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium leading-relaxed text-foreground">
          {summary.sentence}
        </p>
        {summary.boardSentence && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {summary.boardSentence}
          </p>
        )}

        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Stories from this week
          </p>
          {summary.stories.length === 0 ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {summary.noStorySentence}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {summary.stories.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[13px] leading-snug text-foreground underline-offset-2 hover:underline"
                  >
                    {s.title}
                    <ExternalLink
                      className="ml-1 inline h-3 w-3 text-muted-foreground"
                      aria-hidden
                    />
                  </a>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-muted-foreground">
                    <span>
                      {s.source} · {timeAgo(s.publishedAt)}
                    </span>
                    <EventBadge title={s.title} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-3 border-t border-border/60 pt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Headlines from the last seven days are shown as context. They are not a
          claim about what moved the price.
        </p>
      </div>
    </section>
  );
}
