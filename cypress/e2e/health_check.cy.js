/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper");

function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        test_mode: true
    });
}

/**
 * Starts the SDK with a request handler that answers every request with success
 * @param {Array} sent - collects the parameters of every request
 * @param {Boolean} debug - print the SDK's logs
 * @param {Object=} extra - more init options
 */
function initSending(sent, debug, extra) {
    Countly.init(Object.assign({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        debug: !!debug,
        fake_request_handler: (req) => {
            sent.push(req.params);
            return { status: 200, responseText: "{\"result\":\"Success\"}" };
        }
    }, extra || {}));
}

/**
 * The health check parameters among the collected requests
 * @param {Array} sent - parameters of the requests
 * @returns {Array} the parsed "hc" parameters
 */
function healthChecks(sent) {
    return sent.filter((p) => p.hc).map((p) => JSON.parse(p.hc));
}

describe("Health Check tests", () => {
    afterEach(() => {
        cy.task("setResponseDelay", 0);
        cy.task("stopServer");
    });
    it("Check if health check is sent at the beginning", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            cy.intercept("POST", "https://your.domain.count.ly/i").as("postXhr");
            cy.wait("@postXhr").then((xhr) => {
                const body = xhr.request.body;
                const params = new URLSearchParams(body);

                const hcParam = params.get("hc");
                const hcParamObj = JSON.parse(decodeURIComponent(hcParam));
                // test_mode logs a warning, and the health check counts every warning
                expect(hcParamObj).to.eql({ el: 0, wl: 1, sc: -1, em: "", bom: 0, cbom: 0, fu: {}, lc: {} });

                const metricsParam = params.get("metrics");
                expect(metricsParam).to.equal("{\"_app_version\":\"0.0\",\"_ua\":\"abcd\"}");

                cy.fetch_local_request_queue().then((rq) => {
                    expect(rq.length).to.equal(0);
                });
            });
        });
    });
    it("Check no health check is sent in offline mode", () => {
        hp.haltAndClearStorage(() => {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                test_mode: true,
                offline_mode: true
            });

            cy.intercept("POST", "https://your.domain.count.ly/i").as("postXhr");
            cy.get('@postXhr').should('not.exist');
            cy.fetch_local_request_queue().then((rq) => {
                expect(rq.length).to.equal(0);
            });
        });
    });
    it("Sends nothing for an ignored visitor, so no user without a device ID is created", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                debug: true,
                ignore_visitor: true,
                remote_config: true,
                fake_request_handler: (req) => {
                    sent.push(req.functionName + " device_id:" + req.params.device_id);
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            Countly.fetch_remote_config();
            Countly.get_available_feedback_widgets(() => {});
            cy.wait(1500).then(() => {
                expect(sent.filter((request) => request.indexOf("device_id:undefined") !== -1)).to.deep.equal([]);
            });
        });
    });
    it("Reads the counters back from cookies with cookie storage", () => {
        hp.haltAndClearStorage(() => {
            document.cookie = "YOUR_APP_KEY/cly_hc_error_count=3; path=/";
            document.cookie = "YOUR_APP_KEY/cly_hc_warning_count=2; path=/";
            var sent = [];
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                storage: "cookie",
                fake_request_handler: (req) => {
                    sent.push(req.params);
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            // the health check of the page load reports what was read back
            cy.wait(500).then(() => {
                expect(healthChecks(sent).map((c) => [c.el, c.wl])).to.deep.equal([[3, 2]]);
            });
        });
    });
    it("Keeps the counters when the health check fails", () => {
        hp.haltAndClearStorage(() => {
            localStorage.setItem("YOUR_APP_KEY/cly_hc_error_count", "3");
            localStorage.setItem("YOUR_APP_KEY/cly_hc_warning_count", "2");
            var sent = [];
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                fake_request_handler: (req) => {
                    sent.push(req.params);
                    if (req.functionName === "[healthCheck]") {
                        return { status: 500, responseText: "{\"result\":\"Internal server error\"}" };
                    }
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            cy.wait(500).then(() => {
                expect(healthChecks(sent).map((c) => [c.el, c.wl])).to.deep.equal([[3, 2]]);
                expect(Countly.i.YOUR_APP_KEY.hcErrorCount).to.equal(3);
                expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.equal(2);
                // a refused health check is no SDK problem of its own: it does not add to the counters it reports
                window.dispatchEvent(new Event("pagehide"));
                expect(localStorage.getItem("YOUR_APP_KEY/cly_hc_error_count")).to.equal("3");
            });
        });
    });
    it("Takes away only what a delivered health check reported", () => {
        hp.haltAndClearStorage(() => {
            localStorage.setItem("YOUR_APP_KEY/cly_hc_warning_count", "2");
            var sent = [];
            initSending(sent);
            // logged before the health check of the page load goes out
            Countly.start_event("checkout");
            Countly.start_event("checkout");
            cy.wait(500).then(() => {
                expect(healthChecks(sent).map((c) => c.wl)).to.deep.equal([3]);
                expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.equal(0);
                expect(localStorage.getItem("YOUR_APP_KEY/cly_hc_warning_count")).to.equal("0");
            });
        });
    });
    it("Counts the SDK's errors and warnings when debug printing is off", () => {
        hp.haltAndClearStorage(() => {
            initSending([]);
            // a warning: the timed event is already running
            Countly.start_event("checkout");
            Countly.start_event("checkout");
            // a warning: an event without a key
            Countly.add_event({});
            // the counters of the running instance, Countly itself holds their values from init
            expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.equal(2);
            expect(Countly.i.YOUR_APP_KEY.hcErrorCount).to.equal(0);
        });
    });
    it("Stores the counters when the page is hidden, for the next page", () => {
        hp.haltAndClearStorage(() => {
            initSending([], true);
            Countly.start_event("checkout");
            Countly.start_event("checkout");
            Countly.add_event({});
            window.dispatchEvent(new Event("pagehide"));
            // what the next page reads back and reports in its health check
            expect(localStorage.getItem("YOUR_APP_KEY/cly_hc_error_count")).to.equal("0");
            expect(localStorage.getItem("YOUR_APP_KEY/cly_hc_warning_count")).to.equal("2");
            expect(JSON.parse(localStorage.getItem("YOUR_APP_KEY/cly_hc_log_codes"))).to.eql({ w722: 1, w701: 1 });
        });
    });
    it("Keeps the warnings logged while the health check is on its way for the next health check", () => {
        hp.haltAndClearStorage(() => {
            cy.task("setResponseDelay", 1000);
            cy.task("startServer").then(() => {
                Countly.init({
                    app_key: "YOUR_APP_KEY",
                    url: "http://localhost:9000"
                });
            });
            // the site's own code runs while the health check request is on its way
            cy.wait(300).then(() => {
                Countly.start_event("checkout");
                Countly.start_event("checkout");
            });
            cy.wait(2500).then(() => {
                expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.equal(1);
                expect(localStorage.getItem("YOUR_APP_KEY/cly_hc_warning_count")).to.equal("1");
            });
        });
    });
    it("Records the status and the plain message of a failed queued request", () => {
        hp.haltAndClearStorage(() => {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                fake_request_handler: (req) => {
                    if (req.functionName === "send_request_queue") {
                        return { status: 503, responseText: "{\"result\":\"Service Unavailable\"}" };
                    }
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            // recorded after the health check of the page load went out, so it waits for the next health check
            cy.wait(500).then(() => {
                Countly.add_event({ key: "fails_to_send" });
            });
            cy.wait(1500).then(() => {
                expect(Countly.i.YOUR_APP_KEY.hcStatusCode).to.equal(503);
                expect(Countly.i.YOUR_APP_KEY.hcErrorMessage).to.equal("{\"result\":\"Service Unavailable\"}");
            });
        });
    });
    it("Does not record failed immediate requests in the health check", () => {
        hp.haltAndClearStorage(() => {
            cy.intercept("POST", "https://your.domain.count.ly/i", { statusCode: 200, body: "{\"result\":\"Success\"}" });
            // the server configuration request at start fails
            cy.intercept("POST", "https://your.domain.count.ly/o/sdk", { statusCode: 503, body: "{\"result\":\"Service Unavailable\"}" }).as("serverConfig").then(() => {
                Countly.init({
                    app_key: "YOUR_APP_KEY",
                    url: "https://your.domain.count.ly"
                });
            });
            cy.wait("@serverConfig");
            cy.wait(500).then(() => {
                expect(Countly.i.YOUR_APP_KEY.hcStatusCode).to.equal(-1);
                expect(Countly.i.YOUR_APP_KEY.hcErrorCount).to.equal(0);
            });
        });
    });
    it("Does not record a failed request that got no HTTP answer", () => {
        hp.haltAndClearStorage(() => {
            cy.intercept("https://your.domain.count.ly/**", { forceNetworkError: true }).then(() => {
                Countly.init({
                    app_key: "YOUR_APP_KEY",
                    url: "https://your.domain.count.ly"
                });
                Countly.add_event({ key: "connection_lost" });
            });
            cy.wait(2000).then(() => {
                expect(Countly.i.YOUR_APP_KEY.hcStatusCode).to.equal(-1);
            });
        });
    });
    it("Sends no health check with disable_health_check, and still counts", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                disable_health_check: true,
                fake_request_handler: (req) => {
                    sent.push(req);
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            Countly.add_event({});
            cy.wait(1000).then(() => {
                expect(sent.filter((r) => r.params.hc), "health check requests").to.have.length(0);
                expect(sent.filter((r) => r.functionName === "server_config"), "the other start-up requests still go out").to.have.length(1);
                expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.be.at.least(1);
            });
        });
    });
    it("Sends the health check when a new session begins, once per page", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            initSending(sent);
            Countly.track_sessions();
            Countly.end_session(null, true);
            Countly.begin_session(false, true);
            cy.wait(1000).then(() => {
                var checks = healthChecks(sent);
                expect(checks).to.have.length(1);
                expect(checks[0].fu.sessions).to.eql({ "begin:a": 1 });
            });
        });
    });
    it("Sends no health check on a page that continues the session of the visit", () => {
        hp.haltAndClearStorage(() => {
            // the visit's session cookie of an earlier page, valid for another 10 minutes
            localStorage.setItem("YOUR_APP_KEY/cly_session", JSON.stringify(Math.round(Date.now() / 1000) + 600));
            var sent = [];
            initSending(sent);
            Countly.track_sessions();
            cy.wait(1500).then(() => {
                expect(healthChecks(sent)).to.have.length(0);
            });
        });
    });
    it("Reports the method usage of the event, view and crash features", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            initSending(sent);
            Countly.add_event({ key: "a" });
            Countly.add_event({ key: "b", count: 2 });
            Countly.start_event("timed");
            Countly.end_event("timed");
            Countly.start_event("cancelled");
            Countly.cancel_event("cancelled");
            Countly.track_pageview("page_one");
            Countly.track_view("page_two");
            Countly.add_log("crumb");
            Countly.log_error(new Error("handled"));
            cy.wait(500).then(() => {
                var checks = healthChecks(sent);
                expect(checks).to.have.length(1);
                expect(checks[0].fu).to.eql({
                    events: { record: 2, start: 2, end: 1, cancel: 1 },
                    views: { start: 2 },
                    crashes: { log: 1, record: 1 }
                });
            });
        });
    });
    it("Reports out of order manual session calls as w760", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            initSending(sent);
            Countly.session_duration(10);
            Countly.end_session(10);
            Countly.begin_session(false, true);
            Countly.begin_session(false, true);
            cy.wait(500).then(() => {
                var checks = healthChecks(sent);
                expect(checks).to.have.length(1);
                expect(checks[0].fu.sessions).to.eql({ update: 1, end: 1, begin: 1 });
                expect(checks[0].lc).to.eql({ w760: 2 });
                expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.be.at.least(1);
            });
        });
    });
    it("Counts nothing about a feature without consent while consent is required", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            initSending(sent, false, { require_consent: true });
            Countly.add_event({ key: "blocked" });
            Countly.add_event({});
            Countly.track_pageview("blocked");
            Countly.add_consent("nope");
            cy.wait(500).then(() => {
                var checks = healthChecks(sent);
                expect(checks).to.have.length(1);
                expect(checks[0].fu).to.eql({});
                expect(checks[0].lc).to.eql({ w402: 1 });
            });
        });
    });
    it("Reports a key cut to the key length limit as w201", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            initSending(sent, false, { max_key_length: 5 });
            Countly.add_event({ key: "a_long_event_key" });
            cy.wait(500).then(() => {
                var checks = healthChecks(sent);
                expect(checks[0].lc.w201).to.equal(1);
            });
        });
    });
    it("Reports the app version set through the metrics option", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            initSending(sent, false, { metrics: { _app_version: "2.3.0" } });
            cy.wait(500).then(() => {
                var check = sent.filter((p) => p.hc)[0];
                expect(JSON.parse(check.metrics)._app_version).to.equal("2.3.0");
            });
        });
    });
    it("Keeps the counters for the next page while the behavior settings turn networking off", () => {
        hp.haltAndClearStorage(() => {
            localStorage.setItem("YOUR_APP_KEY/cly_hc_warning_count", "4");
            var sent = [];
            initSending(sent, false, { behavior_settings: { v: 1, t: 1, c: { networking: false } }, disable_sdk_behavior_settings_updates: true });
            cy.wait(500).then(() => {
                expect(healthChecks(sent)).to.have.length(0);
                expect(Countly.i.YOUR_APP_KEY.hcWarningCount).to.be.at.least(4);
            });
        });
    });
});
