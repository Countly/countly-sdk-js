/* eslint-disable cypress/no-unnecessary-waiting */
/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
// import * as Countly from "../../dist/countly_umd.js";
var hp = require("../support/helper.js");

function initMain(consent) {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        require_consent: consent,
        device_id: "György Ligeti",
        test_mode: true,
        test_mode_eq: true,
        debug: true
    });
}

/**
 * Checks a queue object for valid/correct values/limits during consent tests
 * @param {Array} eq - events queue 
 * @param {Array} eventArr - events array for the events to test
 * @param {boolean} custom - custom event check
 * @param {boolean} internalOnly - internal event check
 */
function consent_check(eq, eventArr, custom, internalOnly) {
    var i = 0;
    var b = i;
    var len = eventArr.length;
    if (custom) {
        len = 0;
    }
    if (internalOnly) {
        b = i + 1;
        len = eventArr.length - 1;
    }
    while (i < len) {
        expect(eq[i].key).to.equal(eventArr[b].key);
        expect(eq[i].count).to.equal(eventArr[b].count);
        expect(eq[i].segmentation[eventArr[b].count]).to.equal(eventArr[b].segmentation[eventArr[b].count]);
        i++;
        b++;
    }
}

/**
 * Makes reading localStorage and sessionStorage throw, as Chrome does for a site whose cookies the visitor blocked
 * @param {Window} win - window to block storage in
 * @returns {Function} puts the storage back
 */
function denyStorage(win) {
    var saved = {};
    ["localStorage", "sessionStorage"].forEach((name) => {
        saved[name] = Object.getOwnPropertyDescriptor(win, name);
        Object.defineProperty(win, name, {
            configurable: true,
            get() {
                throw new DOMException("Failed to read the '" + name + "' property from 'Window': Access is denied for this document.", "SecurityError");
            }
        });
    });
    return () => {
        ["localStorage", "sessionStorage"].forEach((name) => {
            if (saved[name]) {
                Object.defineProperty(win, name, saved[name]);
            }
            else {
                delete win[name];
            }
        });
    };
}

/**
 * Makes the browser report what navigator.globalPrivacyControl gives when the visitor turns Global Privacy Control on or off
 * @param {*} value - true for the signal on, false for off, undefined for a browser without Global Privacy Control
 */
function sendGpc(value) {
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, get: () => value });
}

/**
 * Starts the SDK against the test server
 * @param {Object} config - init options to add to the app key and the server URL
 */
function initWithServer(config) {
    Countly.init(Object.assign({ app_key: "YOUR_APP_KEY", url: "http://localhost:9000" }, config));
}

/**
 * Waits until the test server got a request with the given parameter, checking every 250 ms for up to 10 seconds
 * @param {String} key - request parameter to wait for
 * @param {Number} [tries] - checks left
 * @returns {Cypress.Chainable<Array<Object>>} the parameters of every request the server got, in the order they arrived
 */
function untilSent(key, tries) {
    var left = typeof tries === "number" ? tries : 40;
    return cy.task("getRequests").then((reqs) => {
        var sent = reqs.map((req) => hp.turnSearchStringToObject(req.body));
        if (left <= 0 || sent.some((params) => typeof params[key] !== "undefined")) {
            return sent;
        }
        return cy.wait(250).then(() => untilSent(key, left - 1));
    });
}

/**
 * The keys of the custom events in the given requests
 * @param {Array<Object>} sent - request parameters
 * @returns {Array<String>} event keys, in the order they were sent
 */
function customEventKeys(sent) {
    return sent.filter((params) => params.events)
        .reduce((keys, params) => keys.concat(params.events.map((e) => e.key)), [])
        .filter((key) => key.indexOf("[CLY]_") !== 0);
}

/**
 * Checks that the SDK needs no consent and that the test server gets an event recorded without it
 * @param {*} gpc - what navigator.globalPrivacyControl gives
 * @param {Object} config - init options to add
 * @param {String} key - key of the event to record
 */
function expectTrackedWithoutConsent(gpc, config, key) {
    hp.haltAndClearStorage(() => {
        sendGpc(gpc);
        cy.task("startServer").then(() => {
            initWithServer(config);
            expect(Countly.check_consent("events")).to.equal(true);
            Countly.add_event({ key: key });
        });
        untilSent("events").then((sent) => {
            expect(customEventKeys(sent)).to.deep.equal([key]);
        });
    });
}

/**
 * Starts the SDK with the consent requirement off, both in the behavior settings it starts with and in the server's answer
 * @param {Object} config - init options to add
 * @returns {Object} the request handler, holding the requests the SDK sent
 */
function initWithConsentRequirementOff(config) {
    var server = hp.createFakeRequestHandler({
        onRequest: (req) => ({ status: 200, responseText: JSON.stringify(req.functionName === "server_config" ? { v: 2, t: 1, c: { cr: false } } : { result: "Success" }) })
    });
    Countly.init(Object.assign({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        behavior_settings: { c: { cr: false } },
        fake_request_handler: server.handler
    }, config));
    return server;
}

var restoreStorage = null;
afterEach(() => {
    if (restoreStorage) {
        restoreStorage();
        restoreStorage = null;
    }
});

// tests
describe("Consent tests", () => {
    it("Only custom event should be sent to the queue", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["events"]);
            hp.events();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(1);
                consent_check(eq, hp.eventArray, true);
            });
        });
    });
    it("All but custom event should be sent to the queue", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback", "push", "clicks"]);
            hp.events();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(6);
                consent_check(eq, hp.eventArray, false, true);
            });
        });
    });
    it("All consents given and all events should be recorded", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback", "events", "push", "clicks"]);
            hp.events();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(7);
                consent_check(eq, hp.eventArray, false, false);
            });
        });
    });
    it("No consent required and all events should be recorded", () => {
        hp.haltAndClearStorage(() => {
            initMain(false);
            hp.events();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(7);
                consent_check(eq, hp.eventArray, false, false);
            });
        });
    });
    it("Non-merge ID change should reset all consents", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback", "push", "clicks"]);
            Countly.change_id("Richard Wagner II", false);
            hp.events();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(0);
            });
        });
    });
    it("Withdrawing a given consent is reported to the server", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["events"]);
            cy.wait(1500).then(() => {
                Countly.remove_consent("events");
                cy.wait(1500).then(() => {
                    cy.fetch_local_request_queue().then((rq) => {
                        var consents = rq.filter((r) => r.consent).map((r) => JSON.parse(r.consent));
                        expect(consents.length).to.equal(2);
                        expect(consents[0].events).to.equal(true);
                        expect(consents[1].events).to.equal(false);
                        expect(consents[1].views, "the request carries the whole consent state").to.equal(false);
                    });
                });
            });
        });
    });
    it("Withdrawing a consent that was never given sends nothing", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["events"]);
            cy.wait(1500).then(() => {
                Countly.remove_consent("views");
                cy.wait(1500).then(() => {
                    cy.fetch_local_request_queue().then((rq) => {
                        expect(rq.filter((r) => r.consent).length).to.equal(1);
                    });
                });
            });
        });
    });
    it("Non-merge ID change removes the consents without sending a consent request", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["events", "sessions"]);
            cy.wait(1500).then(() => {
                Countly.change_id("Richard Wagner III", false);
                cy.wait(1500).then(() => {
                    expect(Countly.check_consent("events"), "the consent is gone").to.equal(false);
                    cy.fetch_local_request_queue().then((rq) => {
                        expect(rq.filter((r) => r.consent).length, "only the consent request of the first user").to.equal(1);
                    });
                });
            });
        });
    });
    it("Merge ID change should not reset consents", () => {
        hp.haltAndClearStorage(() => {
            initMain(true);
            Countly.add_consent(["sessions", "views", "users", "star-rating", "apm", "feedback", "push", "clicks"]);
            Countly.change_id("Richard Wagner the second", true);
            hp.events();
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(6);
                consent_check(eq, hp.eventArray, false, true);
            });
        });
    });
    it("Starts with consent required when the browser refuses access to storage, as with cookies blocked", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            restoreStorage = denyStorage(window);
            expect(() => Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                require_consent: true,
                fake_request_handler: (req) => {
                    sent.push(req.params);
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            })).not.to.throw();
            Countly.add_consent("events");
            Countly.add_event({ key: "after_consent" });
            cy.wait(1500).then(() => {
                var keys = sent.filter((p) => p.events).reduce((all, p) => all.concat(JSON.parse(p.events).map((e) => e.key)), []);
                expect(keys).to.deep.equal(["after_consent"]);
            });
        });
    });
});

describe("Global Privacy Control", () => {
    afterEach(() => {
        delete navigator.globalPrivacyControl;
        cy.task("stopServer");
    });
    it("With honor_gpc, a visitor whose browser sends Global Privacy Control is tracked only once they consent", () => {
        hp.haltAndClearStorage(() => {
            sendGpc(true);
            cy.task("startServer").then(() => {
                initWithServer({ honor_gpc: true });
                expect(Countly.check_consent("events")).to.equal(false);
                expect(Countly.check_any_consent()).to.equal(false);
                Countly.begin_session();
                Countly.add_event({ key: "before_consent" });
                Countly.add_consent("events");
                Countly.add_event({ key: "after_consent" });
            });
            untilSent("events").then(() => untilSent("consent")).then((sent) => {
                expect(customEventKeys(sent)).to.deep.equal(["after_consent"]);
                expect(sent.filter((params) => params.begin_session).length, "no session without its consent").to.equal(0);
                var consents = sent.filter((params) => params.consent).map((params) => params.consent);
                expect(consents.length).to.equal(1);
                expect(consents[0].events).to.equal(true);
                expect(consents[0].sessions).to.equal(false);
            });
        });
    });
    it("With honor_gpc, a visitor whose browser does not send Global Privacy Control is tracked without consent", () => {
        expectTrackedWithoutConsent(false, { honor_gpc: true }, "no_signal");
    });
    it("With honor_gpc, a visitor whose browser has no Global Privacy Control is tracked without consent", () => {
        expectTrackedWithoutConsent(undefined, { honor_gpc: true }, "no_support");
    });
    it("Without honor_gpc, a visitor whose browser sends Global Privacy Control is tracked without consent", () => {
        expectTrackedWithoutConsent(true, {}, "not_honored");
    });
    it("A behavior setting that turns the consent requirement off keeps the one Global Privacy Control set", () => {
        hp.haltAndClearStorage(() => {
            sendGpc(true);
            var server = initWithConsentRequirementOff({ honor_gpc: true });
            expect(server.findByFunction("server_config").length, "the server answered").to.equal(1);
            expect(Countly.check_consent("events")).to.equal(false);
            Countly.add_event({ key: "before_consent" });
            expect(hp.waitingQueues().eventQ.length).to.equal(0);
        });
    });
    it("Without the signal, a behavior setting can still turn off the consent requirement of require_consent", () => {
        hp.haltAndClearStorage(() => {
            sendGpc(false);
            var server = initWithConsentRequirementOff({ honor_gpc: true, require_consent: true });
            expect(server.findByFunction("server_config").length, "the server answered").to.equal(1);
            expect(Countly.check_consent("events")).to.equal(true);
        });
    });
});