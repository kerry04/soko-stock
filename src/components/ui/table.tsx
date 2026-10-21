import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Base primitives (shadcn API, terminal typography) ─────────────────── */

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-accent/40 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 px-2 text-left align-middle font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-2 py-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

/* ── DataTable — the terminal's one table discipline ───────────────────── */

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Column alignment. Numeric columns are right-aligned and get the `num` voice. */
  align?: "left" | "center" | "right";
  numeric?: boolean;
  sortable?: boolean;
  /** Value used for sorting; required for sortable columns to sort sensibly. */
  sortValue?: (row: T) => string | number | null;
  render: (row: T, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableSort {
  key: string;
  dir: "asc" | "desc";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  /** Skeleton rows rendered while `loading` (default 6). */
  skeletonRows?: number;
  density?: "compact" | "comfortable";
  /** Rendered in a full-width row when `rows` is empty and not loading. */
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: DataTableSort;
  /** When set, the table scrolls inside this height and the header sticks. */
  maxHeight?: string;
  className?: string;
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls sink to the bottom in both directions
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * DataTable: sticky header (in a scroll region), click-to-sort headers,
 * numeric columns right-aligned in the mono numeric voice, skeleton rows
 * while loading, one empty-state row. Presentation only — rows arrive
 * ready to render.
 */
function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  density = "comfortable",
  emptyState,
  onRowClick,
  initialSort,
  maxHeight,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<DataTableSort | null>(initialSort ?? null);

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => compareValues(col.sortValue!(a), col.sortValue!(b)) * factor,
    );
  }, [rows, columns, sort]);

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "desc" },
    );
  };

  const alignClass = (col: DataTableColumn<T>) =>
    col.numeric || col.align === "right"
      ? "text-right"
      : col.align === "center"
        ? "text-center"
        : "text-left";

  const cellPadding = density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <div
      className={cn("relative w-full overflow-auto", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full caption-bottom text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                  }
                  className={cn(
                    "sticky top-0 z-10 h-9 bg-card px-2 align-middle font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
                    alignClass(col),
                    col.headerClassName,
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase tracking-[inherit] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        col.numeric || col.align === "right" ? "flex-row-reverse" : "",
                        active ? "text-primary" : "",
                      )}
                    >
                      {col.header}
                      <span aria-hidden className={active ? "" : "opacity-40"}>
                        {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, ri) => (
                <tr key={`sk-${ri}`} className="border-b border-border/60" aria-hidden>
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-2", cellPadding)}>
                      <Skeleton
                        className={cn(
                          "h-3.5",
                          col.numeric || col.align === "right"
                            ? "ml-auto w-14"
                            : "w-24",
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : sortedRows.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40",
                    onRowClick ? "cursor-pointer" : "",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-2 align-middle",
                        cellPadding,
                        alignClass(col),
                        col.numeric ? "num font-mono" : "",
                        col.cellClassName,
                      )}
                    >
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && sortedRows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-2 py-8 text-center font-mono text-xs text-muted-foreground"
              >
                {emptyState ?? "No rows."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  DataTable,
};
