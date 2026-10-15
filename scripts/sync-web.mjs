// Brings countly-sdk-web up to date with this repository: builds the SDK and writes the web repository's bundle,
// minified bundle, service worker, TypeScript definitions, quick async loader, Cypress tests, the newer CHANGELOG
// sections and the version.
// The service worker of the release the web repository last committed is kept here as a test fixture.
// Nothing is committed: review and commit the changes in the web repository. Examples that differ are only listed.
// Usage: npm run sync:web -- [path to countly-sdk-web] [--closure <closure-compiler jar>] [--test]
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SDK_MODULES_DIR, leftovers, moduleImports, sdkModulesUsed, toWebBundle, toWebChangelog, toWebFixture, toWebTest, toWebWorker, withLockVersion, withReleasedWorker } from "./sync-web/rewrite.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLOSURE_JAR = "closure-compiler-v20200719.jar";
const LOADER = join("examples", "quick_loader", "quick_async_loader.js");
const LOADER_MIN = join("examples", "quick_loader", "quick_async_loader.min.js");

/**
 * Stop with a message.
 * @param {string} message - what went wrong
 */
function fail(message) {
    console.error("sync:web, " + message);
    process.exit(1);
}

/**
 * Read a text file with Unix line endings.
 * @param {string} file - path
 * @returns {string} content
 */
function read(file) {
    return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Write a file, creating its folder.
 * @param {string} file - path
 * @param {string} content - content
 */
function write(file, content) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
}

/**
 * Run a command, stopping when it fails.
 * @param {string} command - program
 * @param {string[]} args - arguments
 * @param {string} cwd - folder to run it in
 * @param {Object} [options] - quiet: show only the last line of its output; shell: run through the shell (npm, npx)
 * @returns {string} its output when quiet
 */
function run(command, args, cwd, options) {
    const o = options || {};
    const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: !!o.shell, stdio: o.quiet ? "pipe" : "inherit" });
    const output = ((result.stdout || "") + (result.stderr || "")).trimEnd();
    if (result.error || result.status !== 0) {
        fail(command + " " + args.join(" ") + " failed" + (o.quiet ? ":\n" + output : "") + (result.error ? " (" + result.error.message + ")" : ""));
    }
    return output;
}

/**
 * Parse the command line.
 * @returns {Object} web, closure and test
 */
function options() {
    const parsed = { web: join(root, "..", "countly-sdk-web"), closure: null, test: false };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--closure") {
            parsed.closure = resolve(args[++i] || "");
        }
        else if (args[i] === "--test") {
            parsed.test = true;
        }
        else {
            parsed.web = resolve(args[i]);
        }
    }
    parsed.closure = parsed.closure || join(parsed.web, CLOSURE_JAR);
    return parsed;
}

/**
 * The version this repository is at, after checking that the SDK, the worker and package.json agree on it.
 * @returns {string} version
 */
function version() {
    const packageVersion = JSON.parse(read(join(root, "package.json"))).version;
    const sdkVersion = (read(join(root, "modules", "Constants.js")).match(/SDK_VERSION = "([^"]+)"/) || [])[1];
    const workerVersion = (read(join(root, "countly_sw.js")).match(/CLY_SW_VERSION = "([^"]+)"/) || [])[1];
    if (sdkVersion !== packageVersion || workerVersion !== packageVersion) {
        fail("versions differ: package.json " + packageVersion + ", SDK_VERSION " + sdkVersion + ", CLY_SW_VERSION " + workerVersion);
    }
    return packageVersion;
}

/**
 * Minify a file with the Closure Compiler the way countly-sdk-web's releases are minified.
 * @param {string} jar - Closure Compiler jar
 * @param {string} cwd - folder the paths are relative to
 * @param {string} input - file to minify
 * @param {string} output - minified file
 * @returns {string} the compiler's summary line
 */
function minify(jar, cwd, input, output) {
    const said = run("java", ["-jar", jar, "--js=" + input, "--js_output_file=" + output, "--language_in=ECMASCRIPT5", "--language_out=ECMASCRIPT5"], cwd, { quiet: true });
    return said ? said.split("\n").pop() : "no warnings";
}

/**
 * Check in a separate Node process that a bundle loads, starts and reports this version.
 * @param {string} file - bundle
 * @param {string} expected - version
 */
function checkBundle(file, expected) {
    const script = "const m = require(" + JSON.stringify(file) + "); const C = m.default || m; C.init({ app_key: \"sync-check\", url: \"https://sync-check.example\" }); console.log(C.sdk_version()); process.exit(0);";
    const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
    const said = (result.stdout || "").trim().split("\n").pop();
    if (result.status !== 0 || said !== expected) {
        fail(relative(root, file) + " does not load and report " + expected + ":\n" + (result.stderr || result.stdout));
    }
}

/**
 * Keep the service worker countly-sdk-web last committed, when it belongs to an earlier release, as a fixture
 * the tests run this SDK against: sites keep serving their own copy of the worker across SDK upgrades.
 * @param {string} web - countly-sdk-web
 * @param {string} version - the version being synced
 * @returns {?string} the release whose worker was kept, if any
 */
function keepReleasedWorker(web, version) {
    const committed = (path) => {
        const result = spawnSync("git", ["show", "HEAD:" + path], { cwd: web, encoding: "utf8" });
        return result.status === 0 ? result.stdout : null;
    };
    const worker = committed("lib/countly_sw.js");
    const committedVersion = worker === null ? null : JSON.parse(committed("package.json")).version;
    const listFile = join(root, "cypress", "fixtures", "released_workers.json");
    const kept = JSON.parse(read(listFile));
    const updated = withReleasedWorker(kept, committedVersion, version);
    if (updated === kept) {
        return null;
    }
    write(join(root, "cypress", "fixtures", "countly_sw-" + committedVersion + ".js"), worker);
    write(listFile, JSON.stringify(updated) + "\n");
    return committedVersion;
}

/**
 * countly-sdk-web's CHANGELOG with the newer sections of this repository's, stopping when the two cannot be merged.
 * @param {string} web - countly-sdk-web
 * @returns {Object} text, added and below, as toWebChangelog gives them
 */
function changelogForWeb(web) {
    try {
        return toWebChangelog(read(join(root, "CHANGELOG.md")), read(join(web, "CHANGELOG.md")));
    }
    catch (error) {
        return fail(error.message);
    }
}

/**
 * Files of a folder, without subfolders.
 * @param {string} dir - folder
 * @returns {string[]} file names
 */
function files(dir) {
    return existsSync(dir) ? readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile()) : [];
}

/**
 * Copy the Cypress tests, their support files, fixtures, test workers and the SDK modules they read, rewritten for the
 * web repository, and remove the specs this repository no longer has.
 * @param {string} web - countly-sdk-web
 * @returns {Object} what was written
 */
function syncTests(web) {
    const written = {};
    const specs = files(join(root, "cypress", "e2e")).filter((name) => name.endsWith(".cy.js"));
    const removed = files(join(web, "cypress", "e2e")).filter((name) => name.endsWith(".cy.js") && specs.indexOf(name) === -1);
    removed.forEach((name) => rmSync(join(web, "cypress", "e2e", name)));
    const rewritten = [];
    specs.forEach((name) => rewritten.push([join("cypress", "e2e", name), toWebTest(read(join(root, "cypress", "e2e", name)), "e2e")]));
    files(join(root, "cypress", "support")).filter((name) => name.endsWith(".js")).forEach((name) => rewritten.push([join("cypress", "support", name), toWebTest(read(join(root, "cypress", "support", name)), "support")]));
    const fixtures = files(join(root, "cypress", "fixtures"));
    fixtures.filter((name) => name.endsWith(".html")).forEach((name) => rewritten.push([join("cypress", "fixtures", name), toWebFixture(read(join(root, "cypress", "fixtures", name)))]));
    files(join(root, "test_workers")).filter((name) => name.endsWith(".js")).forEach((name) => rewritten.push([join("test_workers", name), toWebWorker(read(join(root, "test_workers", name)))]));

    const left = [];
    rewritten.forEach(([file, text]) => leftovers(text).forEach((line) => left.push(file + ": " + line)));
    if (left.length) {
        fail("these lines still point at this repository's layout, teach scripts/sync-web/rewrite.mjs to rewrite them:\n" + left.join("\n"));
    }
    rewritten.forEach(([file, text]) => write(join(web, file), text));
    fixtures.filter((name) => !name.endsWith(".html")).forEach((name) => copyFileSync(join(root, "cypress", "fixtures", name), join(web, "cypress", "fixtures", name)));

    // the SDK modules the tests read, with the sibling modules those import
    const modules = [];
    const add = (name) => {
        if (modules.indexOf(name) === -1) {
            modules.push(name);
            moduleImports(read(join(root, "modules", name))).forEach(add);
        }
    };
    rewritten.forEach(([, text]) => sdkModulesUsed(text).forEach(add));
    rmSync(join(web, SDK_MODULES_DIR), { recursive: true, force: true });
    modules.forEach((name) => write(join(web, SDK_MODULES_DIR, name), read(join(root, "modules", name))));

    written.specs = specs.length;
    written.removedSpecs = removed;
    written.files = rewritten.length;
    written.modules = modules.sort();
    return written;
}

/**
 * The example files that differ between the two repositories, as relative paths.
 * @param {string} web - countly-sdk-web
 * @returns {Object} onlyHere, onlyInWeb and different
 */
function exampleDifferences(web) {
    const list = (dir, prefix) => (existsSync(dir) ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (name === "node_modules") {
            return [];
        }
        return statSync(path).isDirectory() ? list(path, prefix + name + "/") : [prefix + name];
    }) : []);
    const here = list(join(root, "examples"), "");
    const there = list(join(web, "examples"), "");
    return {
        onlyHere: here.filter((name) => there.indexOf(name) === -1),
        onlyInWeb: there.filter((name) => here.indexOf(name) === -1),
        different: here.filter((name) => there.indexOf(name) !== -1 && read(join(root, "examples", name)) !== read(join(web, "examples", name)))
    };
}

const opts = options();
const web = opts.web;
if (!existsSync(join(web, "package.json")) || JSON.parse(read(join(web, "package.json"))).name !== "countly-sdk-web") {
    fail("no countly-sdk-web repository at " + web + "; pass its path as the first argument");
}
if (!existsSync(opts.closure)) {
    fail("no Closure Compiler at " + opts.closure + "; pass --closure <path to " + CLOSURE_JAR + ">");
}
run("java", ["-version"], root, { quiet: true });
const sdkVersion = version();
const changelog = changelogForWeb(web);

console.log("sync:web, building " + sdkVersion);
run("npm", ["run", "build"], root, { shell: true, quiet: true });

write(join(web, "lib", "countly.js"), toWebBundle(read(join(root, "dist", "countly_umd.js")), read(join(root, "scripts", "sync-web", "banner.txt"))));
console.log("sync:web, lib/countly.min.js: " + minify(opts.closure, web, "lib/countly.js", "lib/countly.min.js"));
copyFileSync(join(root, "countly_sw.js"), join(web, "lib", "countly_sw.js"));
copyFileSync(join(root, "types", "countly-sdk-web.d.ts"), join(web, "lib", "countly.d.ts"));
checkBundle(join(web, "lib", "countly.js"), sdkVersion);
checkBundle(join(web, "lib", "countly.min.js"), sdkVersion);

console.log("sync:web, " + LOADER_MIN.split("\\").join("/") + ": " + minify(opts.closure, root, LOADER.split("\\").join("/"), LOADER_MIN.split("\\").join("/")));
copyFileSync(join(root, LOADER), join(web, LOADER));
copyFileSync(join(root, LOADER_MIN), join(web, LOADER_MIN));

const keptWorker = keepReleasedWorker(web, sdkVersion);
const tests = syncTests(web);
write(join(web, "CHANGELOG.md"), changelog.text);
const webPackage = read(join(web, "package.json"));
write(join(web, "package.json"), webPackage.replace(/"version": "[^"]+"/, "\"version\": \"" + sdkVersion + "\""));
write(join(web, "package-lock.json"), withLockVersion(read(join(web, "package-lock.json")), sdkVersion));

console.log("sync:web, " + tests.specs + " specs, " + tests.files + " test files, SDK modules for tests: " + tests.modules.join(", ") + (tests.removedSpecs.length ? ", removed specs: " + tests.removedSpecs.join(", ") : ""));
if (keptWorker) {
    console.log("sync:web, kept the service worker of release " + keptWorker + " in cypress/fixtures of this repository for the compatibility tests");
}
console.log("sync:web, CHANGELOG.md: " + (changelog.added.length ? changelog.added.join(", ") + " above " + changelog.below : "up to date, newest section " + changelog.below));
const examples = exampleDifferences(web);
if (examples.onlyHere.length || examples.onlyInWeb.length || examples.different.length) {
    console.log("sync:web, examples are not copied; decide on these by hand:");
    examples.onlyHere.forEach((name) => console.log("  only here:   examples/" + name));
    examples.onlyInWeb.forEach((name) => console.log("  only in web: examples/" + name));
    examples.different.forEach((name) => console.log("  different:   examples/" + name));
}
console.log("sync:web, changes in " + basename(web) + ":");
console.log(run("git", ["status", "--short"], web, { quiet: true }) || "  none");
if (opts.test) {
    console.log("sync:web, running countly-sdk-web's Cypress tests");
    run("npx", ["cypress", "run"], web, { shell: true });
}
