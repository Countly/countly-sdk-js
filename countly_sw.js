/* eslint-disable no-restricted-globals */
/**
 * Countly reference service worker for web push notifications.
 *
 * Handles the W3C Push API `push` event by displaying a notification, the
 * `notificationclick` event by opening the target URL and asking a page to record
 * the [CLY]_push_action event, and `pushsubscriptionchange` so a browser-initiated
 * subscription rotation gets re-registered with the server. On `install` and
 * `activate` it takes control of the open pages right away (see below).
 *
 * Payload shape (mirrors iOS/Android — see CountlyNotificationService.m and
 * ModulePush.java):
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
 *     }
 *   }
 *
 * Developers who already maintain their own service worker can copy the event
 * handlers below into theirs, or import this file via `importScripts`.
 */

var CLY_ACTION = "countly_push_action";
var CLY_SUBSCRIPTION_CHANGE = "countly_push_subscription_change";
var CLY_READY = "countly_push_ready";
var CLY_ACK = "countly_push_ack";
var CLY_MAX_ACTIONS = 2; // Countly messages carry at most two buttons
var CLY_MAX_PENDING = 20;

// actions no page has confirmed recording yet. matchAll returns every window on the origin,
// including ones with no Countly SDK on them, so an action is only forgotten once a page
// acknowledges it — otherwise a later page drains it on handshake.
var clyPendingActions = [];

/**
 * Collect the window clients this worker could deliver a push action to.
 * @returns {Promise<WindowClient[]>} open window clients
 */
function clyWindowClients() {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true });
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

// Take over as soon as possible. Without this the page that registered the worker is not
// controlled until it reloads, so its ready/ack messages to the worker would go nowhere and an
// action it recorded would be redelivered — and counted again — after that reload. It also lets a
// new version of this file replace the old one without waiting for every tab of the site to close.
// Developers merging these handlers into their own worker should keep this behaviour in mind.
self.addEventListener("install", function (event) {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});

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

    var countly = payload.c || {};
    var buttons = Array.isArray(countly.b) ? countly.b : [];
    var options = {
        body: payload.message || "",
        data: {
            i: countly.i || "",
            l: countly.l || "",
            b: buttons
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

    event.waitUntil(self.registration.showNotification(payload.title || "", options));
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();

    var data = event.notification.data || {};
    var buttons = Array.isArray(data.b) ? data.b : [];
    var buttonIndex = 0;
    var url = data.l || "";

    if (event.action && event.action.indexOf("btn_") === 0) {
        // "btn_1" is the first button, so index 0 of the payload's button list
        var idx = parseInt(event.action.slice(4), 10);
        var button = buttons[idx - 1];
        if (button) {
            buttonIndex = idx;
            url = button.l || url;
        }
    }

    var actionMessage = {
        type: CLY_ACTION,
        messageId: data.i || "",
        buttonIndex: buttonIndex,
        // lets a page drop the message if it also received it through the pending queue
        aid: (data.i || "") + "_" + buttonIndex + "_" + Date.now()
    };

    event.waitUntil(
        clyWindowClients().then(function (clientList) {
            // Exactly one page may record the action. Broadcasting it would make every open tab
            // report the same click and inflate the campaign's actioned count.
            var target = clyPickActionTarget(clientList, url);
            clyRemember(actionMessage);
            if (target) {
                target.postMessage(actionMessage);
            }

            if (!url) {
                return;
            }
            if (target && target.url === url && "focus" in target) {
                return target.focus();
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(url);
            }
        })
    );
});

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
        return;
    }
    if (data.type !== CLY_READY || !event.source) {
        return;
    }
    // Left in place until acknowledged: only the pages that run the SDK reply, so a window that
    // cannot record the action does not consume it. The page drops duplicates by `aid`.
    for (var i = 0; i < clyPendingActions.length; i++) {
        event.source.postMessage(clyPendingActions[i]);
    }
});

self.addEventListener("pushsubscriptionchange", function (event) {
    // The browser dropped the old subscription. Re-subscribe with the same application
    // server key and let the pages know so they queue a fresh token_session.
    var oldSubscription = event.oldSubscription || {};
    var applicationServerKey = (oldSubscription.options && oldSubscription.options.applicationServerKey) || null;
    var resubscribed;
    if (event.newSubscription) {
        resubscribed = Promise.resolve(event.newSubscription);
    }
    else if (applicationServerKey) {
        resubscribed = self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
    }
    else {
        // Chrome fires this with neither subscription attached. A subscribe() without the key is
        // a guaranteed rejection, so leave it to the pages, which know the configured key.
        resubscribed = Promise.resolve(null);
    }

    event.waitUntil(
        resubscribed.catch(function () {
            return null;
        }).then(clyWindowClients).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                clientList[i].postMessage({ type: CLY_SUBSCRIPTION_CHANGE });
            }
        })
    );
});
