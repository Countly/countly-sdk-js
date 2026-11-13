// Writes api/countly-sdk-web.api from the SDK and its TypeScript definitions. Run it with npm run api:update after a
// deliberate change to the public API, and add a CHANGELOG.md line for the change.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { apiReport, publicFunctions } from "./api-report.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "api", "countly-sdk-web.api");
const Countly = (await import(pathToFileURL(join(root, "Countly.js")).href)).default;
const report = apiReport(publicFunctions(Countly), readFileSync(join(root, "types", "countly-sdk-web.d.ts"), "utf8"));
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, report);
console.log("api:update, wrote " + file);
// the SDK's timers would keep Node running
process.exit(0);
