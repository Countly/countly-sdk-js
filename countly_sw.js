/* eslint-disable no-restricted-globals */
/**
 * Countly reference service worker for web push notifications.
 *
 * Handles the W3C Push API `push` event by displaying a notification, `notificationclick` by
 * opening the target URL and asking one page to record the [CLY]_push_action event,
 * `notificationclose` so the page's push listener hears about dismissals, and
 * `pushsubscriptionchange` so a browser-initiated subscription rotation gets re-registered with
 * the server. On `install`/`activate` it takes control of the open pages right away: without
 * that, the page that registered it is not controlled until it reloads, so its ready/ack messages
 * would go nowhere and an action it recorded would be redelivered — and counted again — after the
 * reload. It also lets a new version of this file replace the old one without waiting for every
 * tab of the site to close.
 *
 * Payload shape (mirrors iOS/Android — see CountlyNotificationService.m and ModulePush.java):
 *   {
 *     "title":   "...",
 *     "message": "...",
 *     "sound":   "...",
 *     "badge":   <int>,
 *     "c": {
 *       "i": "<messageId>",        // 24-char hex ObjectId
 *       "l": "<defaultUrl>",
 *       "m": "<mediaUrl>",         // optional image
 *       "b": [{ "t": "title", "l": "url" }, ...]  // action buttons
 *     },
 *     ...any custom key/values added to the message
 *   }
 * The whole payload is kept as `notification.data.p`, so a click or a close can hand it to the page.
 *
 * Configuration. The page SDK passes its settings in the query string of this file's URL when it
 * registers it (`/countly_sw.js?cly_debug=1`), because a push may wake the worker with no page
 * open to ask. A host worker that imports this file sets the equivalent globals before the
 * importScripts() call:
 *   self.COUNTLY_PUSH_DEBUG = true;             // log every step and forward the lines to the pages
 *   self.COUNTLY_PUSH_LIFECYCLE = false;        // keep the host's own install/activate behaviour
 * A page with debug on also says so in its handshake, which turns debug on until the browser stops
 * the idle worker. Only http(s) URLs are ever opened by a click.
 *
 * Developers who already maintain their own service worker import this file into it —
 * `importScripts("https://cdn.jsdelivr.net/npm/countly-sdk-web@<version>/lib/countly_sw.js")`
 * (pin the version) or a self-hosted copy — and pass their worker's registration to the SDK as
 * `push_service_worker_registration`. Inside a host worker every handler below only acts on
 * Countly's own pushes and notifications (recognised by the `c.i` message id) and leaves
 * everything else to the host.
 *
 * The CLY_* constants mirror pushMessageTypes, pushWorkerParams, pushConstants and SDK_VERSION in
 * modules/Constants.js by hand (a worker cannot import that file); cypress/e2e/web_push_sw.cy.js
 * fails when they drift. The message types are a wire contract between a cached worker and a page
 * SDK of a possibly different version: never rename them.
 */

var CLY_SW_VERSION = "26.1.3";

var CLY_ACTION = "countly_push_action";
var CLY_SUBSCRIPTION_CHANGE = "countly_push_subscription_change";
var CLY_READY = "countly_push_ready";
var CLY_ACK = "countly_push_ack";
var CLY_RECEIVED = "countly_push_received";
var CLY_CLOSED = "countly_push_closed";
var CLY_LOG = "countly_push_log";
var CLY_PARAM_DEBUG = "cly_debug";
var CLY_MAX_ACTIONS = 2; // Countly messages carry at most two buttons
var CLY_MAX_PENDING = 20;

// actions no page has confirmed recording yet. matchAll returns every window on the origin,
// including ones with no Countly SDK on them, so an action is only forgotten once a page
// acknowledges it — otherwise a later page drains it on handshake.
var clyPendingActions = [];

/**
 * Read one parameter from this worker's own URL (the page SDK puts its settings there).
 * @param {string} name - query parameter name
 * @returns {?string} the decoded value, or null when absent or unreadable
 */
function clyUrlParam(name) {
    try {
        return new URL(self.location.href).searchParams.get(name);
    } catch (e) {
        return null;
    }
}

var clyDebug = self.COUNTLY_PUSH_DEBUG === true || clyUrlParam(CLY_PARAM_DEBUG) === "1";

/**
 * Collect the window clients this worker could deliver a push action to.
 * @returns {Promise<WindowClient[]>} open window clients
 */
function clyWindowClients() {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

/**
 * Post the same message to every open page.
 * @param {Object} message - message to post
 * @returns {Promise} settles once posted
 */
function clyBroadcast(message) {
    return clyWindowClients().then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
            clientList[i].postMessage(message);
        }
    });
}

/**
 * Log one line. Errors and warnings always reach the worker console (DevTools → Application →
 * Service Workers → inspect); everything else only with debug on, in which case each line is also
 * forwarded to the open pages so the SDK there prints it next to its own logs. Forwarding is best
 * effort: the browser may stop the worker before the clients are listed.
 * @param {string} level - "debug" | "info" | "warn" | "error"
 * @param {string} message - what happened
 * @returns {undefined}
 */
function clyLog(level, message) {
    var always = level === "error" || level === "warn";
    if (!clyDebug && !always) {
        return;
    }
    if (typeof console !== "undefined" && typeof console[level] === "function") {
        console[level]("[Countly] " + message);
    }
    if (clyDebug) {
        clyBroadcast({ type: CLY_LOG, level: level, message: message }).catch(function () { });
    }
}

/**
 * Decide whether a notification URL may be opened: http(s) only. A `javascript:` or `data:` URL
 * in a message would be an injection vector once handed to clients.openWindow, and the browser is
 * the last place that can refuse it.
 * @param {string} url - URL from the message
 * @returns {boolean} true when it may be opened
 */
function clyMayOpen(url) {
    var parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        clyLog("warn", "not opening malformed url [" + url + "]");
        return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        clyLog("warn", "not opening non-http(s) url [" + url + "]");
        return false;
    }
    return true;
}

/**
 * Choose the single client that should record a push action: the one already on the target URL
 * (it is the one about to be focused), else a focused one, else the first available.
 * @param {WindowClient[]} clientList - open window clients
 * @param {string} url - the URL this click is heading to
 * @returns {?WindowClient} the client to hand the action to
 */
function clyPickActionTarget(clientList, url) {
    var i;
    if (url) {
        for (i = 0; i < clientList.length; i++) {
            if (clientList[i].url === url) {
                return clientList[i];
            }
        }
    }
    for (i = 0; i < clientList.length; i++) {
        if (clientList[i].focused) {
            return clientList[i];
        }
    }
    return clientList[0] || null;
}

/**
 * Hold on to an action until a page acknowledges having recorded it.
 * @param {Object} actionMessage - the action to remember
 * @returns {undefined}
 */
function clyRemember(actionMessage) {
    clyPendingActions.push(actionMessage);
    if (clyPendingActions.length > CLY_MAX_PENDING) {
        clyPendingActions.shift();
    }
}

/**
 * The fields the page's push listener gets for every event about a notification.
 * @param {Notification|Object} notification - the notification, or an object with its title/body/data
 * @returns {Object} messageId, title, message, url, buttons, payload
 */
function clyDescribe(notification) {
    var data = notification.data || {};
    var buttons = Array.isArray(data.b) ? data.b : [];
    return {
        messageId: data.i || "",
        title: notification.title || "",
        message: notification.body || "",
        url: data.l || "",
        buttons: buttons.map(function (btn) {
            return { title: btn.t || "", url: btn.l || "" };
        }),
        payload: data.p || null
    };
}

if (self.COUNTLY_PUSH_LIFECYCLE !== false) {
    self.addEventListener("install", function (event) {
        event.waitUntil(self.skipWaiting());
    });

    self.addEventListener("activate", function (event) {
        event.waitUntil(self.clients.claim());
    });
}

/**
 * One line per activation, so a support case can tell which worker a site actually runs.
 */
self.addEventListener("activate", function () {
    console.info("[Countly] push service worker " + CLY_SW_VERSION + " active");
    clyLog("debug", "debug logging on");
});

/**
 * Show the notification for a Countly push and tell the open pages it arrived. A push without
 * Countly's message id is the host application's own and is left to its handlers. A rejected
 * showNotification() is logged rather than failing the event.
 */
self.addEventListener("push", function (event) {
    var payload = {};
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            try {
                payload = { message: event.data.text() };
            } catch (e2) {
                payload = {};
            }
        }
    }

    var countly = payload.c;
    if (!countly || !countly.i) {
        clyLog("debug", "push without a Countly message id, leaving it to the host worker");
        return;
    }
    clyLog("debug", "push received for message [" + countly.i + "]");
    var buttons = Array.isArray(countly.b) ? countly.b : [];
    var options = {
        body: payload.message || "",
        data: {
            i: countly.i,
            l: countly.l || "",
            b: buttons,
            p: payload
        }
    };
    // Notification.badge expects an icon URL, so payload.badge (an integer app badge
    // count for the mobile SDKs) deliberately has no equivalent here.
    if (payload.icon) {
        options.icon = payload.icon;
    }
    if (countly.m) {
        options.image = countly.m;
    }
    if (buttons.length > 0) {
        options.actions = buttons.slice(0, CLY_MAX_ACTIONS).map(function (btn, i) {
            return { action: "btn_" + (i + 1), title: btn.t || "" };
        });
    }

    var title = payload.title || "";
    var received = clyDescribe({ title: title, body: options.body, data: options.data });
    received.type = CLY_RECEIVED;

    event.waitUntil(Promise.all([
        self.registration.showNotification(title, options).then(function () {
            clyLog("debug", "notification shown for message [" + countly.i + "]");
        }, function (err) {
            clyLog("error", "showNotification failed for message [" + countly.i + "]: " + (err && err.message ? err.message : err));
        }),
        clyBroadcast(received)
    ]));
});

/**
 * Hand the click to one page for recording, then focus or open the target URL. A URL that
 * clyMayOpen refuses is not opened, but the click is still recorded. Notifications without
 * Countly's message id were shown by another handler in this worker and are left alone.
 */
self.addEventListener("notificationclick", function (event) {
    var data = event.notification.data;
    if (!data || !data.i) {
        return;
    }
    event.notification.close();

    var buttons = Array.isArray(data.b) ? data.b : [];
    var buttonIndex = 0;
    var buttonTitle = "";
    var url = data.l || "";

    if (event.action && event.action.indexOf("btn_") === 0) {
        // "btn_1" is the first button, so index 0 of the payload's button list
        var idx = parseInt(event.action.slice(4), 10);
        var button = buttons[idx - 1];
        if (button) {
            buttonIndex = idx;
            buttonTitle = button.t || "";
            url = button.l || url;
        }
    }
    clyLog("debug", "notification clicked for message [" + data.i + "], button " + buttonIndex + (url ? ", url [" + url + "]" : ""));

    var actionMessage = clyDescribe(event.notification);
    actionMessage.type = CLY_ACTION;
    actionMessage.buttonIndex = buttonIndex;
    actionMessage.buttonTitle = buttonTitle;
    actionMessage.url = url;
    // lets a page drop the message if it also received it through the pending queue
    actionMessage.aid = data.i + "_" + buttonIndex + "_" + Date.now();

    var openUrl = url && clyMayOpen(url) ? url : "";

    event.waitUntil(
        clyWindowClients().then(function (clientList) {
            // Exactly one page may record the action. Broadcasting it would make every open tab
            // report the same click and inflate the campaign's actioned count.
            var target = clyPickActionTarget(clientList, openUrl);
            clyRemember(actionMessage);
            if (target) {
                target.postMessage(actionMessage);
                clyLog("debug", "action handed to page [" + target.url + "], waiting for its acknowledgement");
            }
            else {
                clyLog("debug", "no page open, keeping the action for the next page that announces itself");
            }

            if (!openUrl) {
                return;
            }
            if (target && target.url === openUrl && "focus" in target) {
                return target.focus();
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(openUrl);
            }
        })
    );
});

self.addEventListener("notificationclose", function (event) {
    var data = event.notification && event.notification.data;
    if (!data || !data.i) {
        return;
    }
    clyLog("debug", "notification closed for message [" + data.i + "]");
    var closed = clyDescribe(event.notification);
    closed.type = CLY_CLOSED;
    event.waitUntil(clyBroadcast(closed));
});

/**
 * Page-to-worker messages: an acknowledgement forgets a pending action; a ready handshake hands
 * the page every pending action and, when the page runs with debug on, turns debug on here too
 * (the only way a host worker that imported this file learns it).
 */
self.addEventListener("message", function (event) {
    var data = event.data;
    if (!data) {
        return;
    }
    if (data.type === CLY_ACK) {
        // a page recorded it, so it no longer needs redelivering
        clyPendingActions = clyPendingActions.filter(function (pending) {
            return pending.aid !== data.aid;
        });
        clyLog("debug", "action [" + data.aid + "] acknowledged");
        return;
    }
    if (data.type !== CLY_READY || !event.source) {
        return;
    }
    if (data.debug === true && !clyDebug) {
        clyDebug = true;
        clyLog("debug", "debug logging turned on by a page");
    }
    clyLog("debug", "page announced itself, " + clyPendingActions.length + " pending action(s)");
    // Left in place until acknowledged: only the pages that run the SDK reply, so a window that
    // cannot record the action does not consume it. The page drops duplicates by `aid`.
    for (var i = 0; i < clyPendingActions.length; i++) {
        event.source.postMessage(clyPendingActions[i]);
    }
});

/**
 * Chrome (138+) fires this with neither subscription attached; a subscribe() without the
 * application server key is a guaranteed rejection, so that case is left to the pages, which know
 * the configured key and re-register on the subscription change message.
 */
self.addEventListener("pushsubscriptionchange", function (event) {
    // The browser dropped the old subscription. Re-subscribe with the same application
    // server key and let the pages know so they queue a fresh token_session.
    var oldSubscription = event.oldSubscription || {};
    var applicationServerKey = (oldSubscription.options && oldSubscription.options.applicationServerKey) || null;
    var resubscribed;
    if (event.newSubscription) {
        clyLog("debug", "subscription rotated by the browser, new subscription attached");
        resubscribed = Promise.resolve(event.newSubscription);
    }
    else if (applicationServerKey) {
        clyLog("debug", "subscription dropped by the browser, re-subscribing with the previous key");
        resubscribed = self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
    }
    else {
        clyLog("debug", "subscription dropped by the browser without a key, leaving the re-subscribe to the pages");
        resubscribed = Promise.resolve(null);
    }

    event.waitUntil(
        resubscribed.catch(function (err) {
            clyLog("error", "re-subscribe failed: " + (err && err.message ? err.message : err));
            return null;
        }).then(function () {
            return clyBroadcast({ type: CLY_SUBSCRIPTION_CHANGE });
        })
    );
});
