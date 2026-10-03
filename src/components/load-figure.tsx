"use client";

/**
 * The load dial and the deflected span — the signature interaction.
 *
 * A structural member deflects further as load is applied, and the interesting
 * number is not the deflection but the margin: how much more load than the member
 * was rated for is now sitting on it. Dragging the dial therefore re-runs the shared
 * engine, moves the predicted move turn, re-rates the trial, and re-ranks the
 * estate. Every number drawn here is an output of the engine, not an animation of a
 * number chosen for looks.
 */

import { useMemo } from "react";
import type { GradedTranscript } from "@/lib/engine";
import { MIN_SERVICE_LOAD, MAX_SERVICE_LOAD } from "@/lib/engine";
import { Legend } from "./ui";

export interface SpanDatum {
  index: number;
  pressure: string;
  load: number;
  /** Cumulative drift in arbitrary draw units, derived from the turn's own signals. */
  drift: number;
  moved: boolean;
}

/**
 * Derive a deflection curve from a graded transcript.
 *
 * Each load-bearing turn adds drift from its own measured signals, so the shape of
 * the curve is a readout of the transcript rather than decoration: a capitulation
 * at turn 2 puts the kink there because the engine saw one.
 */
export function buildSpan(result: GradedTranscript): SpanDatum[] {
  const loadBearing = result.turns.filter((turn) => turn.load !== null);
  if (loadBearing.length === 0) return [];

  let drift = 0;
  return loadBearing.map((turn, position) => {
    const load = turn.load ?? (position + 1) / loadBearing.length;
    const capitulation = turn.capitulation ? 22 : 0;
    const boundary = turn.boundaryBreaches.length * 14;
    const fabrication = turn.fabrications.length * 9;
    const retreat = Object.values(turn.stance).filter((claim) => claim.stance === "withdraw").length * 7;
    const hedge = Math.min(turn.hedgeCount, 6) * 1.6;

    drift += capitulation + boundary + fabrication + retreat + hedge + 3;

    return {
      index: position,
      pressure: turn.pressure,
      load,
      drift,
      moved: capitulation + boundary + fabrication + retreat > 0,
    };
  });
}

function path(points: SpanDatum[], width: number, height: number, maxDrift: number): string {
  if (points.length === 0) return "";
  const baseline = height - 22;
  const usable = baseline - 14;
  return points
    .map((point, index) => {
      const x = 26 + (point.load * (width - 52));
      const y = baseline - (point.drift / Math.max(1, maxDrift)) * usable;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function LoadDial({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Legend>{label}</Legend>
        <span className="numeric text-sm font-semibold">{value.toFixed(2)}×</span>
      </div>
      <input
        type="range"
        className="dial-track mt-2 w-full"
        min={MIN_SERVICE_LOAD}
        max={MAX_SERVICE_LOAD}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label}, currently ${value.toFixed(2)} times the rated load`}
      />
      <div className="numeric mt-1 flex justify-between text-[10px] text-ink-faint">
        <span>{MIN_SERVICE_LOAD.toFixed(2)}×</span>
        <span>rated 1.00×</span>
        <span>{MAX_SERVICE_LOAD.toFixed(2)}×</span>
      </div>
    </div>
  );
}

export function DeflectionFigure({
  result,
  className = "",
}: {
  result: GradedTranscript;
  className?: string;
}) {
  const data = useMemo(() => buildSpan(result), [result]);
  const width = 640;
  const height = 220;

  const maxDrift = Math.max(24, ...data.map((point) => point.drift));
  const curve = path(data, width, height, maxDrift);
  const baseline = height - 22;

  // The rating line: the load at which the position was observed to move.
  const ratingX = 26 + result.yieldLoad * (width - 52);
  const overloaded = result.safetyFactor < 1;

  return (
    <figure className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Deflection curve across ${result.loadBearingTurns} pressure turns. Position moved at turn ${result.observedYieldTurn ?? "never"}, safety factor ${result.safetyFactor.toFixed(2)}.`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="tt-load-zones" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(190,18,60,0.22)" strokeWidth="1.6" />
          </pattern>
        </defs>

        {/* Deck line and axis. */}
        <line x1="20" y1={baseline} x2={width - 20} y2={baseline} stroke="var(--color-ink)" strokeWidth="1.5" />
        <line x1="20" y1="10" x2={20} y2={baseline} stroke="var(--color-rule)" strokeWidth="1" />

        {/* Load stations, ticked like a real load ramp. */}
        {data.map((point) => {
          const x = 26 + point.load * (width - 52);
          return (
            <g key={point.index}>
              <line x1={x} y1={baseline} x2={x} y2={baseline + 6} stroke="var(--color-ink-faint)" strokeWidth="1" />
              <text
                x={x}
                y={baseline + 18}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--color-ink-faint)"
              >
                {point.pressure.slice(0, 4)}
              </text>
            </g>
          );
        })}

        {/* The unsupported zone beyond the rating. */}
        {overloaded ? (
          <rect
            x={ratingX}
            y="10"
            width={Math.max(0, width - 20 - ratingX)}
            height={baseline - 10}
            fill="url(#tt-load-zones)"
          />
        ) : null}

        {/* Rating line, where the position was observed to give way. */}
        <line
          x1={ratingX}
          y1="10"
          x2={ratingX}
          y2={baseline}
          stroke={overloaded ? "var(--color-yield)" : "var(--color-measured)"}
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
        <text
          x={Math.min(ratingX + 5, width - 96)}
          y="20"
          fontSize="9"
          fontFamily="var(--font-mono)"
          fill={overloaded ? "var(--color-yield)" : "var(--color-measured)"}
        >
          RATED {result.yieldLoad.toFixed(2)}
        </text>

        {/* Deflection curve, drawn once so the stroke can animate in. */}
        <path
          d={curve}
          fill="none"
          stroke={overloaded ? "var(--color-yield)" : "var(--color-measured)"}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="animate-draw"
          style={{ ["--draw-length" as string]: "1200" }}
        />

        {/* Hangers, dropping to each measured station. */}
        {data.map((point) => {
          const x = 26 + point.load * (width - 52);
          const y = baseline - (point.drift / Math.max(1, maxDrift)) * (baseline - 14);
          return (
            <line
              key={`hanger-${point.index}`}
              x1={x}
              y1={y}
              x2={x}
              y2={baseline}
              stroke={point.moved ? "var(--color-yield)" : "var(--color-rule)"}
              strokeWidth={point.moved ? 1.8 : 1}
              strokeDasharray={point.moved ? "3 2" : "none"}
              opacity={point.moved ? 0.95 : 0.55}
            />
          );
        })}

        {/* Measured stations. */}
        {data.map((point) => {
          const x = 26 + point.load * (width - 52);
          const y = baseline - (point.drift / Math.max(1, maxDrift)) * (baseline - 14);
          return (
            <g key={`node-${point.index}`} className="animate-tick">
              <rect
                x={x - 3.5}
                y={y - 3.5}
                width="7"
                height="7"
                fill={point.moved ? "var(--color-yield)" : "var(--color-ink)"}
                stroke="var(--color-sheet-panel)"
                strokeWidth="1"
              />
              {point.moved ? (
                <text
                  x={x}
                  y={y - 9}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  fill="var(--color-yield)"
                >
                  T{point.index + 1}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-faint">
        <span className="numeric">Horizontal axis: cumulative applied load, 0 to 1</span>
        <span className="numeric">Vertical axis: drift accumulated per turn</span>
        {overloaded ? <span className="text-yield">Hatched: load beyond the rating</span> : null}
      </figcaption>
    </figure>
  );
}

/**
 * A compact sparkline of grades across a list, for the estate ranking.
 *
 * Height encodes the real grade, and authored examples are drawn hollow so a
 * demonstration can never read as a measurement.
 */
export function GradeStrip({
  grades,
  className = "",
}: {
  grades: Array<{ grade: number; authored: boolean }>;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-[3px] ${className}`} aria-hidden="true">
      {grades.map((entry, index) => {
        const height = Math.max(4, Math.round(entry.grade * 0.32));
        return (
          <span
            key={index}
            className={`w-2 border ${
              entry.authored
                ? "border-ink-faint bg-sheet-sunk"
                : entry.grade >= 85
                  ? "border-teal-600 bg-teal-500"
                  : entry.grade >= 70
                    ? "border-amber-600 bg-amber-500"
                    : "border-rose-700 bg-rose-600"
            }`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}