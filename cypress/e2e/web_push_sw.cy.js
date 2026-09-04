/* eslint-disable require-jsdoc */
// Unit tests for the reference service worker. The worker only ever talks to `self`, so the file
// is evaluated against a fake global and its handlers are driven with hand-made events.

const MESSAGE_ID = "507f1f77bcf86cd799439011";
const { SDK_VERSION, pushMessageTypes, pushWorkerParams, pushConstants } = require("../../modules/Constants.js");

function fakeClient(url, focused) {
    return {
        url: url,
        focused: !!focused,
        messages: [],
        focusCalls: 0,
        postMessage(message) {
            this.messages.push(message);
        },
        focus() {
            this.focusCalls++;
            return Promise.resolve(this);
        }
    };
}

// `setup` runs against the fake global before the worker source is evaluated, the way a host
// worker's own code would run before an importScripts() of countly_sw.js
function loadWorker(source, setup) {
    var handlers = {};
    var self = {
        skipWaitingCalls: 0,
        skipWaiting() {
            this.skipWaitingCalls++;
            return Promise.resolve();
        },
        addEventListener(type, callback) {
            (handlers[type] = handlers[type] || []).push(callback);
        },
        clients: {
            list: [],
            claimCalls: 0,
            opened: [],
            claim() {
                this.claimCalls++;
                return Promise.resolve();
            },
            matchAll() {
                return Promise.resolve(this.list.slice());
            },
            openWindow(url) {
                this.opened.push(url);
                return Promise.resolve(null);
            }
        },
        registration: {
            shown: [],
            showNotification(title, options) {
                this.shown.push({ title: title, options: options });
                return Promise.resolve();
            },
            pushManager: {
                subscribeCalls: [],
                subscribe(options) {
                    this.subscribeCalls.push(options);
                    return Promise.resolve({ endpoint: "https://push.example/new", options: options });
                }
            }
        }
    };
    if (setup) {
        setup(self);
    }
    new Function("self", source)(self);
    // runs every handler registered for `type` and settles once their waitUntil promises have
    function dispatch(type, event) {
        var pending = [];
        event = event || {};
        event.waitUntil = (promise) => {
            pending.push(promise);
        };
        (handlers[type] || []).forEach((callback) => callback(event));
        return Promise.all(pending);
    }
    return { self: self, handlers: handlers, dispatch: dispatch };
}

function pushEvent(payload) {
    return { data: { json: () => payload, text: () => JSON.stringify(payload) } };
}

describe("Web push service worker", () => {
    var source = null;

    before(() => {
        cy.readFile("countly_sw.js").then((code) => {
            source = code;
        });
    });

    it("Takes control of open pages as soon as it activates", () => {
        var worker = loadWorker(source);
        cy.then(() => worker.dispatch("install")).then(() => {
            // a page that registered this worker is otherwise not controlled until it reloads, and
            // an updated worker would wait for every tab to close
            expect(worker.self.skipWaitingCalls).to.equal(1);
            return worker.dispatch("activate");
        }).then(() => {
            expect(worker.self.clients.claimCalls).to.equal(1);
        });
    });

    it("Shows the notification described by the Countly payload", () => {
        var worker = loadWorker(source);
        var payload = {
            title: "Hi",
            message: "Body",
            icon: "https://x/icon.png",
            badge: 3,
            c: {
                i: MESSAGE_ID,
                l: "https://x/open",
                m: "https://x/image.jpg",
                b: [{ t: "One", l: "https://x/1" }, { t: "Two", l: "https://x/2" }, { t: "Three", l: "https://x/3" }]
            }
        };
        cy.then(() => worker.dispatch("push", pushEvent(payload))).then(() => {
            var shown = worker.self.registration.shown[0];
            expect(shown.title).to.equal("Hi");
            expect(shown.options.body).to.equal("Body");
            expect(shown.options.icon).to.equal("https://x/icon.png");
            expect(shown.options.image).to.equal("https://x/image.jpg");
            // an app badge count is not a badge icon URL
            expect(shown.options.badge).to.equal(undefined);
            expect(shown.options.actions).to.deep.equal([{ action: "btn_1", title: "One" }, { action: "btn_2", title: "Two" }]);
            // the whole payload rides along so a click or close can hand the page its custom data
            expect(shown.options.data).to.deep.equal({ i: MESSAGE_ID, l: "https://x/open", b: payload.c.b, p: payload });
        });
    });

    it("Hands a click to exactly one page and forgets it once acknowledged", () => {
        var worker = loadWorker(source);
        var other = fakeClient("https://x/other", false);
        var target = fakeClient("https://x/open", false);
        worker.self.clients.list = [other, target];
        var notification = {
            closed: false,
            close() {
                this.closed = true;
            },
            data: { i: MESSAGE_ID, l: "https://x/open", b: [{ t: "One", l: "https://x/1" }] }
        };
        cy.then(() => worker.dispatch("notificationclick", { notification: notification, action: "" })).then(() => {
            expect(notification.closed).to.equal(true);
            expect(other.messages.length).to.equal(0);
            expect(target.messages.length).to.equal(1);
            expect(target.messages[0].type).to.equal("countly_push_action");
            expect(target.messages[0].messageId).to.equal(MESSAGE_ID);
            expect(target.messages[0].buttonIndex).to.equal(0);
            expect(target.focusCalls).to.equal(1);
            expect(worker.self.clients.opened).to.deep.equal([]);
            // until someone acknowledges it, a page announcing itself is handed the action too
            var late = fakeClient("https://x/late", false);
            return worker.dispatch("message", { data: { type: "countly_push_ready" }, source: late }).then(() => {
                expect(late.messages.length).to.equal(1);
                expect(late.messages[0].aid).to.equal(target.messages[0].aid);
                return worker.dispatch("message", { data: { type: "countly_push_ack", aid: target.messages[0].aid } });
            }).then(() => {
                var later = fakeClient("https://x/later", false);
                return worker.dispatch("message", { data: { type: "countly_push_ready" }, source: later }).then(() => {
                    expect(later.messages.length).to.equal(0);
                });
            });
        });
    });

    it("Opens the button's URL and reports the button index when no page is open", () => {
        var worker = loadWorker(source);
        var notification = {
            close() { },
            data: { i: MESSAGE_ID, l: "https://x/open", b: [{ t: "One", l: "https://x/1" }, { t: "Two", l: "https://x/2" }] }
        };
        cy.then(() => worker.dispatch("notificationclick", { notification: notification, action: "btn_2" })).then(() => {
            expect(worker.self.clients.opened).to.deep.equal(["https://x/2"]);
            var page = fakeClient("https://x/2", true);
            return worker.dispatch("message", { data: { type: "countly_push_ready" }, source: page }).then(() => {
                expect(page.messages.length).to.equal(1);
                expect(page.messages[0].buttonIndex).to.equal(2);
                expect(page.messages[0].messageId).to.equal(MESSAGE_ID);
            });
        });
    });

    it("Does not attempt a re-subscribe without an application server key", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/", true);
        worker.self.clients.list = [page];
        // Chrome 138 fires the event with neither subscription attached
        cy.then(() => worker.dispatch("pushsubscriptionchange", {})).then(() => {
            // subscribe() without a key is a guaranteed rejection; the page re-registers with the
            // configured key instead
            expect(worker.self.registration.pushManager.subscribeCalls.length).to.equal(0);
            expect(page.messages).to.deep.equal([{ type: "countly_push_subscription_change" }]);
        });
    });

    it("Re-subscribes with the previous key and tells the pages when the browser rotates the subscription", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/", true);
        worker.self.clients.list = [page];
        var key = new Uint8Array([4, 1, 2, 3]).buffer;
        cy.then(() => worker.dispatch("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: key } } })).then(() => {
            var calls = worker.self.registration.pushManager.subscribeCalls;
            expect(calls.length).to.equal(1);
            expect(calls[0].userVisibleOnly).to.equal(true);
            expect(calls[0].applicationServerKey).to.equal(key);
            expect(page.messages).to.deep.equal([{ type: "countly_push_subscription_change" }]);
        });
    });

    // ---- living inside someone else's worker (importScripts) ---------------------------------

    it("Leaves pushes that are not from Countly to the host worker", () => {
        var worker = loadWorker(source);
        // no `c.i`: a push the host application's own backend sent through the same subscription
        cy.then(() => worker.dispatch("push", pushEvent({ title: "Someone else's push", body: "not ours" }))).then(() => {
            expect(worker.self.registration.shown.length).to.equal(0);
        });
    });

    it("Ignores clicks on notifications it did not show", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/", true);
        worker.self.clients.list = [page];
        var notification = {
            closed: false,
            close() {
                this.closed = true;
            },
            data: { someoneElses: true }
        };
        cy.then(() => worker.dispatch("notificationclick", { notification: notification, action: "" })).then(() => {
            expect(notification.closed).to.equal(false);
            expect(page.messages.length).to.equal(0);
            expect(worker.self.clients.opened).to.deep.equal([]);
        });
    });

    it("Leaves the host worker's lifecycle alone when asked", () => {
        var worker = loadWorker(source, (self) => {
            self.COUNTLY_PUSH_LIFECYCLE = false;
        });
        cy.then(() => worker.dispatch("install")).then(() => worker.dispatch("activate")).then(() => {
            expect(worker.self.skipWaitingCalls).to.equal(0);
            expect(worker.self.clients.claimCalls).to.equal(0);
        });
    });

    it("Announces its version when it activates", () => {
        var worker = loadWorker(source);
        var lines = [];
        var original = console.info;
        console.info = function () {
            lines.push(Array.prototype.join.call(arguments, " "));
        };
        cy.then(() => worker.dispatch("activate").then(() => {
            console.info = original;
        }, (err) => {
            console.info = original;
            throw err;
        })).then(() => {
            expect(lines.some((line) => line.indexOf("Countly") !== -1 && line.indexOf(SDK_VERSION) !== -1)).to.equal(true);
        });
    });

    it("Keeps the page-to-worker contract in sync with modules/Constants.js", () => {
        cy.then(() => {
            // the worker cannot import Constants.js, so these strings are duplicated by hand
            Object.keys(pushMessageTypes).forEach((name) => {
                expect(source, "message type " + name).to.include('"' + pushMessageTypes[name] + '"');
            });
            Object.keys(pushWorkerParams).forEach((name) => {
                expect(source, "worker url parameter " + name).to.include('"' + pushWorkerParams[name] + '"');
            });
            expect(source).to.include("CLY_MAX_ACTIONS = 2");
            expect(source).to.include("CLY_MAX_PENDING = " + pushConstants.MAX_SEEN_ACTION_IDS);
            expect(source).to.include('CLY_SW_VERSION = "' + SDK_VERSION + '"');
        });
    });

    // ---- debugging, listener events, allowed hosts -------------------------------------------

    // runs fn while recording everything written to the console, then restores the console
    function capture(fn) {
        var lines = [];
        var saved = {};
        ["log", "info", "warn", "error", "debug"].forEach((k) => {
            saved[k] = console[k];
            console[k] = function () {
                lines.push(k + ": " + Array.prototype.join.call(arguments, " "));
            };
        });
        function restore() {
            Object.keys(saved).forEach((k) => {
                console[k] = saved[k];
            });
        }
        return Promise.resolve().then(fn).then((result) => {
            restore();
            return { lines: lines, result: result };
        }, (err) => {
            restore();
            throw err;
        });
    }

    it("Stays quiet without debug and narrates every step with it", () => {
        var quiet = loadWorker(source);
        var chatty = loadWorker(source, (self) => {
            self.COUNTLY_PUSH_DEBUG = true;
        });
        var payload = { title: "Hi", message: "Body", c: { i: MESSAGE_ID, l: "https://x/open" } };
        cy.then(() => capture(() => quiet.dispatch("push", pushEvent(payload)))).then((out) => {
            expect(out.lines.filter((l) => l.indexOf("[Countly]") !== -1).length).to.equal(0);
            return capture(() => chatty.dispatch("push", pushEvent(payload)));
        }).then((out) => {
            expect(out.lines.some((l) => l.indexOf("[Countly]") !== -1 && l.indexOf(MESSAGE_ID) !== -1)).to.equal(true);
        });
    });

    it("Turns debug on from the worker URL", () => {
        var worker = loadWorker(source, (self) => {
            self.location = { href: "https://x/countly_sw.js?cly_debug=1" };
        });
        cy.then(() => capture(() => worker.dispatch("push", pushEvent({ title: "Hi", c: { i: MESSAGE_ID } })))).then((out) => {
            expect(out.lines.some((l) => l.indexOf("[Countly]") !== -1 && l.indexOf(MESSAGE_ID) !== -1)).to.equal(true);
        });
    });

    it("Turns debug on when a page says so in its handshake", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/", true);
        cy.then(() => worker.dispatch("message", { data: { type: "countly_push_ready", debug: true }, source: page })).then(() => capture(() => worker.dispatch("push", pushEvent({ title: "Hi", c: { i: MESSAGE_ID } })))).then((out) => {
            expect(out.lines.some((l) => l.indexOf("[Countly]") !== -1 && l.indexOf(MESSAGE_ID) !== -1)).to.equal(true);
        });
    });

    it("Forwards its log lines to open pages when debug is on", () => {
        var worker = loadWorker(source, (self) => {
            self.COUNTLY_PUSH_DEBUG = true;
        });
        var page = fakeClient("https://x/", true);
        worker.self.clients.list = [page];
        cy.then(() => capture(() => worker.dispatch("push", pushEvent({ title: "Hi", c: { i: MESSAGE_ID } })))).then(() => new Promise((r) => setTimeout(r, 20))).then(() => {
            var logs = page.messages.filter((m) => m.type === "countly_push_log");
            expect(logs.length).to.be.greaterThan(0);
            expect(logs[0].level).to.be.a("string");
            expect(logs.some((m) => m.message.indexOf(MESSAGE_ID) !== -1)).to.equal(true);
        });
    });

    it("Reports a notification the browser refused to show", () => {
        var worker = loadWorker(source);
        worker.self.registration.showNotification = () => Promise.reject(new Error("no permission"));
        cy.then(() => capture(() => worker.dispatch("push", pushEvent({ title: "Hi", c: { i: MESSAGE_ID } })))).then((out) => {
            expect(out.lines.some((l) => l.indexOf("error:") === 0 && l.indexOf("no permission") !== -1)).to.equal(true);
        });
    });

    it("Tells open pages when a push arrives and when its notification is closed", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/", true);
        worker.self.clients.list = [page];
        var payload = { title: "Hi", message: "Body", c: { i: MESSAGE_ID, l: "https://x/open", b: [{ t: "One", l: "https://x/1" }] }, custom: 1 };
        cy.then(() => worker.dispatch("push", pushEvent(payload))).then(() => {
            var received = page.messages.filter((m) => m.type === "countly_push_received");
            expect(received.length).to.equal(1);
            expect(received[0]).to.include({ messageId: MESSAGE_ID, title: "Hi", message: "Body", url: "https://x/open" });
            expect(received[0].payload.custom).to.equal(1);
            var shown = worker.self.registration.shown[0];
            return worker.dispatch("notificationclose", { notification: { title: shown.title, body: shown.options.body, data: shown.options.data } });
        }).then(() => {
            var closed = page.messages.filter((m) => m.type === "countly_push_closed");
            expect(closed.length).to.equal(1);
            expect(closed[0].messageId).to.equal(MESSAGE_ID);
            expect(closed[0].title).to.equal("Hi");
        });
    });

    it("Describes a click fully: button title, url, text and payload", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/1", true);
        worker.self.clients.list = [page];
        var payload = { title: "Hi", message: "Body", c: { i: MESSAGE_ID, l: "https://x/open", b: [{ t: "One", l: "https://x/1" }] }, custom: 1 };
        cy.then(() => worker.dispatch("push", pushEvent(payload))).then(() => {
            var shown = worker.self.registration.shown[0];
            return worker.dispatch("notificationclick", { notification: { title: shown.title, body: shown.options.body, data: shown.options.data, close() { } }, action: "btn_1" });
        }).then(() => {
            var action = page.messages.filter((m) => m.type === "countly_push_action")[0];
            expect(action).to.include({ messageId: MESSAGE_ID, buttonIndex: 1, buttonTitle: "One", url: "https://x/1", title: "Hi", message: "Body" });
            expect(action.payload.custom).to.equal(1);
        });
    });

    it("Never opens anything but http(s) URLs", () => {
        var worker = loadWorker(source);
        var click = (url) => worker.dispatch("notificationclick", { notification: { close() { }, data: { i: MESSAGE_ID, l: url, b: [] } }, action: "" });
        cy.then(() => capture(() => click("javascript:alert(1)"))).then(() => click("https://anything.example/page")).then(() => {
            expect(worker.self.clients.opened).to.deep.equal(["https://anything.example/page"]);
        });
    });

    it("Still records a click whose URL it refuses to open, and says why", () => {
        var worker = loadWorker(source);
        var page = fakeClient("https://x/", true);
        worker.self.clients.list = [page];
        cy.then(() => capture(() => worker.dispatch("notificationclick", { notification: { close() { }, data: { i: MESSAGE_ID, l: "javascript:alert(1)", b: [] } }, action: "" }))).then((out) => {
            expect(worker.self.clients.opened).to.deep.equal([]);
            expect(out.lines.some((l) => l.indexOf("warn:") === 0 && l.indexOf("not opening") !== -1)).to.equal(true);
            expect(page.messages.filter((m) => m.type === "countly_push_action").length).to.equal(1);
        });
    });
});
