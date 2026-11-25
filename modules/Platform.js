const isBrowser = typeof window !== "undefined";
let Countly = globalThis.Countly || {};
// one Countly per page or worker, as with the script tag, so that countly-sdk-web/loader finds the SDK an app imported first
if (isBrowser || (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope)) {
    globalThis.Countly = Countly;
}
export { isBrowser, Countly };
