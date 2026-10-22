/**
 * Plain sentences for the Stock page's "Why it moved" panel. Facts only:
 * the move across the last five trading days when daily bars exist, or the
 * last close when they do not; the exchange board's average for the same
 * day when it is known; and up to two classified headlines from the week.
 *
 * A headline is context, never a cause. These strings never say that a
 * story moved the price.
 */

import { classifyHeadline, HEADLINE_EVENT_LABELS, type HeadlineEvent } from "@/lib/news/events";

export interface MoveBar {
  c: number | null;
}

export interface MoveArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

export interface MoveStory {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  event: HeadlineEvent;
  eventLabel: string;
}

export type MoveKind = "five-day" | "last-close";

export interface MoveSummary {
  kind: MoveKind;
  /** Percent change for the measured window; null when no close exists. */
  changePercent: number | null;
  /** The main factual sentence. */
  sentence: string;
  /** Same-day board average sentence, only when the moves are alike. */
  boardSentence: string | null;
  /** Up to two classified stories from the last seven days. */
  stories: MoveStory[];
  /** Plain line when no classified story exists this week. */
  noStorySentence: string;
}

const DAY_MS = 86_400_000;
/** How close to the board average counts as "much like it", in points. */
export const BOARD_SIMILARITY_POINTS = 0.5;

function pctAbs(v: number): string {
  return `${Math.abs(v).toFixed(2)}%`;
}

function directionWord(v: number): "up" | "down" | "flat" {
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

/** Last close versus the close five trading days earlier. */
export function fiveDayChange(bars: MoveBar[]): number | null {
  const closes = bars
    .map((b) => b.c)
    .filter((c): c is number => c != null && Number.isFinite(c));
  if (closes.length < 6) return null;
  const first = closes[closes.length - 6];
  const last = closes[closes.length - 1];
  if (!(first > 0)) return null;
  return ((last - first) / first) * 100;
}

/**
 * Classified company headlines from the last seven days, newest first,
 * deduped by title, capped at two.
 */
export function classifiedStories(
  articles: MoveArticle[],
  nowMs: number = Date.now(),
): MoveStory[] {
  const cutoff = nowMs - 7 * DAY_MS;
  const seen = new Set<string>();
  const out: MoveStory[] = [];
  for (const a of [...articles].sort(
    (x, y) => new Date(y.published_at).getTime() - new Date(x.published_at).getTime(),
  )) {
    const t = new Date(a.published_at).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const event = classifyHeadline(a.title);
    if (!event) continue;
    const key = a.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: a.id,
      title: a.title,
      url: a.url,
      source: a.source,
      publishedAt: a.published_at,
      event,
      eventLabel: HEADLINE_EVENT_LABELS[event],
    });
    if (out.length === 2) break;
  }
  return out;
}

/** The board-average line, only when the stock and board moved alike. */
export function boardAverageSentence(
  stockPercent: number | null,
  boardPercent: number | null,
  boardName: string | null,
): string | null {
  if (stockPercent == null || boardPercent == null || !boardName) return null;
  if (!Number.isFinite(stockPercent) || !Number.isFinite(boardPercent)) return null;
  if (Math.abs(stockPercent - boardPercent) > BOARD_SIMILARITY_POINTS) return null;
  const stockDir = directionWord(stockPercent);
  const boardDir = directionWord(boardPercent);
  if (stockDir !== "flat" && boardDir !== "flat" && stockDir !== boardDir) return null;
  const sign = boardPercent > 0 ? "+" : "";
  return `The whole ${boardName} board averaged ${sign}${boardPercent.toFixed(2)}% that day — a similar move.`;
}

export function summarizeMove({
  name,
  bars,
  lastChangePercent,
  boardAveragePercent = null,
  boardName = null,
  articles = [],
  nowMs = Date.now(),
}: {
  name: string;
  bars: MoveBar[];
  /** Day change at the last close, used for end-of-day listings. */
  lastChangePercent: number | null;
  boardAveragePercent?: number | null;
  boardName?: string | null;
  articles?: MoveArticle[];
  nowMs?: number;
}): MoveSummary {
  const fiveDay = fiveDayChange(bars);
  const kind: MoveKind = fiveDay != null ? "five-day" : "last-close";
  const changePercent = fiveDay ?? lastChangePercent;
  const stories = classifiedStories(articles, nowMs);

  let sentence: string;
  if (changePercent == null) {
    sentence = "There is no completed close to measure this move from yet.";
  } else if (kind === "five-day") {
    const dir = directionWord(changePercent);
    sentence =
      dir === "flat"
        ? `${name} was flat over the last five trading days.`
        : `${name} is ${dir} ${pctAbs(changePercent)} over the last five trading days.`;
  } else {
    const dir = directionWord(changePercent);
    sentence =
      dir === "flat"
        ? `At the last close, ${name} was unchanged.`
        : `At the last close, ${name} was ${dir} ${pctAbs(changePercent)}.`;
  }

  return {
    kind,
    changePercent,
    sentence,
    boardSentence: boardAverageSentence(changePercent, boardAveragePercent, boardName),
    stories,
    noStorySentence: "There is no story we can point to this week.",
  };
}
