/* eslint-disable no-restricted-globals */
/**
 * Countly reference service worker for web push notifications.
 *
 * Handles the W3C Push API `push` event by displaying a notification, the
 * `notificationclick` event by opening the target URL and asking a page to record
 * the [CLY]_push_action event, and `pushsubscriptionchange` so a browser-initiated
 * subscription rotation gets re-registered with the server.
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
var CLY_MAX_ACTIONS = 2; // Countly messages carry at most two buttons
var CLY_MAX_PENDING = 20;

// actions that could not be handed to a page yet, drained when one says it is listening
var clyPendingActions = [];

/**
 * Collect the window clients this worker could deliver a push action to.
 * @returns {Promise<WindowClient[]>} open window clients
 */
function clyWindowClients() {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

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
        var idx = parseInt(event.action.slice(4), 10);
        if (!isNaN(idx) && buttons[idx - 1]) {
            buttonIndex = idx;
            url = buttons[idx - 1].l || url;
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
            for (var i = 0; i < clientList.length; i++) {
                clientList[i].postMessage(actionMessage);
            }
            if (clientList.length === 0) {
                // nobody to record it — hold it until a page announces itself
                clyPendingActions.push(actionMessage);
                if (clyPendingActions.length > CLY_MAX_PENDING) {
                    clyPendingActions.shift();
                }
            }

            if (!url) {
                return;
            }
            for (var j = 0; j < clientList.length; j++) {
                var client = clientList[j];
                if (client.url === url && "focus" in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(url);
            }
        })
    );
});

self.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== CLY_READY || clyPendingActions.length === 0) {
        return;
    }
    var drained = clyPendingActions;
    clyPendingActions = [];
    if (!event.source) {
        return;
    }
    for (var i = 0; i < drained.length; i++) {
        event.source.postMessage(drained[i]);
    }
});

self.addEventListener("pushsubscriptionchange", function (event) {
    // The browser dropped the old subscription. Re-subscribe with the same application
    // server key and let the pages know so they queue a fresh token_session.
    var oldSubscription = event.oldSubscription || {};
    var applicationServerKey = (oldSubscription.options && oldSubscription.options.applicationServerKey) || null;
    var resubscribed = event.newSubscription ? Promise.resolve(event.newSubscription) : self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
    });

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
