/* eslint-disable no-restricted-globals */
/**
 * Countly reference service worker for web push notifications.
 *
 * Handles the W3C Push API `push` event by displaying a notification, and the
 * `notificationclick` event by opening the target URL and asking any open page
 * to record the [CLY]_push_action event.
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
 * Developers who already maintain their own service worker can copy the two
 * event handlers below into theirs, or import this file via `importScripts`.
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

    var countly = payload.c || {};
    var title = payload.title || "";
    var options = {
        body: payload.message || "",
        data: {
            i: countly.i || "",
            l: countly.l || "",
            b: Array.isArray(countly.b) ? countly.b : []
        }
    };
    if (payload.badge != null) options.badge = payload.badge;
    if (payload.icon) options.icon = payload.icon;
    if (countly.m) options.image = countly.m;
    if (Array.isArray(countly.b) && countly.b.length > 0) {
        options.actions = countly.b.slice(0, 2).map(function (btn, i) {
            return { action: "btn_" + (i + 1), title: btn.t || "" };
        });
    }

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();

    var data = event.notification.data || {};
    var buttonIndex = 0;
    var url = data.l || "";

    if (event.action && event.action.indexOf("btn_") === 0) {
        var idx = parseInt(event.action.slice(4), 10);
        if (!isNaN(idx) && Array.isArray(data.b) && data.b[idx - 1]) {
            buttonIndex = idx;
            url = data.b[idx - 1].l || url;
        }
    }

    var actionMessage = {
        type: "countly_push_action",
        messageId: data.i || "",
        buttonIndex: buttonIndex
    };

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                clientList[i].postMessage(actionMessage);
            }
            if (url) {
                for (var j = 0; j < clientList.length; j++) {
                    var client = clientList[j];
                    if (client.url === url && "focus" in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(url).then(function (newClient) {
                        if (newClient) {
                            // give the new page time to attach its message listener,
                            // then deliver the action so it can be recorded.
                            return new Promise(function (resolve) {
                                setTimeout(function () {
                                    try { newClient.postMessage(actionMessage); } catch (e) { /* noop */ }
                                    resolve();
                                }, 1500);
                            });
                        }
                    });
                }
            }
        })
    );
});
