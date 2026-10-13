// What changes when a file of this repository goes to countly-sdk-web: there the SDK is the UMD bundle lib/countly.js,
// the worker is lib/countly_sw.js, and Cypress runs without the coverage instrumentation of this repository.
import ts from "typescript";

// what Cypress's default preprocessor resolves in countly-sdk-web, for the SDK modules some tests read directly
export const SDK_MODULES_DIR = "cypress/support/sdk-modules";

const FORMAT_OPTIONS = {
    indentSize: 4,
    tabSize: 4,
    convertTabsToSpaces: true,
    newLineCharacter: "\n",
    indentStyle: ts.IndentStyle.Smart,
    insertSpaceAfterCommaDelimiter: true,
    insertSpaceAfterSemicolonInForStatements: true,
    insertSpaceBeforeAndAfterBinaryOperators: true,
    insertSpaceAfterConstructor: false,
    insertSpaceAfterKeywordsInControlFlowStatements: true,
    insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
    insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
    insertSpaceBeforeFunctionParenthesis: false,
    placeOpenBraceOnNewLineForFunctions: false,
    placeOpenBraceOnNewLineForControlBlocks: false,
    semicolons: ts.SemicolonPreference.Ignore
};

/**
 * Format JavaScript the way VS Code's formatter does, with 4-space indentation.
 * @param {string} text - source
 * @returns {string} formatted source
 */
export function formatJs(text) {
    const fileName = "bundle.js";
    const service = ts.createLanguageService({
        getScriptFileNames: () => [fileName],
        getScriptVersion: () => "1",
        getScriptSnapshot: (name) => (name === fileName ? ts.ScriptSnapshot.fromString(text) : undefined),
        getCurrentDirectory: () => "",
        getCompilationSettings: () => ({ allowJs: true }),
        getDefaultLibFileName: () => "lib.d.ts",
        fileExists: (name) => name === fileName,
        readFile: () => undefined
    });
    const edits = service.getFormattingEditsForDocument(fileName, FORMAT_OPTIONS);
    let result = text;
    for (let i = edits.length - 1; i >= 0; i--) {
        const edit = edits[i];
        result = result.slice(0, edit.span.start) + edit.newText + result.slice(edit.span.start + edit.span.length);
    }
    return result;
}

/**
 * The rollup UMD build as countly-sdk-web's lib/countly.js: its banner, formatted, without the source map line.
 * @param {string} umd - dist/countly_umd.js
 * @param {string} banner - the banner that opens the file
 * @returns {string} the bundle
 */
export function toWebBundle(umd, banner) {
    const code = umd.replace(/\r\n/g, "\n").replace(/\n\/\/# sourceMappingURL=[^\n]*\n?$/, "\n");
    return banner + formatJs(code);
}

/**
 * A Cypress spec or support file as countly-sdk-web runs it.
 * @param {string} text - the file of this repository
 * @param {string} folder - "e2e" for a spec, "support" for a support file
 * @returns {string} the file for countly-sdk-web
 */
export function toWebTest(text, folder) {
    const modulesPath = folder === "support" ? "./sdk-modules/" : "../support/sdk-modules/";
    return text
        .replace(/require\((["'])\.\.\/\.\.\/Countly\.js\1\)/g, "require($1../../lib/countly$1)")
        .replace(/import (["'])\.\.\/\.\.\/Countly\.js\1;/g, "import $1../../lib/countly.js$1;")
        .replace(/(["'])\.\.\/\.\.\/modules\//g, "$1" + modulesPath)
        .replace(/^import ["']@cypress\/code-coverage\/support["'];?\r?\n/m, "")
        .replace(/cy\.readFile\((["'])countly_sw\.js\1\)/g, "cy.readFile($1lib/countly_sw.js$1)")
        .replace(/new Worker\((["'][^"']*test_workers\/[^"']+["']), \{ type: ["']module["'] \}\)/g, "new Worker($1)");
}

/**
 * A fixture page as countly-sdk-web serves it: the SDK as a classic script before the page's module script, which then
 * uses the global Countly instead of importing the SDK's sources.
 * @param {string} html - the fixture of this repository
 * @returns {string} the fixture for countly-sdk-web
 */
export function toWebFixture(html) {
    const importLine = /^[ \t]*import Countly from (["'])\.\.\/\.\.\/Countly\.js\1;[ \t]*\r?\n/m;
    if (!importLine.test(html)) {
        return html;
    }
    return html.replace(importLine, "").replace(/^([ \t]*)<script type=(["'])module\2>/m, "$1<script type='text/javascript' src='../../lib/countly.js'></script>\n$1<script type=$2module$2>");
}

/**
 * A test worker as countly-sdk-web runs it: a classic worker that loads the bundle.
 * @param {string} text - the worker of this repository
 * @returns {string} the worker for countly-sdk-web
 */
export function toWebWorker(text) {
    return text.replace(/^import Countly from (["'])\.\.\/Countly\.js\1;/m, "importScripts($1../lib/countly.js$1);");
}

/**
 * A CHANGELOG split at its "## " headings.
 * @param {string} markdown - a CHANGELOG
 * @returns {Object} preamble, the text before the first heading, and sections, each with its heading and its text
 */
function changelogSections(markdown) {
    const parts = markdown.split(/^(?=## )/m);
    const preamble = parts[0].startsWith("## ") ? "" : parts.shift();
    return { preamble, sections: parts.map((text) => ({ heading: text.split("\n")[0].slice(3).trim(), text })) };
}

/**
 * A CHANGELOG text with countly-sdk-web's list marker.
 * @param {string} markdown - CHANGELOG text of this repository
 * @returns {string} the text with "-" list items
 */
function toWebListMarker(markdown) {
    return markdown.replace(/^([ \t]*)\* /gm, "$1- ");
}

/**
 * What a CHANGELOG section says, apart from its list marker and blank lines.
 * @param {string} text - a section
 * @returns {string} its words
 */
function wording(text) {
    return toWebListMarker(text).replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n").trim();
}

/**
 * countly-sdk-web's CHANGELOG with this repository's sections above the newest release both have in the same words,
 * which replace what countly-sdk-web has above that release. From that release down countly-sdk-web keeps its own
 * history, which goes further back and is worded differently in places.
 * @param {string} markdown - CHANGELOG.md of this repository
 * @param {string} webMarkdown - CHANGELOG.md of countly-sdk-web
 * @returns {Object} text, the CHANGELOG for countly-sdk-web; added, the headings put on top; below, the release they went above
 */
export function toWebChangelog(markdown, webMarkdown) {
    const ours = changelogSections(markdown).sections;
    const theirs = changelogSections(webMarkdown);
    const theirHeadings = theirs.sections.map((section) => section.heading);
    const anchor = ours.findIndex((section) => {
        const at = theirHeadings.indexOf(section.heading);
        return at !== -1 && wording(theirs.sections[at].text) === wording(section.text);
    });
    if (anchor === -1) {
        throw new Error("the CHANGELOGs have no release in the same words, so where this repository's newer sections go in countly-sdk-web's is unclear; bring them in line by hand");
    }
    const newer = ours.slice(0, anchor);
    const theirAnchor = theirHeadings.indexOf(ours[anchor].heading);
    const lacking = theirs.sections.slice(0, theirAnchor).filter((section) => section.heading !== "NEXT RELEASE" && !newer.some((ourSection) => ourSection.heading === section.heading));
    if (lacking.length) {
        throw new Error("countly-sdk-web's CHANGELOG has releases newer than " + ours[anchor].heading + " that this repository's lacks: " + lacking.map((section) => section.heading).join(", ") + "; bring them here first");
    }
    return {
        text: theirs.preamble + newer.map((section) => toWebListMarker(section.text)).join("") + theirs.sections.slice(theirAnchor).map((section) => section.text).join(""),
        added: newer.map((section) => section.heading),
        below: ours[anchor].heading
    };
}

/**
 * A package-lock.json with a new version for the package itself, written the way npm writes it.
 * @param {string} lockText - package-lock.json
 * @param {string} version - the new version
 * @returns {string} the lockfile with the version in its top level and in its root package entry
 */
export function withLockVersion(lockText, version) {
    const lock = JSON.parse(lockText);
    lock.version = version;
    if (lock.packages && lock.packages[""]) {
        lock.packages[""].version = version;
    }
    return JSON.stringify(lock, null, 2) + "\n";
}

/**
 * Order two versions such as "26.8.0" by their numbers.
 * @param {string} a - a version
 * @param {string} b - another version
 * @returns {number} negative when a is the earlier one, positive when b is, 0 when they are the same
 */
function compareVersions(a, b) {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] || 0) !== (y[i] || 0)) {
            return (x[i] || 0) - (y[i] || 0);
        }
    }
    return 0;
}

/**
 * The releases whose service worker the tests run this SDK against, once countly-sdk-web's last
 * commit is known: its worker joins them when it belongs to an earlier release than the one synced.
 * @param {string[]} kept - the versions listed in cypress/fixtures/released_workers.json
 * @param {?string} committedVersion - countly-sdk-web's version in its last commit, null when that commit has no worker
 * @param {string} version - the version being synced
 * @returns {string[]} the versions to keep, oldest first
 */
export function withReleasedWorker(kept, committedVersion, version) {
    if (!committedVersion || committedVersion === version || kept.indexOf(committedVersion) !== -1) {
        return kept;
    }
    return kept.concat(committedVersion).sort(compareVersions);
}

/**
 * References to this repository's layout still left in a file meant for countly-sdk-web.
 * @param {string} text - a rewritten file
 * @returns {string[]} the references found
 */
export function leftovers(text) {
    return Array.from(text.matchAll(/[^\n]*(?:\.\.\/Countly\.js|["']\.\.\/\.\.\/modules\/|@cypress\/code-coverage|type: ["']module["'] \})[^\n]*/g), (m) => m[0].trim());
}

/**
 * The SDK modules a file reads, by file name.
 * @param {string} text - a rewritten file
 * @returns {string[]} module file names, as "Constants.js"
 */
export function sdkModulesUsed(text) {
    return Array.from(text.matchAll(/sdk-modules\/([A-Za-z0-9_]+\.js)/g), (m) => m[1]);
}

/**
 * The sibling modules a module imports, by file name.
 * @param {string} text - a module of modules/
 * @returns {string[]} module file names
 */
export function moduleImports(text) {
    return Array.from(text.matchAll(/from ["']\.\/([A-Za-z0-9_]+\.js)["']/g), (m) => m[1]);
}
