/**
 * Shared presentational primitives.
 *
 * Everything here is drawn from the same vocabulary as the bench sheet: ruled
 * panels, legend labels in mono small caps, tabular figures, and dimension lines
 * instead of a card grid with shadows.
 */

import type { ReactNode } from "react";
import type { FactorBand, FactorResult } from "@/lib/engine";
import { BAND_LABEL } from "@/lib/engine";

export function Legend({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="legend">
      {children}
    </label>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-rule ${className}`} aria-hidden="true" />;
}

export function Registration({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`registration ${className}`}>{children}</div>;
}

/** A dimension line with a centred caption, as on a technical drawing. */
export function Dimension({
  from,
  to,
  caption,
  className = "",
}: {
  from: string;
  to: string;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="dimension" aria-hidden="true" />
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-sheet px-1.5">
        <span className="numeric text-[10px] text-ink-faint">
          {caption ? `${caption} ` : ""}
          {from}–{to}
        </span>
      </div>
    </div>
  );
}

export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  // min-w-0 caps the automatic minimum: a long single-line title in PanelHead
  // would otherwise give the panel a min-content wider than its grid track and
  // the panel would paint over its neighbour instead of truncating the title.
  return <Tag className={`panel min-w-0 ${className}`}>{children}</Tag>;
}

export function PanelHead({
  legend,
  title,
  right,
}: {
  legend: string;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-rule bg-sheet-sunk px-3 py-2">
      <div className="min-w-0">
        <Legend>{legend}</Legend>
        {title ? <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

const BAND_STYLE: Record<FactorBand, { fg: string; bg: string; border: string }> = {
  held: { fg: "text-held", bg: "bg-teal-50", border: "border-teal-300" },
  yielded: { fg: "text-caution", bg: "bg-amber-50", border: "border-amber-300" },
  permanent_set: { fg: "text-set", bg: "bg-purple-50", border: "border-purple-300" },
  fabricated: { fg: "text-yield", bg: "bg-rose-50", border: "border-rose-300" },
};

export function BandChip({ band, className = "" }: { band: FactorBand; className?: string }) {
  const style = BAND_STYLE[band];
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 ${style.fg} ${style.bg} ${style.border} ${className}`}
    >
      <span className="legend text-current">{BAND_LABEL[band]}</span>
    </span>
  );
}

/** A factor bar whose length is the factor's real weight, not a decorative bar. */
export function FactorBar({
  factor,
  showWeight = true,
}: {
  factor: FactorResult;
  showWeight?: boolean;
}) {
  const points = factor.contribution;
  const maxPossible = factor.weight * 100;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium">{factor.label}</span>
          <span className="numeric shrink-0 text-xs text-ink-faint">
            {(factor.value * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-1 h-2 w-full border border-rule bg-sheet-sunk">
          <div
            className={`h-full ${points / maxPossible > 0.999 ? "bg-held" : points / maxPossible > 0.7 ? "bg-caution" : "bg-yield"}`}
            style={{ width: `${Math.max(2, Math.min(100, (points / maxPossible) * 100))}%` }}
          />
        </div>
      </div>
      {showWeight ? (
        <div className="numeric shrink-0 text-right text-[10px] text-ink-faint">
          <div>×{factor.weight.toFixed(2)}</div>
          <div className="text-ink">{points.toFixed(1)} pts</div>
        </div>
      ) : null}
    </div>
  );
}

/** A figure readout, the way a load table prints a value. */
export function Figure({
  label,
  value,
  tone = "ink",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "held" | "yield" | "measured" | "caution" | "set";
  hint?: string;
}) {
  const toneClass = {
    ink: "text-ink",
    held: "text-held",
    yield: "text-yield",
    measured: "text-measured",
    caution: "text-caution",
    set: "text-set",
  }[tone];

  return (
    <div className="min-w-0">
      <Legend>{label}</Legend>
      <div className={`numeric mt-0.5 text-lg leading-tight font-semibold ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-ink-faint">{hint}</div> : null}
    </div>
  );
}

export function Button({
  children,
  variant = "default",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "default" | "primary" | "danger" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    default: "border-rule bg-sheet-panel text-ink hover:bg-sheet-sunk",
    primary: "border-ink bg-ink text-white hover:bg-ink-soft",
    danger: "border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100",
    ghost: "border-transparent bg-transparent text-ink-soft hover:bg-sheet-sunk hover:text-ink",
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 border px-3 py-1.5 text-xs font-semibold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StatusNote({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: ReactNode;
}) {
  const styles = {
    info: "border-rule bg-sheet-sunk text-ink-soft",
    error: "border-rose-300 bg-rose-50 text-rose-900",
    success: "border-teal-300 bg-teal-50 text-teal-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
  }[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`border px-3 py-2 text-xs ${styles}`}>
      {children}
    </div>
  );
}

/** A source-status badge. Fallback is always visible as fallback. */
export function SourceBadge({
  status,
  fetchedAt,
  className = "",
}: {
  status: "live" | "fallback";
  fetchedAt: string;
  className?: string;
}) {
  const live = status === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 ${
        live ? "border-teal-400 bg-teal-50 text-teal-900" : "border-amber-400 bg-amber-50 text-amber-900"
      } ${className}`}
      title={`${live ? "Fetched live" : "Sealed fallback"} at ${fetchedAt}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-teal-600" : "bg-amber-600"}`}
        aria-hidden="true"
      />
      <span className="legend text-current">{live ? "Live" : "Fallback"}</span>
    </span>
  );
}

/** Screen-reader-only text, for labels that are visual elsewhere. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}