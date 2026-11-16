/* eslint-disable cypress/no-unnecessary-waiting */
/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper");

var contentAnswer = JSON.stringify({ html: "https://your.domain.count.ly/_external/content?id=1", geo: { l: { x: 0, y: 0, w: 100, h: 100 }, p: { x: 0, y: 0, w: 100, h: 100 } } });

// what a request was for, so a test can check what went out and in which order
function kindOf(req) {
    var p = req.params || {};
    if (p.method === "queue") {
        return "content";
    }
    if (p.method === "sc") {
        return "settings";
    }
    if (p.begin_session) {
        return "begin_session";
    }
    if (p.user_details) {
        return "user_details";
    }
    if (p.crash) {
        return "crash";
    }
    if (p.consent) {
        return "consent";
    }
    if (p.events) {
        return "events:" + JSON.parse(p.events).map((e) => e.key + (e.segmentation && e.segmentation.name ? "=" + e.segmentation.name : "")).join(",");
    }
    return "other";
}

// starts the SDK with the given behavior settings answer and records what it sends and logs; content requests get
// content only while hasContent() says so. The app enters the content zone unless extra.noZone is set
function initWith(settings, extra, hasContent) {
    var run = { sent: [], logs: [] };
    var options = Object.assign({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        debug: true,
        behavior_settings: settings,
        disable_sdk_behavior_settings_updates: true,
        log_listener: (message) => {
            run.logs.push(message);
        },
        fake_request_handler: (req) => {
            run.sent.push(kindOf(req));
            if (req.params && req.params.method === "queue") {
                return { status: 200, responseText: hasContent && hasContent() ? contentAnswer : "{}" };
            }
            return { status: 200, responseText: "{\"result\":\"Success\"}" };
        }
    }, extra || {});
    delete options.noZone;
    Countly.init(options);
    if (!(extra && extra.noZone)) {
        Countly.content.enterContentZone();
    }
    return run;
}

function contentRequests(run) {
    return run.sent.filter((kind) => kind === "content").length;
}

// how many times the SDK matched the given key as a content trigger
function matches(run, key) {
    return run.logs.filter((m) => m.indexOf("journeyTrigger, Matched journey trigger event: [" + key + "]") !== -1).length;
}

// waits for the zone's own first fetch, about 4 s after init, so that what follows is the triggers' doing
function afterZoneEntered(run) {
    return hp.waitForContentZone(() => contentRequests(run) >= 1, "the zone made its first fetch");
}

// the first request whose kind starts with the given text comes before the first content request after `from`
function sentBefore(run, kind, from) {
    var at = run.sent.findIndex((k, i) => i >= from && k.indexOf(kind) === 0);
    var content = run.sent.findIndex((k, i) => i >= from && k === "content");
    return at !== -1 && content !== -1 && at < content;
}

describe("Content triggers", () => {
    afterEach(() => {
        document.querySelectorAll("#cly-content-iframe").forEach((frame) => frame.remove());
    });

    it("sends a listed event right away and then asks for content", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["purchase"] } } });
            var from;
            afterZoneEntered(run).then(() => {
                from = run.sent.length;
                Countly.add_event({ key: "purchase" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "purchase"), "matched").to.equal(1);
                expect(run.sent.slice(from).indexOf("content"), "a content request after the trigger").to.not.equal(-1);
            }).then(() => {
                expect(sentBefore(run, "events:purchase", from), "the event went out first: " + run.sent.join(" | ")).to.equal(true);
            });
        });
    });

    it("shows the content the server answers with", () => {
        var triggered = false;
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["purchase"] } } }, {}, () => triggered);
            afterZoneEntered(run).then(() => {
                triggered = true;
                Countly.add_event({ key: "purchase" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(document.getElementById("cly-content-iframe"), "the content").to.exist;
            });
        });
    });

    it("does not ask for content for an event that is not listed", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["purchase"] } } });
            var before;
            afterZoneEntered(run).then(() => {
                before = contentRequests(run);
                Countly.add_event({ key: "browse" });
            });
            cy.wait(2500).then(() => {
                expect(contentRequests(run), "content requests").to.equal(before);
                expect(matches(run, "browse"), "matched").to.equal(0);
            });
        });
    });

    it("does not use the content triggers while the app does not want the content zone, but follows the journey trigger events", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["purchase"] }, jte: ["legacy_start"] } }, { noZone: true });
            cy.wait(1000).then(() => {
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(2500).then(() => {
                expect(contentRequests(run), "content requests for a content trigger").to.equal(0);
                Countly.add_event({ key: "legacy_start" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(contentRequests(run), "content requests for a journey trigger event").to.be.greaterThan(0);
            });
        });
    });

    it("asks for content for a view whose name is listed, and not for other views", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { v: ["Checkout"] } } });
            var before;
            afterZoneEntered(run).then(() => {
                before = contentRequests(run);
                Countly.track_pageview("Home");
            });
            cy.wait(2500).then(() => {
                expect(contentRequests(run), "content requests for another view").to.equal(before);
                Countly.track_pageview("Checkout");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched").to.equal(1);
                expect(contentRequests(run), "content requests for the listed view").to.be.greaterThan(before);
            }).then(() => {
                expect(run.sent.filter((k) => k.indexOf("[CLY]_view=Checkout") !== -1).length, "the listed view was sent: " + run.sent.join(" | ")).to.be.greaterThan(0);
            });
        });
    });

    it("asks for content when a view of any name starts, but not when it ends", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["[CLY]_view"] } } });
            afterZoneEntered(run).then(() => {
                Countly.track_pageview("First");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched the first view").to.equal(1);
            });
            // the asking ends after its third answer without content
            cy.wait(3000).then(() => {
                // ends the first view and starts the second one
                Countly.track_pageview("Second");
            });
            cy.wait(1500).then(() => {
                expect(matches(run, "[CLY]_view"), "one match for the second view, none for the end of the first").to.equal(2);
            });
        });
    });

    it("sends the beginning of a new session right away and then asks for content", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["[CLY]_session"] } } });
            var from;
            afterZoneEntered(run).then(() => {
                from = run.sent.length;
                Countly.begin_session();
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_session"), "matched").to.equal(1);
                expect(run.sent.slice(from).indexOf("content"), "a content request after the trigger").to.not.equal(-1);
            }).then(() => {
                expect(sentBefore(run, "begin_session", from), "the session began first: " + run.sent.join(" | ")).to.equal(true);
            });
        });
    });

    it("does not ask for content on a page that continues the session of the visit", () => {
        var settings = { c: { jt: { e: ["[CLY]_session"] } } };
        hp.haltAndClearStorage(() => {
            initWith(settings);
            Countly.begin_session();
            cy.wait(3500).then(() => {
                // the next page of the same visit, while the session cookie is valid
                Countly.halt();
                var run = initWith(settings);
                Countly.begin_session();
                cy.wait(2500).then(() => {
                    expect(run.sent.indexOf("begin_session"), "a new session: " + run.sent.join(" | ")).to.equal(-1);
                    expect(matches(run, "[CLY]_session"), "matched").to.equal(0);
                    expect(contentRequests(run), "content requests").to.equal(0);
                });
            });
        });
    });

    it("asks for content when user properties are sent, by user_details and by userData.save", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["[CLY]_property_update"] } } });
            var from;
            afterZoneEntered(run).then(() => {
                from = run.sent.length;
                Countly.user_details({ name: "Content Trigger" });
            });
            cy.window({ timeout: 2500 }).should(() => {
                expect(matches(run, "[CLY]_property_update"), "matched user_details").to.equal(1);
                expect(run.sent.slice(from).indexOf("content"), "a content request after user_details").to.not.equal(-1);
            }).then(() => {
                expect(sentBefore(run, "user_details", from), "the details went out first: " + run.sent.join(" | ")).to.equal(true);
            });
            // the asking ends after its third answer without content
            cy.wait(3000).then(() => {
                Countly.userData.set("plan", "pro");
                Countly.userData.save();
            });
            cy.window({ timeout: 2500 }).should(() => {
                expect(matches(run, "[CLY]_property_update"), "matched userData.save").to.equal(2);
            });
        });
    });

    it("sends a recorded error right away and then asks for content", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["[CLY]_crash"] } } });
            var from;
            afterZoneEntered(run).then(() => {
                from = run.sent.length;
                Countly.recordError(new Error("content trigger error"), true);
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_crash"), "matched").to.equal(1);
                expect(run.sent.slice(from).indexOf("content"), "a content request after the error").to.not.equal(-1);
            }).then(() => {
                expect(sentBefore(run, "crash", from), "the error went out first: " + run.sent.join(" | ")).to.equal(true);
            });
        });
    });

    it("sends a consent change right away and then asks for content", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["[CLY]_consent"] } } }, { require_consent: true });
            var from;
            cy.wait(500).then(() => {
                from = run.sent.length;
                Countly.add_consent(["content", "sessions"]);
            });
            // the consent request is queued a second after the change
            cy.window({ timeout: 3000 }).should(() => {
                expect(matches(run, "[CLY]_consent"), "matched").to.equal(1);
                expect(run.sent.slice(from).indexOf("content"), "a content request after the consent").to.not.equal(-1);
            }).then(() => {
                expect(sentBefore(run, "consent", from), "the consent went out first: " + run.sent.join(" | ")).to.equal(true);
            });
        });
    });

    it("does not ask for content without the content consent", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["purchase"] } } }, { require_consent: true });
            Countly.add_consent(["events"]);
            cy.wait(1500).then(() => {
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(2500).then(() => {
                expect(contentRequests(run), "content requests").to.equal(0);
            });
        });
    });

    it("asks for content for a session that began before the behavior settings arrived", () => {
        var content = 0;
        cy.intercept("https://jt.count.ly/**", (req) => {
            var query = new URLSearchParams(req.url.split("?")[1] || "");
            var body = new URLSearchParams(typeof req.body === "string" ? req.body : "");
            var method = query.get("method") || body.get("method");
            if (method === "sc") {
                req.reply({ delay: 800, statusCode: 200, body: { v: 2, t: Date.now(), c: { jt: { e: ["[CLY]_session"] } } } });
                return;
            }
            if (method === "queue") {
                content++;
                req.reply({ statusCode: 200, body: {} });
                return;
            }
            req.reply({ statusCode: 200, body: { result: "Success" } });
        });
        hp.haltAndClearStorage(() => {
            Countly.init({ app_key: "YOUR_APP_KEY", url: "https://jt.count.ly", debug: true });
            Countly.content.enterContentZone();
            Countly.begin_session();
            expect(content, "content requests before the settings arrived").to.equal(0);
            // well before the zone's own first fetch, 4 s after init
            cy.window({ timeout: 3000 }).should(() => {
                expect(content, "content requests once the settings arrived").to.be.greaterThan(0);
            });
        });
    });

    it("stops asking for content once a behavior settings answer has no content triggers", () => {
        hp.haltAndClearStorage(() => {
            var run = { sent: [], logs: [] };
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                debug: true,
                behavior_settings: { c: { jt: { e: ["purchase"] } } },
                log_listener: (message) => {
                    run.logs.push(message);
                },
                fake_request_handler: (req) => {
                    run.sent.push(kindOf(req));
                    if (req.params && req.params.method === "sc") {
                        return { status: 200, responseText: JSON.stringify({ v: 2, t: Date.now(), c: {} }) };
                    }
                    if (req.params && req.params.method === "queue") {
                        return { status: 200, responseText: "{}" };
                    }
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            Countly.content.enterContentZone();
            var before;
            afterZoneEntered(run).then(() => {
                expect(run.sent.indexOf("settings"), "the settings were fetched").to.not.equal(-1);
                before = contentRequests(run);
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(2500).then(() => {
                expect(contentRequests(run), "content requests").to.equal(before);
                expect(matches(run, "purchase"), "matched").to.equal(0);
            });
        });
    });

    it("ignores the content triggers with disable_auto_content_triggers, but still follows the journey trigger events", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jt: { e: ["purchase", "[CLY]_session"], v: ["Checkout"] }, jte: ["legacy_start"] } }, { disable_auto_content_triggers: true });
            var before;
            afterZoneEntered(run).then(() => {
                before = contentRequests(run);
                Countly.add_event({ key: "purchase" });
                Countly.track_pageview("Checkout");
                Countly.begin_session();
            });
            cy.wait(2500).then(() => {
                expect(contentRequests(run), "content requests for the content triggers").to.equal(before);
                Countly.add_event({ key: "legacy_start" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "legacy_start"), "matched the journey trigger event").to.equal(1);
                expect(contentRequests(run), "content requests for a journey trigger event").to.be.greaterThan(before);
            });
        });
    });

    [
        ["a list instead of an object", ["purchase"], "Content triggers (jt) must be an object"],
        ["a text instead of a list", { e: "purchase" }, "Content triggers (jt) list [e] must be an array"]
    ].forEach(([what, jt, warning]) => {
        it("ignores content triggers given as " + what + ", with a warning", () => {
            var warnings = [];
            hp.haltAndClearStorage(() => {
                var run = initWith({ c: { jt: jt } }, {
                    log_listener: (message, level) => {
                        if (level === "warning") {
                            warnings.push(message);
                        }
                    }
                });
                var before;
                afterZoneEntered(run).then(() => {
                    before = contentRequests(run);
                    Countly.add_event({ key: "purchase" });
                });
                cy.wait(2500).then(() => {
                    expect(contentRequests(run), "content requests").to.equal(before);
                    expect(warnings.filter((m) => m.indexOf(warning) !== -1).length, "the warning: " + warnings.join(" | ")).to.be.greaterThan(0);
                });
            });
        });
    });
});
