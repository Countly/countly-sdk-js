/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var Utils = require("../../modules/Utils.js");
var hp = require("../support/helper.js");

const SERVER = "https://gzip.count.ly";
const OTHER_SERVER = "https://other-gzip.count.ly";
const BIG = "a".repeat(2000);

var originalOpen;
var originalSend;

/**
 * Wraps XMLHttpRequest so the test sees the URL and the exact body the SDK hands to the browser.
 * @param {Array} sent - receives {url, body} for every request, in order
 */
function captureRequests(sent) {
    originalOpen = XMLHttpRequest.prototype.open;
    originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.clyTestUrl = url;
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
        sent.push({ url: this.clyTestUrl, body: body });
        return originalSend.apply(this, arguments);
    };
}

/**
 * Answers the requests to a server: the behavior settings request with "gzip": true when the server reads gzip and the
 * request asked for it, the first compressed request with 400 while refuseNextCompressed is set, everything else with
 * success.
 * @param {String} server - the server URL
 * @param {Object} behavior - {readsGzip, refuseNextCompressed}
 */
function serve(server, behavior) {
    cy.intercept(server + "/**", (req) => {
        var text = typeof req.body === "string" ? req.body : "";
        if (text.indexOf("method=sc") !== -1) {
            var answer = { v: 2, t: Date.now(), c: {} };
            if (behavior.readsGzip && text.indexOf("gzip=1") !== -1) {
                answer.gzip = true;
            }
            req.reply({ statusCode: 200, body: answer });
            return;
        }
        if (req.url.indexOf("content_encoding=gzip") !== -1 && behavior.refuseNextCompressed) {
            behavior.refuseNextCompressed = false;
            req.reply({ statusCode: 400, body: { result: "Missing parameter \"app_key\" or \"device_id\"" } });
            return;
        }
        req.reply({ statusCode: 200, body: { result: "Success" } });
    });
}

function initWith(extra) {
    Countly.init(Object.assign({
        app_key: "YOUR_APP_KEY",
        url: SERVER,
        device_id: "gzip-device",
        max_value_size: 3000,
        fail_timeout: 1,
        enable_orientation_tracking: false
    }, extra || {}));
}

function settingsRequests(sent) {
    return sent.filter((r) => typeof r.body === "string" && r.body.indexOf("method=sc") !== -1);
}

function requestsWith(sent, marker) {
    return sent.filter((r) => typeof r.body === "string" ? r.body.indexOf(marker) !== -1 : r.decoded && r.decoded.indexOf(marker) !== -1);
}

function gunzip(bytes) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

function waitForSettingsAnswer(sent) {
    cy.window({ timeout: 5000 }).should(() => {
        expect(settingsRequests(sent).length).to.be.greaterThan(0);
    });
    return cy.wait(500);
}

function addBigEvent(key) {
    Countly.add_event({ key: key, count: 1, segmentation: { payload: BIG } });
}

/**
 * Waits until a request carrying the marker was sent, decoding compressed bodies on the way.
 * @param {Array} sent - the captured requests
 * @param {String} marker - text the plain body contains
 * @returns {Cypress.Chainable} yields the matching requests
 */
function waitForRequest(sent, marker) {
    return cy.window({ timeout: 8000 }).should(() => {
        var pending = sent.filter((r) => r.body instanceof Uint8Array && !r.decoded);
        pending.forEach((r) => {
            gunzip(r.body).then((text) => {
                r.decoded = text;
            });
        });
        expect(requestsWith(sent, marker).length).to.be.greaterThan(0);
    }).then(() => requestsWith(sent, marker));
}

describe("Request compression", () => {
    afterEach(() => {
        if (originalOpen) {
            XMLHttpRequest.prototype.open = originalOpen;
            XMLHttpRequest.prototype.send = originalSend;
            originalOpen = undefined;
            originalSend = undefined;
        }
    });

    it("does not ask for gzip and sends plain bodies without enable_request_compression", () => {
        var sent = [];
        serve(SERVER, { readsGzip: true });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith();
            waitForSettingsAnswer(sent).then(() => {
                expect(settingsRequests(sent)[0].body).to.not.contain("gzip=1");
                addBigEvent("big_plain");
            });
            waitForRequest(sent, "big_plain").then((found) => {
                expect(found[0].url).to.equal(SERVER + "/i");
                expect(typeof found[0].body).to.equal("string");
            });
        });
    });

    it("sends a body of at least 1 KB gzip-compressed to the marked URL once the server says it reads gzip", () => {
        var sent = [];
        serve(SERVER, { readsGzip: true });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith({ enable_request_compression: true });
            waitForSettingsAnswer(sent).then(() => {
                expect(settingsRequests(sent)[0].body).to.contain("gzip=1");
                addBigEvent("big_compressed");
            });
            waitForRequest(sent, "big_compressed").then((found) => {
                var request = found[0];
                expect(request.url).to.equal(SERVER + "/i?content_encoding=gzip");
                expect(request.body).to.be.instanceOf(Uint8Array);
                expect(request.body[0]).to.equal(0x1f);
                expect(request.body[1]).to.equal(0x8b);
                expect(request.body.length).to.be.lessThan(request.decoded.length);
                var params = new URLSearchParams(request.decoded);
                expect(params.get("app_key")).to.equal("YOUR_APP_KEY");
                expect(params.get("device_id")).to.equal("gzip-device");
                expect(JSON.parse(params.get("events"))[0].segmentation.payload).to.equal(BIG);
            });
        });
    });

    it("keeps a body under 1 KB plain while compression is active", () => {
        var sent = [];
        serve(SERVER, { readsGzip: true });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith({ enable_request_compression: true });
            waitForSettingsAnswer(sent).then(() => {
                Countly.add_event({ key: "small_plain", count: 1 });
            });
            waitForRequest(sent, "small_plain").then((found) => {
                expect(typeof found[0].body).to.equal("string");
                expect(found[0].body.length).to.be.lessThan(1024);
                expect(found[0].url).to.equal(SERVER + "/i");
            });
        });
    });

    it("sends plain bodies when the settings answer has no gzip key", () => {
        var sent = [];
        serve(SERVER, { readsGzip: false });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith({ enable_request_compression: true });
            waitForSettingsAnswer(sent).then(() => {
                expect(settingsRequests(sent)[0].body).to.contain("gzip=1");
                addBigEvent("big_old_server");
            });
            waitForRequest(sent, "big_old_server").then((found) => {
                expect(found[0].url).to.equal(SERVER + "/i");
                expect(typeof found[0].body).to.equal("string");
            });
        });
    });

    it("sends the retry and later requests plain after a compressed request is refused", () => {
        var sent = [];
        serve(SERVER, { readsGzip: true, refuseNextCompressed: true });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith({ enable_request_compression: true });
            waitForSettingsAnswer(sent).then(() => {
                addBigEvent("big_refused");
            });
            cy.window({ timeout: 10000 }).should(() => {
                sent.filter((r) => r.body instanceof Uint8Array && !r.decoded).forEach((r) => {
                    gunzip(r.body).then((text) => {
                        r.decoded = text;
                    });
                });
                expect(requestsWith(sent, "big_refused").length).to.be.at.least(2);
            }).then(() => {
                var attempts = requestsWith(sent, "big_refused");
                expect(attempts[0].url).to.equal(SERVER + "/i?content_encoding=gzip");
                expect(attempts[1].url).to.equal(SERVER + "/i");
                expect(typeof attempts[1].body).to.equal("string");
                addBigEvent("big_after_refusal");
            });
            waitForRequest(sent, "big_after_refusal").then((found) => {
                expect(found[0].url).to.equal(SERVER + "/i");
                expect(typeof found[0].body).to.equal("string");
            });
        });
    });

    it("does not store the gzip answer with the behavior settings", () => {
        var sent = [];
        serve(SERVER, { readsGzip: true });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith({ enable_request_compression: true });
            waitForSettingsAnswer(sent);
            cy.window().then((win) => {
                var keys = Object.keys(win.localStorage).filter((key) => key.indexOf("cly_config") !== -1);
                expect(keys.length).to.be.greaterThan(0);
                keys.forEach((key) => {
                    expect(win.localStorage.getItem(key)).to.not.contain("gzip");
                });
            });
        });
    });

    it("sends plain bodies after change_server_url until the new server says it reads gzip", () => {
        var sent = [];
        serve(SERVER, { readsGzip: true });
        serve(OTHER_SERVER, { readsGzip: false });
        hp.haltAndClearStorage(() => {
            captureRequests(sent);
            initWith({ enable_request_compression: true });
            waitForSettingsAnswer(sent).then(() => {
                Countly.change_server_url(OTHER_SERVER);
                addBigEvent("big_other_server");
            });
            waitForRequest(sent, "big_other_server").then((found) => {
                expect(found[0].url).to.equal(OTHER_SERVER + "/i");
                expect(typeof found[0].body).to.equal("string");
            });
        });
    });

    it("gzipRequestBody leaves bodies under 1 KB and non-strings alone, and compresses bigger ones", () => {
        var big = "b".repeat(1024);
        cy.wrap(Utils.gzipRequestBody("b".repeat(1023))).should("equal", null);
        cy.wrap(Utils.gzipRequestBody(null)).should("equal", null);
        cy.wrap(Utils.gzipRequestBody(big)).then((compressed) => {
            expect(compressed).to.be.instanceOf(Uint8Array);
            expect(compressed.length).to.be.lessThan(big.length);
            return gunzip(compressed);
        }).should("equal", big);
    });
});
