import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const fence = "```mermaid";
const blocks = [];
let cursor = 0;
for (;;) {
  const start = readme.indexOf(fence, cursor);
  if (start === -1) break;
  const bodyStart = start + fence.length;
  const end = readme.indexOf("```", bodyStart);
  if (end === -1) break;
  blocks.push(readme.slice(bodyStart, end));
  cursor = end + 3;
}

console.log(`mermaid diagrams: ${blocks.length}`);
let previous = null;
let problems = 0;

blocks.forEach((body, index) => {
  const direction = (body.match(/^graph\s+(TB|LR)/m) ?? [])[1] ?? "?";
  // A node is a declaration line or an edge endpoint declaration.
  const declared = (body.match(/^\s*[A-Za-z][\w]*(?:\[\[|\[|\{)/gm) ?? []).length;
  const edges = (body.match(/-->/g) ?? []).length;
  const subgraphs = (body.match(/^\s*subgraph/gm) ?? []).length;
  const nodes = Math.max(declared, edges + 1);

  const alternating = previous === null || direction !== previous;
  const withinBudget = nodes <= 14;

  if (!alternating || !withinBudget || direction === "?") {
    problems += 1;
    console.log(
      `  ${index + 1}: dir=${direction} nodes~${nodes} edges=${edges} subgraphs=${subgraphs} ` +
        `${alternating ? "" : "DIRECTION-DID-NOT-ALTERNATE "}${withinBudget ? "" : "OVER-14-NODES"}`,
    );
  } else {
    console.log(`  ${index + 1}: dir=${direction} nodes~${nodes} edges=${edges} subgraphs=${subgraphs}  ok`);
  }
  previous = direction;
});

console.log(`\nproblem diagrams: ${problems}`);
process.exit(problems === 0 ? 0 : 1);