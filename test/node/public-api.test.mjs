// The SDK's public functions, its TypeScript definitions (types/countly-sdk-web.d.ts, shipped as countly-sdk-web's
// lib/countly.d.ts) and the stubs of the quick async loader must agree: a public function missing from either, or a
// name either still has after the SDK dropped it, fails here. Left-out functions are listed with the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const typesPath = join(root, "types", "countly-sdk-web.d.ts");
const loaderPath = join(root, "examples", "quick_loader", "quick_async_loader.js");

const DEPRECATED = ["enableRatingWidgets", "enable_feedback", "initializeRatingWidgets", "initialize_feedback_popups", "presentRatingWidgetWithID", "show_feedback_popup", "report_conversion", "report_feedback"];
const INTERNAL = ["halt", "test_mode_rq", "remove_consent_internal", "serialize", "deserialize"];
// public functions the definitions leave out on purpose
const UNTYPED = DEPRECATED.concat(INTERNAL);
// public functions the quick loader does not stub
const NOT_QUEUED = [
    // the loader sets it up itself
    "init",
    // a queued call cannot give back what these return
    "check_consent", "check_any_consent", "get_device_id", "get_device_id_type", "get_remote_config", "sdk_name", "sdk_version", "cancel_event",
    // functions the SDK calls, which a site sets rather than calls
    "getViewName", "getViewUrl", "getSearchQuery"
].concat(DEPRECATED, INTERNAL);
// methods a plugin adds, stubbed by the loader too
const FROM_PLUGINS = ["track_performance"];

/**
 * The public functions of an initialized SDK, nested ones as "object.function".
 * @returns {Promise<string[]>} names
 */
async function publicFunctions() {
    const Countly = (await import(pathToFileURL(join(root, "Countly.js")).href)).default;
    Countly.init({ app_key: "api-surface", url: "https://api-surface.example" });
    const names = [];
    for (const key of Object.keys(Countly)) {
        const value = Countly[key];
        if (key.charAt(0) === "_" || key === "CountlyClass" || key === "i") {
            continue;
        }
        if (typeof value === "function") {
            names.push(key);
        }
        else if (value && typeof value === "object" && !Array.isArray(value)) {
            Object.keys(value).filter((inner) => typeof value[inner] === "function").forEach((inner) => names.push(key + "." + inner));
        }
    }
    Countly.halt();
    return names.sort();
}

/**
 * The functions the definitions declare in namespace Countly, nested ones as "object.function", whether declared in a
 * namespace or as a const of an interface type.
 * @returns {string[]} names
 */
function declaredFunctions() {
    const file = ts.createSourceFile(typesPath, readFileSync(typesPath, "utf8"), ts.ScriptTarget.Latest, true);
    let countly = null;
    const findCountly = (node) => {
        if (ts.isModuleDeclaration(node) && node.name.text === "Countly") {
            countly = node;
            return;
        }
        ts.forEachChild(node, findCountly);
    };
    findCountly(file);
    assert.ok(countly, "namespace Countly in " + typesPath);
    const names = [];
    const interfaces = {};
    const typedConsts = [];
    countly.body.statements.forEach((statement) => {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
            names.push(statement.name.text);
        }
        else if (ts.isModuleDeclaration(statement) && statement.body) {
            statement.body.statements.filter((inner) => ts.isFunctionDeclaration(inner) && inner.name).forEach((inner) => names.push(statement.name.text + "." + inner.name.text));
        }
        else if (ts.isInterfaceDeclaration(statement)) {
            interfaces[statement.name.text] = statement.members.filter((member) => ts.isMethodSignature(member) && member.name).map((member) => member.name.getText());
        }
        else if (ts.isVariableStatement(statement)) {
            statement.declarationList.declarations.filter((d) => d.type && ts.isTypeReferenceNode(d.type)).forEach((d) => typedConsts.push([d.name.getText(), d.type.typeName.getText()]));
        }
    });
    typedConsts.forEach(([name, type]) => (interfaces[type] || []).forEach((method) => names.push(name + "." + method)));
    return Array.from(new Set(names)).sort();
}

/**
 * The method names the quick async loader stubs.
 * @returns {string[]} names
 */
function loaderStubs() {
    const text = readFileSync(loaderPath, "utf8");
    const start = text.indexOf("var methods = [");
    assert.notEqual(start, -1, "the loader's methods list");
    const list = text.slice(start, text.indexOf("];", start));
    return Array.from(list.matchAll(/"([^"]+)"/g), (m) => m[1]).sort();
}

/**
 * The object and method name a loader stub name, such as "userData.set", points at.
 * @param {Object} countly - Countly as a page sees it
 * @param {string} name - stub name
 * @returns {Array} the object holding the method, and the method name
 */
function stubTarget(countly, name) {
    const parts = name.split(".");
    if (parts.length === 1) {
        return [countly, name];
    }
    countly[parts[0]] = countly[parts[0]] || {};
    return [countly[parts[0]], parts[1]];
}

/**
 * The quick async loader run on a stand-in page.
 * @returns {Object} Countly, as the page sees it before the SDK loads; load, which puts a stand-in SDK in its place,
 * finishes loading the script the loader added and gives back the calls the stand-in SDK got
 */
function runLoader() {
    const scripts = [];
    const window = {};
    const firstScript = { parentNode: { insertBefore: (script) => scripts.push(script) } };
    const document = { createElement: () => ({}), getElementsByTagName: () => [firstScript] };
    vm.runInNewContext(readFileSync(loaderPath, "utf8"), { window, document, console });
    return {
        Countly: window.Countly,
        load: () => {
            const calls = [];
            const sdk = { init: (config) => calls.push(["init", config]) };
            loaderStubs().forEach((name) => {
                const [target, method] = stubTarget(sdk, name);
                target[method] = (...args) => calls.push([name].concat(args));
            });
            window.Countly = sdk;
            scripts[0].onload();
            return calls;
        }
    };
}

const minus = (a, b) => a.filter((name) => b.indexOf(name) === -1);

test("the definitions compile", () => {
    const program = ts.createProgram([typesPath], { noEmit: true, strict: true, lib: ["lib.es2020.d.ts", "lib.dom.d.ts"], types: [] });
    const problems = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    assert.deepEqual(problems, []);
});

test("every function the definitions declare is one of the SDK", async() => {
    assert.deepEqual(minus(declaredFunctions(), await publicFunctions()), []);
});

test("every public function of the SDK is in the definitions, or left out on purpose", async() => {
    const sdk = await publicFunctions();
    assert.deepEqual(minus(minus(sdk, declaredFunctions()), UNTYPED), [], "add these to " + typesPath + ", or to UNTYPED with the reason");
    assert.deepEqual(minus(UNTYPED, sdk), [], "listed in UNTYPED, but no longer in the SDK");
});

test("every name the quick loader stubs is a function of the SDK or of a plugin", async() => {
    assert.deepEqual(minus(minus(loaderStubs(), await publicFunctions()), FROM_PLUGINS), []);
});

test("a call to any method the quick loader stubs is made on the SDK once it loads, after init and in order", () => {
    const page = runLoader();
    const stubs = loaderStubs();
    stubs.forEach((name, index) => {
        const [target, method] = stubTarget(page.Countly, name);
        target[method]("argument " + index);
    });
    const config = { app_key: "loader", url: "https://loader.example", sdk_url: "countly.js" };
    page.Countly.init(config);
    assert.deepEqual(page.load(), [["init", config]].concat(stubs.map((name, index) => [name, "argument " + index])));
});

test("every public function a site can queue is stubbed by the quick loader, or left out on purpose", async() => {
    const sdk = await publicFunctions();
    assert.deepEqual(minus(minus(sdk, loaderStubs()), NOT_QUEUED), [], "add these to " + loaderPath + ", or to NOT_QUEUED with the reason");
    assert.deepEqual(minus(NOT_QUEUED, sdk), [], "listed in NOT_QUEUED, but no longer in the SDK");
});
