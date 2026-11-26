import { preInitCallLimit, preInitQueuedFunctions, preInitValueFunctions } from "./Constants.js";

/**
 * Marks a function as a stand-in that init replaces, so that a queued call never runs it a second time
 * @param {Function} fn - the stand-in
 * @returns {Function} fn
 */
function markPreInit(fn) {
    Object.defineProperty(fn, "clyPreInit", { value: true });
    return fn;
}

/**
 * The counts of the calls made before init: kept and ignored ones. They are kept on the Countly object itself, so that
 * the loader and the SDK, which can be built apart, share them.
 * @param {Object} countly - the Countly object
 * @returns {Object} kept and ignored counts
 */
function preInitCalls(countly) {
    if (!countly.clyPreInitCalls) {
        Object.defineProperty(countly, "clyPreInitCalls", { value: { kept: 0, ignored: 0 } });
    }
    return countly.clyPreInitCalls;
}

/**
 * Gives the Countly object the SDK's public functions before init, which replaces them with the SDK's own. A function
 * that returns a value returns the one it has before init. A call to any other one waits in Countly.q and runs after
 * init, in order, as browser SDKs keep calls made before init, up to preInitCallLimit of them; each keeps the time it
 * was made, which the events it records carry. Where neither a page nor a web worker runs the SDK, as on a server that
 * renders pages, the SDK is never initialized, so such a call is ignored.
 * Functions that are already there, such as those of the quick async loader, are kept.
 * @param {Object} countly - the Countly object, the SDK's or the one the loader makes
 * @param {boolean} keepsCalls - whether calls wait for init, as they do in a page or a web worker
 */
function addPreInitFunctions(countly, keepsCalls) {
    var counts = preInitCalls(countly);
    countly.q = countly.q || [];
    preInitQueuedFunctions.forEach(function (path) {
        var parts = path.split(".");
        var name = parts.pop();
        var group = parts[0];
        var owner = countly;
        if (group) {
            owner = countly[group] = countly[group] || {};
        }
        if (typeof owner[name] === "function") {
            return;
        }
        owner[name] = markPreInit(function () {
            if (!keepsCalls) {
                if (countly.debug) {
                    console.warn("[WARNING] [Countly] " + path + ", The SDK is not initialized, so this call is ignored");
                }
                return;
            }
            if (counts.kept >= preInitCallLimit) {
                counts.ignored++;
                if (countly.debug) {
                    console.warn("[WARNING] [Countly] " + path + ", " + preInitCallLimit + " calls made before init are waiting already, so this call is ignored");
                }
                return;
            }
            counts.kept++;
            var args = Array.prototype.slice.call(arguments);
            var call = function () {
                var target = group ? countly[group] : countly;
                var fn = target && target[name];
                if (typeof fn === "function" && !fn.clyPreInit) {
                    fn.apply(target, args);
                }
            };
            call.clyCalledAt = Date.now();
            call.clyName = path;
            countly.q.push(call);
        });
    });
    Object.keys(preInitValueFunctions).forEach(function (path) {
        var parts = path.split(".");
        var name = parts.pop();
        var owner = countly;
        if (parts[0]) {
            owner = countly[parts[0]] = countly[parts[0]] || {};
        }
        if (typeof owner[name] !== "function") {
            owner[name] = markPreInit(function () {
                return preInitValueFunctions[path];
            });
        }
    });
}

export { addPreInitFunctions, markPreInit, preInitCalls };
