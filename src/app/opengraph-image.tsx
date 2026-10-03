import { ImageResponse } from "next/og";
import { site } from "@/config/site";

/**
 * OpenGraph card, generated as a real PNG so the social preview always matches the
 * current deploy. 1200x630, which is what the platform crawlers expect.
 *
 * Drawn with positioned nodes rather than SVG because the renderer is satori, which
 * accepts a subset of flexbox and not arbitrary graphics. The curve below is a real
 * computed curve: each node is plotted at the point the deflection formula puts it.
 */
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#15181e";
const INK_SOFT = "#454c59";
const INK_FAINT = "#737c8c";
const RULE = "#c3cbd7";
const SHEET = "#f2f4f7";
const PANEL = "#ffffff";
const MEASURED = "#1d4ed8";
const YIELD = "#be123c";

/** Deflection curve: a quadratic ease, plotted as discrete stations. */
const STATIONS = 22;
const curveY = (t: number) => {
  // Rises slowly, then steeply: the shape of a member losing its margin.
  const eased = t * t * 0.72 + t * 0.28;
  return 132 - eased * 112;
};

export default function OpengraphImage() {
  const nodes = Array.from({ length: STATIONS }, (_, index) => {
    const t = index / (STATIONS - 1);
    return {
      left: 78 + t * 700,
      top: curveY(t),
      deep: t > 0.72,
    };
  });

  const hangers = nodes.filter((_, index) => index % 4 === 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: SHEET,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Plot grid, drawn as ruled lines the way a drawing sheet is ruled. */}
        <div style={{ display: "flex", position: "absolute", inset: 0 }}>
          {Array.from({ length: 46 }, (_, index) => (
            <div
              key={`v${index}`}
              style={{
                width: 24,
                height: "100%",
                borderRight: `1px solid rgba(21,24,30,${index % 8 === 0 ? 0.11 : 0.05})`,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", position: "absolute", inset: 0, flexDirection: "column" }}>
          {Array.from({ length: 27 }, (_, index) => (
            <div
              key={`h${index}`}
              style={{
                height: 24,
                width: "100%",
                borderBottom: `1px solid rgba(21,24,30,${index % 8 === 0 ? 0.11 : 0.05})`,
              }}
            />
          ))}
        </div>

        {/* Cap rule. */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 9, backgroundColor: INK }} />

        <div style={{ display: "flex", flexDirection: "column", padding: "60px 72px 0" }}>
          <div
            style={{
              display: "flex",
              fontSize: 19,
              letterSpacing: 5,
              color: INK_FAINT,
              fontFamily: "monospace",
            }}
          >
            STRUCTURAL LOAD-TEST BENCH · {site.benchmark.name.toUpperCase()}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", marginTop: 22 }}>
            <div style={{ fontSize: 86, fontWeight: 800, color: INK, letterSpacing: -2 }}>{site.name}</div>
          </div>

          <div style={{ display: "flex", fontSize: 29, fontWeight: 600, color: INK_SOFT, marginTop: 2 }}>
            Load-test an LLM&rsquo;s position before you ship it.
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 17,
              color: INK_SOFT,
              marginTop: 18,
              fontFamily: "monospace",
              letterSpacing: 1,
            }}
          >
            HOLD DEPTH · EVIDENCE RETENTION · PERMANENT SET
          </div>
        </div>

        {/* Deflection figure. Every child is absolutely positioned, so declaring flex here
            satisfies the renderer's requirement without changing the layout. */}
        <div
          style={{
            position: "absolute",
            left: 78,
            top: 336,
            width: 1044,
            height: 150,
            display: "flex",
          }}
        >
          {/* Hatched zone beyond the rating. */}
          <div
            style={{
              position: "absolute",
              left: 800,
              top: 0,
              width: 244,
              height: 132,
              backgroundColor: "rgba(190,18,60,0.10)",
              borderLeft: `3px dashed ${YIELD}`,
            }}
          />
          {Array.from({ length: 24 }, (_, index) => (
            <div
              key={`hatch${index}`}
              style={{
                position: "absolute",
                left: 800 + index * 11,
                top: -10,
                width: 2,
                height: 150,
                backgroundColor: "rgba(190,18,60,0.22)",
                transform: "rotate(24deg)",
              }}
            />
          ))}

          {/* Hangers. */}
          {hangers.map((node, index) => (
            <div
              key={`hanger${index}`}
              style={{
                position: "absolute",
                left: node.left,
                top: node.top + 3,
                width: 1,
                height: 132 - (node.top - 4),
                backgroundColor: index * 4 > 22 ? "rgba(190,18,60,0.55)" : "rgba(195,203,215,0.85)",
              }}
            />
          ))}

          {/* Deck. */}
          <div
            style={{
              position: "absolute",
              left: -6,
              top: 132,
              width: 1050,
              height: 3,
              backgroundColor: INK,
            }}
          />

          {/* Plotted stations. */}
          {nodes.map((node, index) => (
            <div
              key={`node${index}`}
              style={{
                position: "absolute",
                left: node.left - 4,
                top: node.top - 4,
                width: 9,
                height: 9,
                backgroundColor: node.deep ? YIELD : MEASURED,
                border: `2px solid ${SHEET}`,
              }}
            />
          ))}

          <div
            style={{
              position: "absolute",
              left: 0,
              top: 150,
              fontSize: 15,
              color: INK_FAINT,
              fontFamily: "monospace",
            }}
          >
            YIELDED AT TURN 3 · SAFETY FACTOR 0.86 · PERMANENT SET 2 CLAIMS
          </div>
        </div>

        {/* Footer strip. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 72,
            backgroundColor: PANEL,
            borderTop: `1px solid ${RULE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 72px",
          }}
        >
          <div style={{ display: "flex", fontSize: 16, color: INK_SOFT, fontFamily: "monospace" }}>
            DETERMINISTIC · EXPLAINABLE · SEALED · MCP AGENT
          </div>
          <div style={{ display: "flex", fontSize: 16, color: MEASURED, fontFamily: "monospace" }}>
            github.com/aniruddhaadak80/{site.repoSlug}
          </div>
        </div>
      </div>
    ),
    size,
  );
}