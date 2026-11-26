import { addPreInitFunctions, markPreInit } from "./modules/PreInit.js";

var keepsCalls = typeof window !== "undefined" || (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope);
// the SDK, once loaded, takes over the global Countly object, so this object becomes the SDK itself
var Countly = keepsCalls ? (globalThis.Countly = globalThis.Countly || {}) : {};
var loading = null;

addPreInitFunctions(Countly, keepsCalls);

if (typeof Countly.init !== "function") {
    /**
     * Loads the SDK, then initializes it with the given options; the calls made before it run then, in order. On a
     * server that renders pages it does nothing, as the SDK runs only in a page or a web worker.
     * @param {Object} config - the options of the SDK's init
     */
    Countly.init = markPreInit(function (config) {
        if (!keepsCalls) {
            return;
        }
        loading = loading || import("countly-sdk-web");
        loading.then(function (sdk) {
            (sdk.default || sdk).init(config);
        }, function (error) {
            if (Countly.debug) {
                console.warn("[WARNING] [Countly] init, The SDK could not be loaded, so the calls made before init stay unsent: " + error);
            }
        });
    });
}

export default Countly;
