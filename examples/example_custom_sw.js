/* eslint-disable no-restricted-globals */
/**
 * Example: adding Countly web push to a service worker you already have.
 *
 * Browsers allow one active service worker per scope, so a site that already runs its own worker
 * (a PWA, Workbox, offline caching...) cannot also register countly_sw.js at the same scope. Import
 * Countly's worker into yours instead. Its handlers only touch Countly's own pushes and
 * notifications — anything without Countly's `c.i` message id is left to your code.
 *
 * On the page, hand the SDK your registration so it does not try to register countly_sw.js:
 *
 *   navigator.serviceWorker.register("/sw.js").then(function (registration) {
 *       Countly.init({
 *           app_key: "YOUR_APP_KEY",
 *           url: "https://your.server.ly",
 *           push_vapid_public_key: "YOUR_VAPID_PUBLIC_KEY",
 *           push_service_worker_registration: registration
 *       });
 *   });
 *
 * and call Countly.enable_push_notifications() from a click handler, as usual.
 */

// Optional: keep full control of your worker's install/activate. Without this line Countly's
// import adds skipWaiting() on install and clients.claim() on activate, which most sites want anyway.
self.COUNTLY_PUSH_LIFECYCLE = false;

// Optional, while debugging: log every push, click and close in the worker console and forward the
// lines to the open pages (they show up as "[SW]" in the SDK's console output). Errors and refused
// URLs are logged even without this.
// self.COUNTLY_PUSH_DEBUG = true;

// Pin the version you tested with; a floating tag would change worker behaviour on your users'
// devices without a deploy on your side. The same file ships in the npm package at
// node_modules/countly-sdk-web/lib/countly_sw.js if you prefer to serve it yourself.
importScripts("https://cdn.jsdelivr.net/npm/countly-sdk-web@26.1.3/lib/countly_sw.js");

// ...your own handlers follow. They run alongside Countly's; a `push` without Countly's payload
// or a click on a notification you showed is ignored by the imported handlers.
self.addEventListener("install", function (event) {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
    var payload = event.data ? event.data.json() : {};
    if (payload.c && payload.c.i) {
        return; // Countly's, already handled by the imported worker
    }
    event.waitUntil(self.registration.showNotification(payload.title || "Hello", { body: payload.body || "" }));
});
