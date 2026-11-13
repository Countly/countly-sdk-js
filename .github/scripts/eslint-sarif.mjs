/**
 * ESLint formatter that writes the results as SARIF 2.1.0, used by .github/workflows/static_analysis.yml.
 *
 * A file ESLint could not parse makes the formatter throw, so a broken analysis fails the job instead of
 * reading as a clean result.
 */
import path from "node:path";

/**
 * Returns the SARIF document for ESLint's results.
 * @param {Array<Object>} results - the linted files, each with its messages
 * @param {Object} context - ESLint's formatter context: the working directory and each rule's metadata
 * @returns {string} the SARIF document as JSON
 */
export default function format(results, context) {
  const rules = new Map();
  const findings = [];
  for (const file of results) {
    for (const message of file.messages) {
      if (message.fatal) {
        throw new Error(`ESLint could not parse ${file.filePath}: ${message.message}`);
      }
      const ruleId = message.ruleId ?? "eslint-directive";
      if (!rules.has(ruleId)) {
        const docs = context.rulesMeta?.[ruleId]?.docs ?? {};
        rules.set(ruleId, {
          id: ruleId,
          ...(docs.description && { shortDescription: { text: docs.description } }),
          ...(docs.url && { helpUri: docs.url }),
        });
      }
      findings.push({
        ruleId,
        level: message.severity === 2 ? "error" : "warning",
        message: { text: message.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: path.relative(context.cwd, file.filePath).split(path.sep).join("/") },
            region: { startLine: message.line ?? 1, startColumn: message.column ?? 1 },
          },
        }],
      });
    }
  }
  return JSON.stringify({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "ESLint", informationUri: "https://eslint.org", rules: [...rules.values()] } },
      results: findings,
    }],
  }, null, 1);
}
