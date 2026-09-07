/* eslint-disable cypress/no-unnecessary-waiting */
/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper.js");
const { SDK_VERSION } = require("../../modules/Constants.js");

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
        getRegistrationScopes: [],
        registeredScopeWorker: null,
        callOrder: [],
        messageListeners: [],
        controllerMessages: [],
        nextRegistration: null,
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
    state.pushManager = pushManager;
    var registration = { scope: "/", pushManager: pushManager, active: { scriptURL: new URL("/countly_sw.js", location.href).href } };

    var container = {
        controller: { postMessage: (message) => { state.controllerMessages.push(message); } },
        ready: Promise.resolve(registration),
        register: (path, options) => {
            state.callOrder.push("register");
            state.registerCalls.push({ path: path, scope: options && options.scope });
            state.registeredScopeWorker = registration;
            // nextRegistration lets a test hand back a worker that is still installing
            return Promise.resolve(state.nextRegistration || registration);
        },
        getRegistration: (scope) => {
            state.getRegistrationScopes.push(scope);
            return Promise.resolve(state.registeredScopeWorker);
        },
        addEventListener: (type, callback) => {
            if (type === "message") {
                state.messageListeners.push(callback);
            }
        },
        removeEventListener: (type, callback) => {
            if (type === "message") {
                state.messageListeners = state.messageListeners.filter((listener) => listener !== callback);
            }
        }
    };
    state.container = container;
    state.registration = registration;

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
    override(window.Notification, "requestPermission", () => {
        state.callOrder.push("requestPermission");
        // as in a browser, the answer to the prompt becomes the origin's permission state
        setNotificationPermission(state.permission);
        return Promise.resolve(state.permission);
    });
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
    // `source` is the ServiceWorker that sent the message, which a page can reply to even when
    // no worker controls it yet
    state.emit = (data, source) => state.messageListeners.slice().forEach((callback) => callback({ data: data, source: source }));
    return state;
}

// A worker that a fresh register() hands back before it has activated
function fakeInstallingWorker() {
    var listeners = [];
    var worker = {
        state: "installing",
        scriptURL: new URL("/countly_sw.js", location.href).href,
        addEventListener: (type, callback) => {
            if (type === "statechange") {
                listeners.push(callback);
            }
        },
        removeEventListener: (type, callback) => {
            listeners = listeners.filter((listener) => listener !== callback);
        },
        becomes: (state) => {
            worker.state = state;
            listeners.slice().forEach((callback) => callback({ target: worker }));
        }
    };
    return worker;
}

// [CLY]_push_action events, whether still in the event queue or already flushed into a request
function recordedPushActions(callback) {
    cy.fetch_local_event_queue().then((eq) => {
        cy.fetch_local_request_queue().then((rq) => {
            var flushed = [];
            rq.forEach((request) => {
                if (request.events) {
                    JSON.parse(request.events).forEach((event) => flushed.push(event));
                }
            });
            callback(eq.concat(flushed).filter((event) => event.key === "[CLY]_push_action"));
        });
    });
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

function disablePush() {
    return cy.wrap(null).then(() => Countly.disable_push_notifications());
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
                // initMain turns debug on, which the SDK tells the worker through its URL
                expect(push.registerCalls[0]).to.deep.equal({ path: "/countly_sw.js?cly_debug=1", scope: "/" });
                pushStorage("cly_push_endpoint").should("equal", result.endpoint);
                pushStorage("cly_push_vapid_key").should("equal", VAPID_KEY);
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
                // a second enable must not queue another token_session
                expectTokenRequestCount(1);
            });
        });
    });

    it("Re-registers a still valid subscription but re-subscribes after a key rotation", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            // losing the cached endpoint must not cost the user their subscription
            cy.then(() => {
                Countly._internals.removeValueFromStorage("cly_push_endpoint");
                Countly._internals.removeValueFromStorage("cly_push_vapid_key");
            });
            enablePush().then(() => {
                expect(push.subscribeCalls).to.equal(1);
                expect(push.unsubscribeCalls).to.equal(0);
            });
            expectTokenRequestCount(2);
            enablePush({ push_vapid_public_key: OTHER_VAPID_KEY }).then(() => {
                expect(push.unsubscribeCalls).to.equal(1);
                expect(push.subscribeCalls).to.equal(2);
                expect(new Uint8Array(push.subscription.options.applicationServerKey)).to.deep.equal(keyToBytes(OTHER_VAPID_KEY));
            });
            expectTokenRequestCount(3);
            pushStorage("cly_push_vapid_key").should("equal", OTHER_VAPID_KEY);
        });
    });

    it("Blacklists the token when push is disabled and stays quiet when there is nothing to disable", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            disablePush().then((result) => {
                expect(result.unsubscribed).to.equal(true);
                expect(push.unsubscribeCalls).to.equal(1);
            });
            tokenRequests((requests) => {
                expect(requests.length).to.equal(2);
                expect(requests[1].web_token).to.equal("BLACKLISTED");
            });
            pushStorage("cly_push_endpoint").should("equal", null);
            disablePush();
            expectTokenRequestCount(2);
        });
    });

    it("Blacklists the token when push consent is withdrawn", () => {
        hp.haltAndClearStorage(() => {
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            cy.then(() => Countly.add_consent(["push"]));
            enablePush();
            cy.then(() => Countly.remove_consent(["push"]));
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
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(2);
                expect(actions[0].key).to.equal("[CLY]_push_action");
                expect(actions[0].count).to.equal(1);
                expect(actions[0].segmentation).to.deep.equal({ i: MESSAGE_ID, b: 2, p: "w" });
                expect(actions[1].segmentation.b).to.equal(0);
            });
        });
    });

    it("Gates the push action event behind push consent", () => {
        hp.haltAndClearStorage(() => {
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            Countly.record_push_action(MESSAGE_ID, 0);
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(0);
            });
            cy.then(() => {
                Countly.add_consent(["push"]);
                Countly.record_push_action(MESSAGE_ID, 1);
            });
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(1);
                expect(actions[0].segmentation.b).to.equal(1);
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
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(2);
            });
        });
    });

    it("Re-registers the token when the worker reports a subscription change", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            cy.then(() => {
                push.subscribeCalls = 0;
                // the browser rotated the endpoint behind the SDK's back
                push.subscription.endpoint = "https://push.example/rotated";
                push.emit({ type: "countly_push_subscription_change" });
            });
            tokenRequests((requests) => {
                // the live subscription is reused, only the server is brought back in sync
                expect(push.subscribeCalls).to.equal(0);
                expect(requests.length).to.equal(2);
                expect(JSON.parse(requests[1].web_token).endpoint).to.equal("https://push.example/rotated");
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

    it("Sends nothing when the device id changes with a merge, the server moves the token", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY });
            // the silent registration runs on a timer after init
            cy.wait(hp.sWait);
            pushStorage("cly_push_device_id").should("equal", "web push tester");
            cy.then(() => {
                Countly.change_id("logged in user", true);
            });
            cy.wait(hp.sWait);
            tokenRequests((requests) => {
                // same user: /i/device_id makes the server carry the push token over to the new id
                expect(requests.length).to.equal(1);
                expect(push.subscribeCalls).to.equal(1);
            });
            // the local record follows the id the token now lives under, so the next load stays quiet
            pushStorage("cly_push_device_id").should("equal", "logged in user");
        });
    });

    it("Treats a device id change without a merge as a new user and registers the browser subscription for them", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush().then(() => {
                Countly.change_id("someone else", false);
            });
            cy.wait(hp.sWait);
            tokenRequests((requests) => {
                // the browser subscription now belongs to whoever is using the browser; the server
                // moves it off the previous user when the same token arrives under the new id
                expect(requests.length).to.equal(2);
                expect(requests[0].device_id).to.equal("web push tester");
                expect(requests[1].device_id).to.equal("someone else");
                expect(push.subscribeCalls).to.equal(1);
            });
        });
    });

    it("Makes the new user after a change without a merge wait for their own consent", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            cy.then(() => Countly.add_consent(["push"]));
            cy.wait(hp.sWait).then(() => {
                expect(push.subscribeCalls).to.equal(1);
            });
            cy.then(() => Countly.change_id("someone else", false));
            cy.wait(hp.sWait);
            // consents were reset with the id, so nothing is registered for the new user yet, and
            // the previous user's push record is gone
            expectTokenRequestCount(1);
            pushStorage("cly_push_endpoint").should("equal", null);
            cy.then(() => Countly.add_consent(["push"]));
            cy.wait(hp.sWait);
            tokenRequests((requests) => {
                expect(requests.length).to.equal(2);
                expect(requests[1].device_id).to.equal("someone else");
                expect(push.subscribeCalls).to.equal(1);
            });
        });
    });

    it("Keeps the opt-out across a device id change without a merge", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait);
            disablePush();
            cy.then(() => Countly.change_id("someone else", false));
            cy.wait(hp.sWait).then(() => {
                // the browser's person said no; a new id on the same browser does not change that
                expect(push.subscribeCalls).to.equal(1);
                expect(push.subscription).to.equal(null);
            });
            expectTokenRequestCount(2);
        });
    });

    it("Coalesces concurrent enable calls into a single subscription", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait);
            cy.wrap(null).then(() => {
                // a double click, or the silent registration racing an explicit call
                return Promise.all([Countly.enable_push_notifications(), Countly.enable_push_notifications()]);
            }).then((results) => {
                expect(results[0].subscribed).to.equal(true);
                expect(results[1].subscribed).to.equal(true);
                expect(push.subscribeCalls).to.equal(1);
            });
            expectTokenRequestCount(1);
        });
    });

    it("Queues the token immediately and clears push state on halt", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            // no page timer holds the token: closing the tab must not lose a live subscription
            expectTokenRequestCount(1);
            cy.then(() => Countly.halt());
            pushStorage("cly_push_endpoint").should("equal", null);
            pushStorage("cly_push_vapid_key").should("equal", null);
            pushStorage("cly_push_scope").should("equal", null);
        });
    });

    it("Asks for notification permission before any asynchronous work", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush().then(() => {
                // a prompt fired after the registration resolves would have lost the click's
                // user activation, which is what browsers require it to run under
                expect(push.callOrder[0]).to.equal("requestPermission");
                expect(push.callOrder.indexOf("register")).to.be.greaterThan(0);
            });
        });
    });

    it("Refuses to replace a service worker the application already owns", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.then(() => {
                push.registeredScopeWorker = { scope: "/", pushManager: push.pushManager, active: { scriptURL: new URL("/my-pwa-sw.js", location.href).href } };
            });
            enablePush().then((result) => {
                expect(result.reason).to.equal("service_worker_conflict");
                expect(push.registerCalls.length).to.equal(0);
            });
            expectTokenRequestCount(0);
        });
    });

    it("Uses a supplied registration and disables through the scope it subscribed under", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush({ push_service_worker_registration: { scope: "/app/", pushManager: push.pushManager } }).then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.registerCalls.length).to.equal(0);
            });
            pushStorage("cly_push_scope").should("equal", "/app/");
            cy.then(() => {
                push.getRegistrationScopes = [];
                return Countly.disable_push_notifications();
            }).then(() => {
                expect(push.getRegistrationScopes).to.deep.equal(["/app/"]);
            });
        });
    });

    it("Blacklists a token the server may still hold when the registration is gone", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            cy.then(() => {
                // cleared site data or a worker unregistered elsewhere
                push.registeredScopeWorker = null;
                push.subscription = null;
                return Countly.disable_push_notifications();
            }).then((result) => {
                expect(result.unsubscribed).to.equal(true);
            });
            tokenRequests((requests) => {
                expect(requests.length).to.equal(2);
                expect(requests[1].web_token).to.equal("BLACKLISTED");
            });
        });
    });

    // ---- second review pass ------------------------------------------------------------------

    it("Stays unsubscribed across a reload once push was disabled", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait).then(() => {
                expect(push.subscribeCalls).to.equal(1);
            });
            disablePush().then(() => {
                expect(push.unsubscribeCalls).to.equal(1);
            });
            // a reload keeps storage and the granted permission but starts the SDK afresh
            cy.then(() => {
                Countly.halt();
                initMain({ push_vapid_public_key: VAPID_KEY });
            });
            cy.wait(hp.sWait).then(() => {
                // permission alone is not consent to re-subscribe someone who opted out
                expect(push.subscribeCalls).to.equal(1);
                expect(push.subscription).to.equal(null);
            });
        });
    });

    it("Lets an explicit enable lift the opt-out", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait);
            disablePush();
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.subscribeCalls).to.equal(2);
            });
            cy.then(() => {
                Countly.halt();
                initMain({ push_vapid_public_key: VAPID_KEY });
            });
            cy.wait(hp.sWait).then(() => {
                // subscribed again by choice, so the reload keeps that subscription
                expect(push.subscribeCalls).to.equal(2);
                expect(push.subscription).to.not.equal(null);
            });
        });
    });

    it("Re-registers silently when push consent is granted again after being withdrawn", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            cy.then(() => Countly.add_consent(["push"]));
            cy.wait(hp.sWait).then(() => {
                expect(push.subscribeCalls).to.equal(1);
            });
            cy.then(() => Countly.remove_consent(["push"]));
            cy.wait(hp.sWait).then(() => {
                expect(push.unsubscribeCalls).to.equal(1);
            });
            cy.then(() => Countly.add_consent(["push"]));
            cy.wait(hp.sWait).then(() => {
                // withdrawing consent is not the same as opting out of push: consent given again
                // is the user's answer, so no button press is needed
                expect(push.subscribeCalls).to.equal(2);
            });
        });
    });

    it("Acknowledges relayed actions to the worker that sent them when no worker controls the page", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            var acks = [];
            cy.then(() => {
                // a freshly registered worker does not control the page until the next load
                push.container.controller = null;
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 0, aid: "action-uncontrolled" }, { postMessage: (message) => acks.push(message) });
            });
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(1);
                expect(acks).to.deep.equal([{ type: "countly_push_ack", aid: "action-uncontrolled" }]);
            });
        });
    });

    it("Does not depend on the page being controlled to finish subscribing", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.then(() => {
                // ready only resolves for a registration whose scope covers the page; a worker
                // registered under a narrower scope would leave it pending forever
                push.container.ready = new Promise(() => { });
            });
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.subscribeCalls).to.equal(1);
            });
        });
    });

    it("Waits for a freshly installed worker to activate before subscribing", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            var worker = fakeInstallingWorker();
            cy.then(() => {
                push.container.ready = new Promise(() => { });
                push.nextRegistration = { scope: "/", pushManager: push.pushManager, active: null, installing: worker };
            });
            cy.wrap(null).then(() => {
                var pending = Countly.enable_push_notifications();
                setTimeout(() => worker.becomes("activated"), 20);
                return pending;
            }).then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.subscribeCalls).to.equal(1);
            });
        });
    });

    it("Gives up with a reason when the freshly installed worker becomes redundant", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            var worker = fakeInstallingWorker();
            cy.then(() => {
                push.container.ready = new Promise(() => { });
                push.nextRegistration = { scope: "/", pushManager: push.pushManager, active: null, installing: worker };
            });
            cy.wrap(null).then(() => {
                var pending = Countly.enable_push_notifications();
                setTimeout(() => worker.becomes("redundant"), 20);
                return pending;
            }).then((result) => {
                expect(result.subscribed).to.equal(false);
                expect(result.reason).to.equal("service_worker_redundant");
                expect(push.subscribeCalls).to.equal(0);
            });
            expectTokenRequestCount(0);
        });
    });

    it("Flushes push actions to the request queue immediately", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            Countly.record_push_action(MESSAGE_ID, 0);
            cy.fetch_local_event_queue().then((eq) => {
                // a click usually lands on a page about to navigate, so the event cannot wait for the heartbeat
                expect(eq.length).to.equal(0);
            });
            cy.fetch_local_request_queue().then((rq) => {
                var flushed = rq.filter((request) => request.events && request.events.indexOf("[CLY]_push_action") !== -1);
                expect(flushed.length).to.equal(1);
            });
        });
    });

    it("Stops listening to the worker on halt and does not stack listeners across re-init", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.then(() => {
                expect(push.messageListeners.length).to.equal(1);
                Countly.halt();
                expect(push.messageListeners.length).to.equal(0);
                // a message from the worker after halt must be ignored, not blow up in the listener
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 0, aid: "after-halt" });
                initMain({ push_vapid_public_key: VAPID_KEY });
                expect(push.messageListeners.length).to.equal(1);
            });
        });
    });

    it("Honours push_auto_register false when the worker reports a rotation", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY, push_auto_register: false });
            enablePush();
            cy.then(() => {
                push.subscription.endpoint = "https://push.example/rotated";
                push.emit({ type: "countly_push_subscription_change" });
            });
            cy.wait(hp.sWait);
            tokenRequests((requests) => {
                // one flag governs every registration the developer did not ask for
                expect(requests.length).to.equal(1);
            });
        });
    });

    it("Posts the ready handshake to the worker only when push is configured", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            cy.wait(hp.sWait).then(() => {
                var ready = push.controllerMessages.filter((message) => message.type === "countly_push_ready");
                expect(ready.length).to.equal(0);
            });
            cy.then(() => {
                Countly.halt();
                initMain({ push_vapid_public_key: VAPID_KEY });
            });
            cy.wait(hp.sWait).then(() => {
                var ready = push.controllerMessages.filter((message) => message.type === "countly_push_ready");
                expect(ready.length).to.equal(1);
            });
        });
    });

    // ---- debugging, listener, allowed hosts ------------------------------------------------

    it("Registers the worker with the debug flag in its URL", () => {
        hp.haltAndClearStorage(() => {
            // initMain sets debug: true
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.then(() => {
                // a previous visit registered the worker under the plain URL: that is still our worker
                push.registeredScopeWorker = push.registration;
            });
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.registerCalls[0].path).to.equal("/countly_sw.js?cly_debug=1");
            });
        });
    });

    it("Registers the plain worker URL when debug is off", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY, debug: false });
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(true);
                expect(push.registerCalls[0].path).to.equal("/countly_sw.js");
            });
        });
    });

    it("Tells the worker to log when debug is on", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait).then(() => {
                var ready = push.controllerMessages.filter((m) => m.type === "countly_push_ready");
                expect(ready.length).to.equal(1);
                expect(ready[0].debug).to.equal(true);
            });
        });
    });

    it("Prints log lines forwarded by the worker", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            cy.then(() => {
                var printed = [];
                var saved = {};
                ["log", "debug", "warn", "error", "info"].forEach((k) => {
                    saved[k] = console[k];
                    console[k] = function () {
                        printed.push(Array.prototype.join.call(arguments, " "));
                    };
                });
                try {
                    push.emit({ type: "countly_push_log", level: "debug", message: "push received " + MESSAGE_ID });
                    push.emit({ type: "countly_push_log", level: "error", message: "showNotification failed" });
                }
                finally {
                    Object.keys(saved).forEach((k) => {
                        console[k] = saved[k];
                    });
                }
                expect(printed.some((l) => l.indexOf("[SW]") !== -1 && l.indexOf("push received") !== -1)).to.equal(true);
                expect(printed.some((l) => l.indexOf("[SW]") !== -1 && l.indexOf("showNotification failed") !== -1)).to.equal(true);
            });
        });
    });

    it("Informs the push listener when a notification is received, clicked and closed", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            var events = [];
            cy.then(() => {
                Countly.set_push_notification_listener((e) => events.push(e));
                push.emit({ type: "countly_push_received", messageId: MESSAGE_ID, title: "Hi", message: "Body", url: "https://x/open", buttons: [{ t: "One", l: "https://x/1" }], payload: { c: { i: MESSAGE_ID }, custom: 1 } });
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 1, buttonTitle: "One", url: "https://x/1", title: "Hi", message: "Body", payload: { custom: 1 }, aid: "a-1" });
                // redelivered by the worker: recorded once, reported once
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 1, buttonTitle: "One", url: "https://x/1", aid: "a-1" });
                push.emit({ type: "countly_push_closed", messageId: MESSAGE_ID, title: "Hi" });
            });
            cy.then(() => {
                expect(events.map((e) => e.type)).to.deep.equal(["received", "clicked", "closed"]);
                expect(events[0]).to.include({ messageId: MESSAGE_ID, title: "Hi", message: "Body", url: "https://x/open" });
                expect(events[0].payload.custom).to.equal(1);
                expect(events[1]).to.include({ messageId: MESSAGE_ID, buttonIndex: 1, buttonTitle: "One", url: "https://x/1" });
                expect(events[2]).to.include({ messageId: MESSAGE_ID, title: "Hi" });
            });
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(1);
            });
        });
    });

    it("Takes the push listener from init and keeps recording when it throws", () => {
        hp.haltAndClearStorage(() => {
            var calls = 0;
            initMain({
                push_vapid_public_key: VAPID_KEY,
                push_notification_listener: () => {
                    calls++;
                    throw new Error("listener bug");
                }
            });
            cy.then(() => {
                push.emit({ type: "countly_push_received", messageId: MESSAGE_ID, title: "Hi" });
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 0, aid: "b-1" });
            });
            cy.then(() => {
                expect(calls).to.equal(2);
            });
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(1);
            });
        });
    });

    // ---- the worker reporting clicks itself, and giving up on a browser that never answers -----

    function workerMessages(type) {
        return push.controllerMessages.filter((m) => m.type === type);
    }

    it("Tells the worker how to report a click itself in the ready handshake", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY, app_version: "1.2.3" });
            cy.wait(hp.sWait).then(() => {
                var ready = workerMessages("countly_push_ready");
                expect(ready.length).to.equal(1);
                expect(ready[0].config).to.deep.equal({
                    url: "https://your.domain.count.ly/i",
                    app_key: hp.appKey,
                    device_id: "web push tester",
                    t: 0,
                    sdk_name: "javascript_native_web",
                    sdk_version: SDK_VERSION,
                    av: "1.2.3"
                });
            });
        });
    });

    it("Passes the salt to the worker so its reports carry the same checksum", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY, salt: "pepper" });
            cy.wait(hp.sWait).then(() => {
                expect(workerMessages("countly_push_ready")[0].config.salt).to.equal("pepper");
            });
        });
    });

    it("Withholds the server details until push consent is given", () => {
        hp.haltAndClearStorage(() => {
            push.grantPermission();
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            cy.wait(hp.sWait).then(() => {
                var ready = workerMessages("countly_push_ready");
                expect(ready.length).to.equal(1);
                expect(ready[0].config).to.equal(null);
                Countly.add_consent(["push"]);
            });
            cy.wait(hp.sWait).then(() => {
                // consent let the silent registration run, and the worker is told along with it
                var configs = workerMessages("countly_push_config");
                expect(configs.length).to.be.greaterThan(0);
                expect(configs[configs.length - 1].config.device_id).to.equal("web push tester");
            });
        });
    });

    it("Tells the worker to stop reporting when push consent is withdrawn", () => {
        hp.haltAndClearStorage(() => {
            initMain({ require_consent: true, push_vapid_public_key: VAPID_KEY });
            cy.then(() => Countly.add_consent(["push"]));
            enablePush().then((result) => {
                expect(result.subscribed).to.equal(true);
                push.controllerMessages.length = 0;
                Countly.remove_consent(["push"]);
            });
            cy.wait(hp.sWait).then(() => {
                var configs = workerMessages("countly_push_config");
                expect(configs.length).to.be.greaterThan(0);
                expect(configs[configs.length - 1].config).to.equal(null);
            });
        });
    });

    it("Tells the worker the new device id after a change", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            enablePush();
            cy.then(() => {
                push.controllerMessages.length = 0;
                Countly.change_id("someone else", true);
            });
            cy.wait(hp.sWait).then(() => {
                var configs = workerMessages("countly_push_config");
                expect(configs.length).to.be.greaterThan(0);
                expect(configs[configs.length - 1].config.device_id).to.equal("someone else");
            });
        });
    });

    it("Only informs the listener about a click the worker already recorded", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY });
            var events = [];
            var acks = [];
            cy.then(() => {
                Countly.set_push_notification_listener((e) => events.push(e));
                push.emit({ type: "countly_push_action", messageId: MESSAGE_ID, buttonIndex: 2, url: "https://docs.example/", aid: "direct-1", recorded: true }, { postMessage: (m) => acks.push(m) });
            });
            cy.then(() => {
                expect(events.map((e) => e.type)).to.deep.equal(["clicked"]);
                expect(events[0].buttonIndex).to.equal(2);
                expect(acks).to.deep.equal([{ type: "countly_push_ack", aid: "direct-1" }]);
            });
            recordedPushActions((actions) => {
                expect(actions.length).to.equal(0);
            });
        });
    });

    it("Reaches the supplied registration's worker when no worker controls the page yet", () => {
        hp.haltAndClearStorage(() => {
            var posted = [];
            cy.then(() => {
                push.container.controller = null;
                push.registration.active.postMessage = (m) => posted.push(m);
                initMain({ push_vapid_public_key: VAPID_KEY, push_service_worker_registration: push.registration });
            });
            cy.wait(hp.sWait).then(() => {
                expect(posted.filter((m) => m.type === "countly_push_ready").length).to.equal(1);
            });
        });
    });

    it("Gives up with a reason when the browser never finishes subscribing, and lets a later call retry", () => {
        hp.haltAndClearStorage(() => {
            initMain({ push_vapid_public_key: VAPID_KEY, push_subscribe_timeout: 200 });
            var working = null;
            cy.then(() => {
                working = push.pushManager.subscribe;
                // iOS 18.7 left pushManager.subscribe() pending forever
                push.pushManager.subscribe = () => new Promise(() => { });
            });
            enablePush().then((result) => {
                expect(result).to.deep.equal({ subscribed: false, reason: "timeout" });
                push.pushManager.subscribe = working;
            });
            enablePush().then((result) => {
                // the in-flight guard was released, so this is a fresh attempt rather than the dead promise
                expect(result.subscribed).to.equal(true);
                expect(push.subscribeCalls).to.equal(1);
            });
        });
    });

    it("Says so when the silent registration gives up", () => {
        hp.haltAndClearStorage(() => {
            var printed = [];
            var saved = {};
            cy.then(() => {
                ["log", "debug", "warn", "error", "info"].forEach((k) => {
                    saved[k] = console[k];
                    console[k] = function () {
                        printed.push(Array.prototype.join.call(arguments, " "));
                    };
                });
                push.grantPermission();
                push.pushManager.subscribe = () => Promise.reject(new Error("push service unreachable"));
                initMain({ push_vapid_public_key: VAPID_KEY });
            });
            cy.wait(hp.sWait).then(() => {
                Object.keys(saved).forEach((k) => {
                    console[k] = saved[k];
                });
                expect(printed.some((l) => l.indexOf("[WARNING]") === 0 && l.indexOf("autoRegisterPush") !== -1 && l.indexOf("push service unreachable") !== -1)).to.equal(true);
            });
        });
    });

    it("Says which endpoint the silent registration ended up with", () => {
        hp.haltAndClearStorage(() => {
            var printed = [];
            var saved = {};
            cy.then(() => {
                ["log", "debug", "warn", "error", "info"].forEach((k) => {
                    saved[k] = console[k];
                    console[k] = function () {
                        printed.push(Array.prototype.join.call(arguments, " "));
                    };
                });
                push.grantPermission();
                initMain({ push_vapid_public_key: VAPID_KEY });
            });
            cy.wait(hp.sWait).then(() => {
                Object.keys(saved).forEach((k) => {
                    console[k] = saved[k];
                });
                expect(printed.some((l) => l.indexOf("autoRegisterPush") !== -1 && l.indexOf("https://push.example/endpoint1") !== -1)).to.equal(true);
            });
        });
    });
});
