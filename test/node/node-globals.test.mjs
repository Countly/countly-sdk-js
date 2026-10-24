// The SDK's use of Node's globals. Browser bundlers can replace a bare Buffer or process with npm packages (Parcel does,
// with buffer and process), which a site would then have to install, so the bundles reach them through globalThis. The
// base64 fallback for runtimes without atob still finds Node's Buffer that way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NODE_GLOBALS = ["Buffer", "process"];

/**
 * The places where a script uses one of the given names as a variable rather than as a property name.
 * @param {string} file - the script
 * @param {string[]} names - the variable names
 * @returns {string[]} "line: name" for each use
 */
function variableUses(file, names) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const uses = [];
    const visit = (node) => {
        if (ts.isIdentifier(node) && names.indexOf(node.text) !== -1) {
            const parent = node.parent;
            const isPropertyName = (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node;
            if (!isPropertyName) {
                uses.push((source.getLineAndCharacterOfPosition(node.getStart()).line + 1) + ": " + node.text);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return uses;
}

for (const bundle of ["countly_umd.js", "countly_cjs.js", "countly_esm.js"]) {
    test("dist/" + bundle + " reaches Buffer and process only through globalThis", () => {
        assert.deepEqual(variableUses(join(root, "dist", bundle), NODE_GLOBALS), []);
    });
}

test("without atob, base64 is decoded with Node's Buffer, and without either it throws", async () => {
    const { base64ToBytes } = await import(pathToFileURL(join(root, "modules", "Utils.js")).href);
    const nodeAtob = globalThis.atob;
    const NodeBuffer = globalThis.Buffer;
    try {
        globalThis.atob = undefined;
        assert.deepEqual(Array.from(base64ToBytes("aGk=")), [104, 105]);
        globalThis.Buffer = undefined;
        assert.throws(() => base64ToBytes("aGk="), /No base64 decoder in this runtime/);
    }
    finally {
        globalThis.atob = nodeAtob;
        globalThis.Buffer = NodeBuffer;
    }
});
