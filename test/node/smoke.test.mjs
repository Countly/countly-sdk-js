// Smoke test for consumers that are not a browser page: bundlers, frameworks and web workers load the
// built bundles, so every module format must import and the SDK must run without a window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");

// This package is "type": "module", so Node would parse the .js CJS and UMD bundles as ES modules
// from inside it. A CommonJS consumer (or a bundler) sees them as scripts, which is what is emulated
// here by requiring copies from a CommonJS package.
const consumer = mkdtempSync(join(tmpdir(), "countly-consumer-"));
writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", type: "commonjs" }));
for (const file of ["countly_cjs.js", "countly_umd.js"]) {
    copyFileSync(join(dist, file), join(consumer, file));
}
const require = createRequire(join(consumer, "package.json"));

const esm = (await import(join(dist, "countly_esm.js"))).default;
const cjs = require(join(consumer, "countly_cjs.js")).default;
const umd = require(join(consumer, "countly_umd.js")).default;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const [format, Countly] of [["esm", esm], ["cjs", cjs], ["umd", umd]]) {
    test(`${format} bundle exposes the SDK entry points`, () => {
        assert.equal(typeof Countly.init, "function");
        assert.equal(typeof Countly.serialize, "function");
        assert.equal(typeof Countly.deserialize, "function");
        assert.equal(typeof Countly.DeviceIdType, "object");
    });
}

test("runs in a runtime without a window and delivers events through the request path", async () => {
    const Countly = esm;
    const seen = [];
    Countly.init({
        app_key: "SMOKE_APP_KEY",
        url: "https://smoke.count.ly",
        debug: false,
        fake_request_handler: (req) => {
            seen.push(req);
            if (req.functionName === "server_config") {
                return { status: 200, responseText: JSON.stringify({ v: 2, t: 1, c: {}, lg: { e: false } }) };
            }
            return { status: 200, responseText: '{"result":"Success"}' };
        }
    });
    try {
        assert.equal(Countly.sdk_name(), "javascript_native_web");
        assert.match(Countly.sdk_version(), /^\d+\.\d+\.\d+$/);
        assert.ok(Countly.get_device_id(), "a device id is generated without a browser");

        Countly.add_event({ key: "smoke_event", count: 1, segmentation: { runtime: "node" } });
        Countly.user_details({ name: "Smoke" });
        // the heartbeat drains the event queue and sends the request queue on its own
        await wait(1500);

        const sc = seen.find((req) => req.functionName === "server_config");
        assert.ok(sc, "the server config was fetched");
        assert.equal(sc.params.app_key, "SMOKE_APP_KEY");

        const sent = seen.filter((req) => req.functionName === "send_request_queue").map((req) => req.params);
        const eventRequest = sent.find((params) => typeof params.events === "string");
        assert.ok(eventRequest, "the event batch went out");
        assert.equal(JSON.parse(eventRequest.events)[0].key, "smoke_event");
        assert.ok(sent.some((params) => typeof params.user_details === "string"), "user details went out");
        sent.forEach((params) => {
            assert.equal(params.app_key, "SMOKE_APP_KEY");
            assert.equal(params.sdk_name, "javascript_native_web");
        });

        assert.equal(Countly._internals.getLogGatheringState().enabled, false, "not gathered without a directive");
    }
    finally {
        Countly.halt();
    }
});
