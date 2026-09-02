/* eslint-disable require-jsdoc */
// Unit tests for the reference service worker. The worker only ever talks to `self`, so the file
// is evaluated against a fake global and its handlers are driven with hand-made events.

const MESSAGE_ID = "507f1f77bcf86cd799439011";

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

function loadWorker(source) {
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
            expect(shown.options.data).to.deep.equal({ i: MESSAGE_ID, l: "https://x/open", b: payload.c.b });
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
});
