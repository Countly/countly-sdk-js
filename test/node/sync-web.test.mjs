// The rewrites that turn this repository's files into countly-sdk-web's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toWebBundle, toWebTest, toWebFixture, toWebWorker, toWebChangelog, withLockVersion, withReleasedWorker, leftovers, sdkModulesUsed, moduleImports } from "../../scripts/sync-web/rewrite.mjs";

test("a spec loads the bundle and the copies of the SDK modules it reads", () => {
    const spec = [
        "var Countly = require(\"../../Countly.js\");",
        "const { SDK_VERSION } = require(\"../../modules/Constants.js\");",
        "import { SDK_NAME } from \"../../modules/Constants.js\";",
        "var ct = require('../../modules/ConnectionTest.js');",
        "cy.readFile(\"countly_sw.js\").then(() => {});",
        "const w = new Worker(\"../../test_workers/worker.js\", { type: \"module\" });"
    ].join("\n");
    const web = toWebTest(spec, "e2e");
    assert.equal(web, [
        "var Countly = require(\"../../lib/countly\");",
        "const { SDK_VERSION } = require(\"../support/sdk-modules/Constants.js\");",
        "import { SDK_NAME } from \"../support/sdk-modules/Constants.js\";",
        "var ct = require('../support/sdk-modules/ConnectionTest.js');",
        "cy.readFile(\"lib/countly_sw.js\").then(() => {});",
        "const w = new Worker(\"../../test_workers/worker.js\");"
    ].join("\n"));
    assert.deepEqual(leftovers(web), []);
    assert.deepEqual(sdkModulesUsed(web), ["Constants.js", "Constants.js", "ConnectionTest.js"]);
});

test("a support file loads the bundle, has no coverage support and reads the module copies next to it", () => {
    const support = "import './commands'\nimport '@cypress/code-coverage/support'\nimport \"../../Countly.js\";\nvar u = require(\"../../modules/Utils.js\");\n";
    assert.equal(toWebTest(support, "support"), "import './commands'\nimport \"../../lib/countly.js\";\nvar u = require(\"./sdk-modules/Utils.js\");\n");
});

test("a fixture loads the bundle as a classic script before its module script", () => {
    const fixture = "<html>\n<head>\n  <script type='module'>\n    import Countly from '../../Countly.js';\n    import { queryExtractor } from '../support/integration_helper.js';\n    Countly.init({});\n  </script>\n</head>\n</html>\n";
    assert.equal(toWebFixture(fixture), "<html>\n<head>\n  <script type='text/javascript' src='../../lib/countly.js'></script>\n  <script type='module'>\n    import { queryExtractor } from '../support/integration_helper.js';\n    Countly.init({});\n  </script>\n</head>\n</html>\n");
    assert.equal(toWebFixture("<html><body>no SDK</body></html>"), "<html><body>no SDK</body></html>");
});

test("a test worker becomes a classic worker that loads the bundle", () => {
    assert.equal(toWebWorker("import Countly from \"../Countly.js\";\n\nCountly.init({});\n"), "importScripts(\"../lib/countly.js\");\n\nCountly.init({});\n");
});

const WEB_CHANGELOG = "## 2.0.0\n\n- Added b\n\n## 1.0.0\n\n- Added a, as worded there\n\n## 0.9.0\n\n- Added the start\n";
const SYNCED_CHANGELOG = "## NEXT RELEASE\n\n- Added c\n  - detail\n- Fixed *d*\n\n" + WEB_CHANGELOG;

test("the CHANGELOG gets the newer sections on top, in countly-sdk-web's list marker, and keeps its own history", () => {
    const changelog = toWebChangelog("## NEXT RELEASE\n\n* Added c\n  * detail\n* Fixed *d*\n\n## 2.0.0\n\n* Added b\n\n## 1.0.0\n\n* Added a, as worded here\n", WEB_CHANGELOG);
    assert.equal(changelog.text, SYNCED_CHANGELOG);
    assert.deepEqual(changelog.added, ["NEXT RELEASE"]);
    assert.equal(changelog.below, "2.0.0");
    assert.equal(toWebChangelog("## 2.1.0\n\n* Added c\n\n## 2.0.0\n\n* Added b\n", "# Changelog\n\n" + WEB_CHANGELOG).text, "# Changelog\n\n## 2.1.0\n\n- Added c\n\n" + WEB_CHANGELOG);
});

test("syncing the CHANGELOG again replaces the sections an earlier sync added", () => {
    const ours = "## NEXT RELEASE\n\n* Added c\n  * detail\n* Fixed *d*\n\n## 2.0.0\n\n* Added b\n";
    assert.equal(toWebChangelog(ours, SYNCED_CHANGELOG).text, SYNCED_CHANGELOG);
    const released = toWebChangelog("## 2.1.0\n\n* Added c\n\n## 2.0.0\n\n* Added b\n", SYNCED_CHANGELOG);
    assert.equal(released.text, "## 2.1.0\n\n- Added c\n\n" + WEB_CHANGELOG);
    assert.equal(toWebChangelog("## 2.1.0\n\n* Added c, reworded\n\n## 2.0.0\n\n* Added b\n", released.text).text, "## 2.1.0\n\n- Added c, reworded\n\n" + WEB_CHANGELOG);
});

test("a blank line more or less still counts as the same section", () => {
    assert.equal(toWebChangelog("## 2.1.0\n\n* Added c\n\n## 2.0.0\n* Added b\n\n\n", WEB_CHANGELOG).below, "2.0.0");
});

test("the CHANGELOG is not merged when countly-sdk-web has a release this repository lacks, or no release in the same words", () => {
    assert.throws(() => toWebChangelog("## NEXT RELEASE\n\n* Added c\n\n## 2.0.0\n\n* Added b\n", "## 2.0.1\n\n- Fixed e\n\n" + WEB_CHANGELOG), /2\.0\.1/);
    assert.throws(() => toWebChangelog("## 2.0.0\n\n* Added b, reworded\n\n## 1.0.0\n\n* Added a, as worded here\n", WEB_CHANGELOG), /same words/);
});

test("the worker countly-sdk-web last committed joins the released workers when it is an earlier release", () => {
    assert.deepEqual(withReleasedWorker([], "26.8.0", "26.9.0"), ["26.8.0"]);
    assert.deepEqual(withReleasedWorker(["26.8.0", "26.10.0"], "26.9.0", "26.11.0"), ["26.8.0", "26.9.0", "26.10.0"]);
    // the release being synced, one already kept, or a commit without a worker adds nothing
    assert.deepEqual(withReleasedWorker(["26.8.0"], "26.9.0", "26.9.0"), ["26.8.0"]);
    assert.deepEqual(withReleasedWorker(["26.8.0"], "26.8.0", "26.9.0"), ["26.8.0"]);
    assert.deepEqual(withReleasedWorker([], null, "26.8.0"), []);
});

test("the lockfile gets the version in both of its own version fields and nowhere else", () => {
    const lock = (own, dependency) => JSON.stringify({ name: "countly-sdk-web", version: own, lockfileVersion: 3, requires: true, packages: { "": { name: "countly-sdk-web", version: own, devDependencies: { a: dependency } }, "node_modules/a": { version: dependency } } }, null, 2) + "\n";
    assert.equal(withLockVersion(lock("1.0.0", "1.0.0"), "2.0.0"), lock("2.0.0", "1.0.0"));
});

test("the bundle gets the banner, 4-space indentation and no source map line", () => {
    const umd = "(function (global, factory) {\n  factory(global.Countly = {});\n})(this, (function (exports) { 'use strict';\n\n  exports.a = 1;\n\n}));\n//# sourceMappingURL=countly_umd.js.map\n";
    assert.equal(toWebBundle(umd, "/* banner */\n"), "/* banner */\n(function (global, factory) {\n    factory(global.Countly = {});\n})(this, (function (exports) {\n    'use strict';\n\n    exports.a = 1;\n\n}));\n");
});

test("references to this repository's layout are found", () => {
    assert.deepEqual(leftovers("import Countly from '../../Countly.js';\nok\nrequire(\"../../modules/Utils.js\")"), ["import Countly from '../../Countly.js';", "require(\"../../modules/Utils.js\")"]);
});

test("the sibling imports of a module are listed", () => {
    assert.deepEqual(moduleImports("import { isBrowser } from \"./Platform.js\";\nimport { a } from './Constants.js';\n"), ["Platform.js", "Constants.js"]);
});
