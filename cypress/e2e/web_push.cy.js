/* eslint-disable cypress/no-unnecessary-waiting */
/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper.js");

// An uncompressed P-256 public key is 65 bytes starting with 0x04. Two distinct keys let us
// exercise the "operator rotated the VAPID keypair" path.
function fakeVapidKey(fill) {
    var bytes = new Uint8Array(65);
    bytes[0] = 4;
    for (var i = 1; i < 65; i++) {
        bytes[i] = fill;
    }
    var binary = "";
    for (var j = 0; j < bytes.length; j++) {
        binary += String.fromCharCode(bytes[j]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const VAPID_KEY = fakeVapidKey(7);
const OTHER_VAPID_KEY = fakeVapidKey(9);
const MESSAGE_ID = "507f1f77bcf86cd799439011";

// Push needs a real ServiceWorkerContainer, a PushManager and Notification, none of which can be
// driven from a spec. The whole surface the SDK touches is replaced with a fake so every branch
// (permission, rotation, unsubscribe) is reachable, then restored afterwards.
var push = null;

function keyToBytes(base64Url) {
    var padded = base64Url + "=".repeat((4 - base64Url.length % 4) % 4);
    var raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}

function installPushMocks() {
    var state = {
        permission: "granted",
        subscription: null,
        subscribeCalls: 0,
        unsubscribeCalls: 0,
        registerCalls: [],
        messageListeners: [],
        restore: []
    };

    var pushManager = {
        getSubscription: () => Promise.resolve(state.subscription),
        subscribe: (options) => {
            state.subscribeCalls++;
            state.subscription = {
                endpoint: "https://push.example/endpoint" + state.subscribeCalls,
                expirationTime: null,
                options: { userVisibleOnly: true, applicationServerKey: options.applicationServerKey.buffer.slice(0) },
                toJSON() {
                    return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: "p256dh", auth: "auth" } };
                },
                unsubscribe: () => {
                    state.unsubscribeCalls++;
                    state.subscription = null;
                    return Promise.resolve(true);
                }
            };
            return Promise.resolve(state.subscription);
        }
    };
    var registration = { scope: "/", pushManager: pushManager };

    var container = {
        controller: { postMessage: () => { } },
        ready: Promise.resolve(registration),
        register: (path, options) => {
            state.registerCalls.push({ path: path, scope: options && options.scope });
            return Promise.resolve(registration);
        },
        getRegistration: () => Promise.resolve(registration),
        addEventListener: (type, callback) => {
            if (type === "message") {
                state.messageListeners.push(callback);
            }
        }
    };

    function override(target, property, value) {
        var previous = Object.prototype.hasOwnProperty.call(target, property) ? Object.getOwnPropertyDescriptor(target, property) : null;
        Object.defineProperty(target, property, { value: value, configurable: true, writable: true });
        state.restore.push(() => {
            if (previous) {
                Object.defineProperty(target, property, previous);
            }
            else {
                delete target[property];
            }
        });
    }

    override(window.navigator, "serviceWorker", container);
    if (typeof window.Notification === "undefined") {
        override(window, "Notification", {});
    }
    override(window.Notification, "permission", "granted");
    override(window.Notification, "requestPermission", () => Promise.resolve(state.permission));
    if (typeof window.PushManager === "undefined") {
        override(window, "PushManager", function () { });
    }

    var setNotificationPermission = (value) => {
        Object.defineProperty(window.Notification, "permission", { value: value, configurable: true, writable: true });
    };
    // what a prompt would answer, while Notification.permission stays "default" so the prompt is
    // actually consulted and the silent auto register path stays out of the way
    state.setPermission = (permission) => {
        state.permission = permission;
        setNotificationPermission(permission === "granted" ? "default" : permission);
    };
    // a returning visitor who granted permission on an earlier visit
    state.grantPermission = () => setNotificationPermission("granted");
    state.setPermission("granted");
    state.emit = (data) => state.messageListeners.forEach((callback) => callback({ data: data }));
    return state;
}

function initMain(config) {
    Countly.init(Object.assign({
        app_key: hp.appKey,
        url: "https://your.domain.count.ly",
        device_id: "web push tester",
        test_mode: true,
        test_mode_eq: true,
        debug: true
    }, config || {}));
}

// enabling is queued as a command so it runs after any consent or permission change before it
function enablePush(opts) {
    return cy.wrap(null).then(() => Countly.enable_push_notifications(opts));
}

// token_session is deliberately delayed so begin_session lands first
function waitForPendingToken() {
    cy.wait(hp.lWait + 500);
}

function tokenRequests(callback) {
    cy.fetch_local_request_queue().then((rq) => {
        callback(rq.filter((request) => request.token_session));
    });
}

function expectTokenRequestCount(count) {
    tokenRequests((requests) => {
        expect(requests.length).to.equal(count);
    });
}

function pushStorage(key) {
    return cy.getLocalStorage(`${hp.appKey}/${key}`);
}

describe("Web push tests", () => {
    beforeEach(() => {
        push = installPushMocks();
    });

    afterEach(() => {
        // reverse order, so a property defined on an object this helper itself created is
        // put back before that object is removed again
        push.restore.reverse().forEach((restore) => restore());
        push = null;
    });

    it("Decodes and validates the VAPID public key", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            const bytes = Countly._internals.urlBase64ToUint8Array(VAPID_KEY);
            expect(bytes.length).to.equal(65);
            expect(bytes[0]).to.equal(4);
            expect(Countly._internals.urlBase64ToUint8Array("this is not base64!")).to.equal(null);
            expect(Countly._internals.isPushSupported(true)).to.equal(true);
        });
    });

    it("Refuses to subscribe without a usable configuration", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(false);
                expect(result.reason).to.equal("missing_vapid_key");
            });
            enablePush({ push_vapid_public_key: "too-short" }).then((result) => {
                expect(result.reason).to.equal("invalid_vapid_key");
                expect(push.subscribeCalls).to.equal(0);
            });
        });
    });

    it("Refuses to subscribe without push consent and without permission", () => {
        hp.haltAndClearStorage(() => {
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            enablePush().then((result) => {
                expect(result.reason).to.equal("no_consent");
                expect(push.subscribeCalls).to.equal(0);
            });
            cy.then(() => {
                Countly.add_consent(["push"]);
                push.setPermission("denied");
            });
            enablePush().then((result) => {
                expect(result.reason).to.equal("denied");
                expect(push.subscribeCalls).to.equal(0);
            });
        });
    });

    it("Subscribes and registers the token, then stays idempotent", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.subscribeCalls).to.equal(1);
                expect(push.registerCalls[0]).to.deep.equal({ path: "/countly_sw.js", scope: "/" });
                pushStorage("cly_push_endpoint").should("equal", result.endpoint);
                pushStorage("cly_push_vapid_key").should("equal", VAPID_KEY);
                expectTokenRequestCount(0);
                waitForPendingToken();
                tokenRequests((requests) => {
                    expect(requests.length).to.equal(1);
                    expect(requests[0].token_provider).to.equal("WEB");
                    const token = JSON.parse(requests[0].web_token);
                    expect(token.endpoint).to.equal(result.endpoint);
                    expect(token.keys).to.be.ok;
                });
                enablePush().then((second) => {
                    expect(second.endpoint).to.equal(result.endpoint);
                    expect(push.subscribeCalls).to.equal(1);
                });
                waitForPendingToken();
                expectTokenRequestCount(1);
            });
        });
    });

    it("Re-registers a still valid subscription but re-subscribes after a key rotation", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            waitForPendingToken();
            // losing the cached endpoint must not cost the user their subscription
            cy.then(() => {
                Countly._internals.removeValueFromStorage("cly_push_endpoint");
                Countly._internals.removeValueFromStorage("cly_push_vapid_key");
            });
            enablePush().then(() => {
                expect(push.subscribeCalls).to.equal(1);
                expect(push.unsubscribeCalls).to.equal(0);
            });
            waitForPendingToken();
            expectTokenRequestCount(2);
            enablePush({ push_vapid_public_key: OTHER_VAPID_KEY }).then(() => {
                expect(push.unsubscribeCalls).to.equal(1);
                expect(push.subscribeCalls).to.equal(2);
                expect(new Uint8Array(push.subscription.options.applicationServerKey)).to.deep.equal(keyToBytes(OTHER_VAPID_KEY));
            });
            waitForPendingToken();
            expectTokenRequestCount(3);
            pushStorage("cly_push_vapid_key").should("equal", OTHER_VAPID_KEY);
        });
    });

    it("Blacklists the token when push is disabled and stays quiet when there is nothing to disable", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            waitForPendingToken();
            cy.wrap(null).then(() => Countly.disable_push_notifications()).then((result) => {
                expect(result.unsubscribed).to.equal(true);
                expect(push.unsubscribeCalls).to.equal(1);
            });
            waitForPendingToken();
            tokenRequests((requests) => {
                expect(requests.length).to.equal(2);
                expect(requests[1].web_token).to.equal("BLACKLISTED");
            });
            pushStorage("cly_push_endpoint").should("equal", null);
            cy.wrap(null).then(() => Countly.disable_push_notifications());
            waitForPendingToken();
            expectTokenRequestCount(2);
        });
    });

    it("Blacklists the token when push consent is withdrawn", () => {
        hp.haltAndClearStorage(() => {
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            cy.then(() => Countly.add_consent(["push"]));
            enablePush();
            waitForPendingToken();
            cy.then(() => Countly.remove_consent(["push"]));
            waitForPendingToken();
            tokenRequests((requests) => {
                expect(requests[requests.length - 1].web_token).to.equal("BLACKLISTED");
            });
            pushStorage("cly_push_endpoint").should("equal", null);
        });
    });

    it("Records [CLY]_push_action with mobile SDK compatible segmentation", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            Countly.record_push_action(MESSAGE_ID, 2);
            Countly.record_push_action(MESSAGE_ID);
            Countly.record_push_action();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(2);
                expect(eq[0].key).to.equal("[CLY]_push_action");
                expect(eq[0].count).to.equal(1);
                expect(eq[0].segmentation).to.deep.equal({ i: MESSAGE_ID, b: 2, p: "w" });
                expect(eq[1].segmentation.b).to.equal(0);
            });
        });
    });

    it("Gates the push action event behind push consent", () => {
        hp.haltAndClearStorage(() => {
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            Countly.record_push_action(MESSAGE_ID, 0);
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(0);
            });
            cy.then(() => {
                Countly.add_consent(["push"]);
                Countly.record_push_action(MESSAGE_ID, 1);
            });
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(1);
                expect(eq[0].segmentation.b).to.equal(1);
            });
        });
    });

    it("Records actions relayed by the service worker exactly once", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.then(() => {
                expect(push.messageListeners.length).to.equal(1);
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 1, aid: "action-1" });
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 1, aid: "action-1" });
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 1, aid: "action-2" });
                push.emit({ type: "not_a_countly_message", messageId: MESSAGE_ID, aid: "action-3" });
            });
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(2);
            });
        });
    });

    it("Re-registers the token when the worker reports a subscription change", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            waitForPendingToken();
            cy.then(() => {
                push.subscribeCalls = 0;
                push.emit({ type: "countly_push_subscription_change" });
            });
            waitForPendingToken();
            tokenRequests((requests) => {
                // the live subscription is reused, only the server is brought back in sync
                expect(push.subscribeCalls).to.equal(0);
                expect(requests.length).to.equal(2);
            });
        });
    });

    it("Does not prompt at init when permission was never granted", () => {
        hp.haltAndClearStorage(() => {
            // Safari and Firefox only allow a permission prompt from a user gesture, so the silent
            // path has to stay quiet and leave the work to an explicit enable_push_notifications
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait).then(() => {
                expect(push.subscribeCalls).to.equal(0);
            });
            expectTokenRequestCount(0);
        });
    });

    it("Registers on init without any explicit call once permission is granted", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait).then(() => {
                expect(push.subscribeCalls).to.equal(1);
            });
            waitForPendingToken();
            expectTokenRequestCount(1);
        });
    });

    it("Stays off when auto register is opted out of", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY, push_auto_register: false });
            cy.wait(hp.sWait).then(() => {
                expect(push.subscribeCalls).to.equal(0);
            });
            expectTokenRequestCount(0);
        });
    });

    it("Hands the subscription to the new device id after a change", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY });
            waitForPendingToken();
            pushStorage("cly_push_device_id").should("equal", "web push tester");
            cy.then(() => {
                push.subscribeCalls = 0;
                Countly.change_id("logged in user", true);
            });
            waitForPendingToken();
            tokenRequests((requests) => {
                // the subscription belongs to the browser, so it is reused rather than recreated
                expect(push.subscribeCalls).to.equal(0);
                expect(requests.length).to.equal(2);
                expect(requests[1].device_id).to.equal("logged in user");
            });
            pushStorage("cly_push_device_id").should("equal", "logged in user");
        });
    });

    it("Keeps the identity the token was created with when the device id changes", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush().then(() => {
                Countly.change_id("someone else", false);
            });
            waitForPendingToken();
            tokenRequests((requests) => {
                expect(requests.length).to.equal(1);
                expect(requests[0].device_id).to.equal("web push tester");
            });
        });
    });

    it("Clears push state and cancels the pending token on halt", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush().then(() => {
                Countly.halt();
            });
            pushStorage("cly_push_endpoint").should("equal", null);
            pushStorage("cly_push_vapid_key").should("equal", null);
            waitForPendingToken();
            expectTokenRequestCount(0);
        });
    });
});
