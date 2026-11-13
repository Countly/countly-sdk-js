// In each request scenario the SDK sends the requests api/requests/<scenario>.json records, with the values that change
// from run to run masked. A deliberate change is recorded with npm run api:update and needs a CHANGELOG.md line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { apiDifference } from "../../scripts/api-report.mjs";
import { SCENARIOS, requestsReport, scenarioRequests } from "../../scripts/request-scenarios.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

for (const name of Object.keys(SCENARIOS)) {
    test("the " + name + " scenario sends the requests api/requests/" + name + ".json records", async() => {
        const file = join(root, "api", "requests", name + ".json");
        const message = "the requests of the " + name + " scenario changed; if that is deliberate, run npm run api:update, check the difference in api/requests/" + name + ".json and add a CHANGELOG.md line";
        assert.ok(existsSync(file), "no " + file + ", run npm run api:update");
        const Countly = (await import(pathToFileURL(join(root, "Countly.js")).href)).default;
        const current = requestsReport(await scenarioRequests(Countly, name));
        const committed = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
        assert.deepEqual(apiDifference(committed, current), [], message);
        assert.equal(current, committed, message);
    });
}
