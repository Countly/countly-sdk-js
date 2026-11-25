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

    it("asks the server for the content triggers, unless disable_auto_content_triggers is set", () => {
        var asked = [];
        // starts the SDK with behavior settings updates on and keeps the jt parameter of its settings requests
        function start(extra) {
            Countly.init(Object.assign({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                fake_request_handler: (req) => {
                    if (req.params && req.params.method === "sc") {
                        asked.push(req.params.jt);
                        return { status: 200, responseText: JSON.stringify({ v: 2, t: Date.now(), c: {} }) };
                    }
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            }, extra || {}));
        }
        hp.haltAndClearStorage(() => {
            start();
            cy.window({ timeout: 2000 }).should(() => {
                expect(asked, "the settings request").to.deep.equal([1]);
            }).then(() => {
                Countly.halt();
                start({ disable_auto_content_triggers: true });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(asked, "the settings requests").to.deep.equal([1, undefined]);
            });
        });
    });

    it("sends a listed event right away and then asks for content", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { e: ["purchase"] } });
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
            var run = initWith({ c: {}, jt: { e: ["purchase"] } }, {}, () => triggered);
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
            var run = initWith({ c: {}, jt: { e: ["purchase"] } });
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

    it("does not use the content triggers while the app does not want the content zone", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { e: ["purchase"] } }, { noZone: true });
            cy.wait(1000).then(() => {
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(2500).then(() => {
                expect(matches(run, "purchase"), "matched").to.equal(0);
                expect(contentRequests(run), "content requests").to.equal(0);
            });
        });
    });

    it("ignores the journey trigger events once the server sent content triggers, even empty ones", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jte: ["legacy_start"] }, jt: {} });
            var before;
            afterZoneEntered(run).then(() => {
                before = contentRequests(run);
                Countly.add_event({ key: "legacy_start" });
            });
            cy.wait(2500).then(() => {
                expect(matches(run, "legacy_start"), "matched").to.equal(0);
                expect(contentRequests(run), "content requests").to.equal(before);
            });
        });
    });

    it("follows the journey trigger events of a server that sends no content triggers, also outside the content zone", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jte: ["legacy_start"] } }, { noZone: true });
            cy.wait(1000).then(() => {
                Countly.add_event({ key: "legacy_start" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "legacy_start"), "matched").to.equal(1);
                expect(contentRequests(run), "content requests for a journey trigger event").to.be.greaterThan(0);
            });
        });
    });

    it("follows only the events of the app in the journey trigger events", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jte: ["[CLY]_session", "legacy_start"] } }, { noZone: true });
            cy.wait(1000).then(() => {
                Countly.begin_session();
            });
            cy.wait(1500).then(() => {
                expect(matches(run, "[CLY]_session"), "matched the session").to.equal(0);
                expect(contentRequests(run), "content requests for the session").to.equal(0);
                Countly.add_event({ key: "legacy_start" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "legacy_start"), "matched the event of the app").to.equal(1);
            });
        });
    });

    it("follows the journey trigger views of a server that sends no content triggers, when a view starts and when it ends", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jtv: ["Checkout"] } }, { noZone: true });
            cy.wait(1000).then(() => {
                Countly.track_pageview("Home");
            });
            cy.wait(1500).then(() => {
                expect(matches(run, "[CLY]_view"), "matched another view").to.equal(0);
                Countly.track_pageview("Checkout");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched the start of the listed view").to.equal(1);
                expect(contentRequests(run), "content requests for the listed view").to.be.greaterThan(0);
            });
            // the asking ends after its third answer without content
            cy.wait(3000).then(() => {
                Countly.track_pageview("Home");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched the end of the listed view").to.equal(2);
            });
        });
    });

    it("keeps and sends nothing for a journey trigger event recorded through a halted instance", () => {
        hp.haltAndClearStorage(() => {
            initWith({ c: { jte: ["legacy_start"] } }, { noZone: true });
            cy.wait(1000).then(() => {
                Countly.halt();
                // until the next init, Countly still calls the halted instance
                Countly.add_event({ key: "legacy_start" });
            });
            cy.wait(1500).then(() => {
                expect(Object.keys(localStorage).filter((key) => key.indexOf("cly_ct_gaps") !== -1), "trigger times kept after the halt").to.deep.equal([]);
                expect(Countly._internals.testingGetRequests(), "requests after the halt").to.deep.equal([]);
            });
        });
    });

    it("asks for content for a view whose name is listed, and not for other views", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { v: ["Checkout"] } });
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

    it("asks for content when a listed view starts and again when it ends, each with its own gap", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { v: ["First", "Second"] } });
            afterZoneEntered(run).then(() => {
                Countly.track_pageview("First");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched the start of the first view").to.equal(1);
            });
            // the asking ends after its third answer without content
            cy.wait(3000).then(() => {
                // ends the first view and starts the second one
                Countly.track_pageview("Second");
            });
            cy.wait(1500).then(() => {
                expect(matches(run, "[CLY]_view"), "a match for the end of the first view and one for the start of the second").to.equal(3);
                // ends the second view and starts the first one again, inside the gap of its start
                Countly.track_pageview("First");
            });
            cy.wait(1500).then(() => {
                expect(matches(run, "[CLY]_view"), "a match for the end of the second view only").to.equal(4);
            });
        });
    });

    it("asks again for a view of any name only after 60 seconds, also on the next page", () => {
        var settings = { c: {}, jt: { e: ["[CLY]_view"] } };
        var offset = 0;
        var realNow = Date.now.bind(Date);
        hp.haltAndClearStorage(() => {
            cy.stub(Date, "now").callsFake(() => realNow() + offset);
            var run = initWith(settings);
            afterZoneEntered(run).then(() => {
                Countly.track_pageview("A");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched the first view").to.equal(1);
            });
            cy.wait(3000).then(() => {
                Countly.track_pageview("B");
            });
            cy.wait(1000).then(() => {
                expect(matches(run, "[CLY]_view"), "a match for the end of the first view, which has its own gap, and none for the start of a view inside the gap").to.equal(2);
                expect(run.logs.filter((m) => m.indexOf("asked for content less than 60 seconds ago") !== -1).length, "the gap was logged").to.be.greaterThan(0);
                // the next page of the website
                Countly.halt();
                run = initWith(settings);
            });
            cy.wait(1000).then(() => {
                Countly.track_pageview("C");
            });
            cy.wait(1000).then(() => {
                expect(matches(run, "[CLY]_view"), "no match on the next page inside the gap").to.equal(0);
                offset = 61000;
                Countly.track_pageview("D");
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "[CLY]_view"), "matched the end of a view and the start of the next once the gaps passed").to.equal(2);
            });
        });
    });

    it("asks again for the same listed event only after 10 seconds", () => {
        var offset = 0;
        var realNow = Date.now.bind(Date);
        hp.haltAndClearStorage(() => {
            cy.stub(Date, "now").callsFake(() => realNow() + offset);
            var run = initWith({ c: {}, jt: { e: ["purchase"] } });
            afterZoneEntered(run).then(() => {
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(3000).then(() => {
                expect(matches(run, "purchase"), "matched the first purchase").to.equal(1);
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(1000).then(() => {
                expect(matches(run, "purchase"), "no match inside the gap").to.equal(1);
                offset = 11000;
                Countly.add_event({ key: "purchase" });
            });
            cy.window({ timeout: 2000 }).should(() => {
                expect(matches(run, "purchase"), "matched once the gap passed").to.equal(2);
            });
        });
    });

    it("asks for content for a listed user property, and for other properties only with the key of any change", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { p: ["custom.plan"] } });
            afterZoneEntered(run).then(() => {
                Countly.user_details({ name: "Content Trigger" });
            });
            cy.wait(2000).then(() => {
                expect(matches(run, "[CLY]_property_update"), "no match for an unlisted property").to.equal(0);
                Countly.userData.set("plan", "pro");
                Countly.userData.save();
            });
            cy.window({ timeout: 2500 }).should(() => {
                expect(matches(run, "[CLY]_property_update"), "matched the listed property").to.equal(1);
            });
        });
    });

    it("lets a newer round's content requests replace those of a round still asking", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { e: ["purchase", "refund"] } });
            var before;
            afterZoneEntered(run).then(() => {
                before = contentRequests(run);
                Countly.add_event({ key: "purchase" });
            });
            cy.wait(200).then(() => {
                Countly.add_event({ key: "refund" });
            });
            cy.wait(4000).then(() => {
                expect(matches(run, "purchase") + matches(run, "refund"), "matched both").to.equal(2);
                expect(run.logs.filter((m) => m.indexOf("A newer round asks for the content, so this one stops") !== -1).length, "the older round stopped").to.be.greaterThan(0);
                expect(contentRequests(run) - before, "content requests: " + run.sent.join(" | ")).to.be.at.most(4);
            });
        });
    });

    it("sends the beginning of a new session right away and then asks for content", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { e: ["[CLY]_session"] } });
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
        var settings = { c: {}, jt: { e: ["[CLY]_session"] } };
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

    it("asks for content when listed user properties are sent, by user_details and by userData.save", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: {}, jt: { p: ["name", "custom.plan"] } });
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
            var run = initWith({ c: {}, jt: { e: ["[CLY]_crash"] } });
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
            var run = initWith({ c: {}, jt: { e: ["[CLY]_consent"] } }, { require_consent: true });
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
            var run = initWith({ c: {}, jt: { e: ["purchase"] } }, { require_consent: true });
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
        var askedForTriggers = null;
        cy.intercept("https://jt.count.ly/**", (req) => {
            var query = new URLSearchParams(req.url.split("?")[1] || "");
            var body = new URLSearchParams(typeof req.body === "string" ? req.body : "");
            var method = query.get("method") || body.get("method");
            if (method === "sc") {
                askedForTriggers = query.get("jt") || body.get("jt");
                req.reply({ delay: 800, statusCode: 200, body: { v: 2, t: Date.now(), c: {}, jt: { e: ["[CLY]_session"] } } });
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
                expect(askedForTriggers, "the settings request asked for the content triggers").to.equal("1");
                expect(content, "content requests once the settings arrived").to.be.greaterThan(0);
            });
        });
    });

    // starts the SDK with the given behavior settings, if any, and a server whose behavior settings answer has "ecz" on
    function initWithEczAnswer(storedSettings) {
        var run = { sent: [], logs: [] };
        var options = {
            app_key: "YOUR_APP_KEY",
            url: "https://your.domain.count.ly",
            debug: true,
            log_listener: (message) => {
                run.logs.push(message);
            },
            fake_request_handler: (req) => {
                run.sent.push(kindOf(req));
                if (req.params && req.params.method === "sc") {
                    return { status: 200, responseText: JSON.stringify({ v: 2, t: Date.now(), c: { ecz: true } }) };
                }
                if (req.params && req.params.method === "queue") {
                    return { status: 200, responseText: "{}" };
                }
                return { status: 200, responseText: "{\"result\":\"Success\"}" };
            }
        };
        if (storedSettings) {
            options.behavior_settings = storedSettings;
        }
        Countly.init(options);
        return run;
    }

    it("enters the content zone when the first behavior settings answer of a first start has ecz on", () => {
        hp.haltAndClearStorage(() => {
            var run = initWithEczAnswer();
            // nothing was stored at init, so the first answer decides the entry
            afterZoneEntered(run).then(() => {
                expect(run.sent.indexOf("settings"), "the settings were fetched").to.not.equal(-1);
            });
        });
    });

    it("does not enter the content zone when a later behavior settings answer turns ecz on", () => {
        hp.haltAndClearStorage(() => {
            var run = initWithEczAnswer({ c: { ecz: false } });
            // the zone's own first fetch would come about 4 s after init
            cy.wait(6000).then(() => {
                expect(run.sent.indexOf("settings"), "the settings were fetched").to.not.equal(-1);
                expect(contentRequests(run), "content requests: " + run.sent.join(" | ")).to.equal(0);
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
                behavior_settings: { c: {}, jt: { e: ["purchase"] } },
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

    it("ignores the content triggers with disable_auto_content_triggers, and follows the journey trigger events", () => {
        hp.haltAndClearStorage(() => {
            var run = initWith({ c: { jte: ["legacy_start"] }, jt: { e: ["purchase", "[CLY]_session"], v: ["Checkout"] } }, { disable_auto_content_triggers: true });
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
                var run = initWith({ c: {}, jt: jt }, {
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
