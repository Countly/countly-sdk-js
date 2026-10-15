// Turns coverage/coverage-summary.json into the Markdown shown in the job summary and the PR comment.
import { readFileSync, writeFileSync } from "node:fs";

const summaryPath = process.argv[2] || "coverage/coverage-summary.json";
const outPath = process.argv[3] || "coverage/summary.md";
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const total = summary.total;

const color = (pct) => (pct >= 80 ? "brightgreen" : pct >= 60 ? "yellow" : "red");
const mark = (pct) => (pct >= 80 ? "🟢" : pct >= 60 ? "🟡" : "🔴");
const pct = (metric) => (typeof metric.pct === "number" ? metric.pct : 0);
const cell = (metric) => `${mark(pct(metric))} ${pct(metric).toFixed(1)}% (${metric.covered}/${metric.total})`;
const bar = (value) => {
    const filled = Math.round(value / 5);
    return "`" + "█".repeat(filled) + "░".repeat(20 - filled) + "`";
};

const lines = [];
lines.push(`## Code coverage`);
lines.push("");
lines.push(`![lines](https://img.shields.io/badge/lines-${pct(total.lines).toFixed(1)}%25-${color(pct(total.lines))}) ![branches](https://img.shields.io/badge/branches-${pct(total.branches).toFixed(1)}%25-${color(pct(total.branches))}) ![functions](https://img.shields.io/badge/functions-${pct(total.functions).toFixed(1)}%25-${color(pct(total.functions))}) ![statements](https://img.shields.io/badge/statements-${pct(total.statements).toFixed(1)}%25-${color(pct(total.statements))})`);
lines.push("");
lines.push("| Metric | Coverage | |");
lines.push("|---|---|---|");
for (const key of ["lines", "statements", "functions", "branches"]) {
    lines.push(`| ${key[0].toUpperCase() + key.slice(1)} | ${cell(total[key])} | ${bar(pct(total[key]))} |`);
}
lines.push("");
lines.push("<details><summary>Per file</summary>");
lines.push("");
lines.push("| File | Lines | Branches | Functions | Statements |");
lines.push("|---|---|---|---|---|");
const files = Object.keys(summary).filter((key) => key !== "total").sort((a, b) => pct(summary[a].lines) - pct(summary[b].lines));
for (const file of files) {
    const entry = summary[file];
    const name = file.replace(process.cwd() + "/", "");
    lines.push(`| \`${name}\` | ${cell(entry.lines)} | ${cell(entry.branches)} | ${cell(entry.functions)} | ${cell(entry.statements)} |`);
}
lines.push("");
lines.push("</details>");
lines.push("");

const markdown = lines.join("\n");
writeFileSync(outPath, markdown);
process.stdout.write(markdown);
