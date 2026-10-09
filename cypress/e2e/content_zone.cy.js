/* eslint-disable cypress/no-unnecessary-waiting */
/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper");

var contentAnswer = JSON.stringify({ html: "https://your.domain.count.ly/_external/content?id=1", geo: { l: { x: 0, y: 0, w: 100, h: 100 }, p: { x: 0, y: 0, w: 100, h: 100 } } });

// answers content requests with content when hasContent() says so, and counts them
function initWithContent(hasContent) {
    var counts = { content: 0 };
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        debug: true,
        test_mode_eq: true,
        fake_request_handler: (req) => {
            if (req.params && req.params.method === "queue") {
                counts.content++;
                return { status: 200, responseText: hasContent() ? contentAnswer : "{}" };
            }
            return { status: 200, responseText: "{\"result\":\"Success\"}" };
        }
    });
    return counts;
}

function contentFrame() {
    return document.getElementById("cly-content-iframe");
}

// a message the shown content sends to the page
function fromContent(data) {
    window.dispatchEvent(new MessageEvent("message", { data: data, origin: "https://your.domain.count.ly", source: contentFrame().contentWindow }));
}

describe("Leaving the content zone", () => {
    afterEach(() => {
        document.querySelectorAll("#cly-content-iframe").forEach((frame) => frame.remove());
    });

    it("keeps the zone left when it is left during the first seconds", () => {
        hp.haltAndClearStorage(() => {
            var counts = initWithContent(() => true);
            Countly.content.enterContentZone();
            Countly.content.exitContentZone();
            cy.wait(5500).then(() => {
                expect(counts.content, "content requests after leaving").to.equal(0);
                expect(contentFrame(), "content after leaving").to.not.exist;
            });
        });
    });

    it("keeps the zone left when it is left right after a refresh", () => {
        hp.haltAndClearStorage(() => {
            var counts = initWithContent(() => false);
            Countly.content.enterContentZone();
            cy.wait(5500).then(() => {
                expect(counts.content, "the zone was entered").to.equal(1);
                Countly.content.refreshContentZone();
                Countly.content.exitContentZone();
                cy.wait(1500).then(() => {
                    expect(counts.content, "content requests after leaving").to.equal(1);
                });
            });
        });
    });

    it("closes the content on screen", () => {
        hp.haltAndClearStorage(() => {
            var counts = initWithContent(() => true);
            Countly.content.enterContentZone();
            cy.wait(5500).then(() => {
                expect(contentFrame(), "content is shown").to.exist;
                Countly.content.exitContentZone();
                expect(contentFrame(), "content after leaving").to.not.exist;
                cy.wait(1500).then(() => {
                    expect(counts.content, "content requests after leaving").to.equal(1);
                });
            });
        });
    });
});

describe("Messages from content", () => {
    afterEach(() => {
        document.querySelectorAll("#cly-content-iframe").forEach((frame) => frame.remove());
    });

    it("are handled once, however many contents were shown before", () => {
        hp.haltAndClearStorage(() => {
            initWithContent(() => true);
            Countly.content.enterContentZone();
            cy.wait(5500).then(() => {
                expect(contentFrame(), "first content is shown").to.exist;
                fromContent({ close: 1 });
                expect(contentFrame(), "first content is closed").to.not.exist;
                Countly.content.refreshContentZone();
                cy.wait(1500).then(() => {
                    expect(contentFrame(), "second content is shown").to.exist;
                    fromContent({ event: [{ key: "from_content" }] });
                    var recorded = Countly._internals.getLocalQueues().eventQ.filter((e) => e.key === "from_content");
                    expect(recorded.length).to.equal(1);
                    Countly.content.exitContentZone();
                });
            });
        });
    });
});

describe("Journey content", () => {
    it("is asked for even when an earlier journey event reached the server by the regular sending", () => {
        var counts = { content: 0 };
        var failedOnce = false;
        hp.haltAndClearStorage(() => {
            Countly.init({
                app_key: "YOUR_APP_KEY",
                url: "https://your.domain.count.ly",
                debug: true,
                fail_timeout: 1,
                behavior_settings: { c: { jte: ["journey_start"] } },
                disable_sdk_behavior_settings_updates: true,
                fake_request_handler: (req) => {
                    if (req.params && req.params.method === "queue") {
                        counts.content++;
                        return { status: 200, responseText: "{}" };
                    }
                    if (req.params && req.params.events && req.params.events.indexOf("journey_start") !== -1 && !failedOnce) {
                        failedOnce = true;
                        return { status: 500, responseText: "{\"result\":\"Error\"}" };
                    }
                    return { status: 200, responseText: "{\"result\":\"Success\"}" };
                }
            });
            cy.wait(1000).then(() => {
                // the first journey event fails to reach the server, the regular sending delivers it later
                Countly.add_event({ key: "journey_start" });
                cy.wait(4000).then(() => {
                    expect(Countly._internals.getLocalQueues().requestQ.length, "the failed request was delivered later").to.equal(0);
                    var before = counts.content;
                    Countly.add_event({ key: "journey_start" });
                    cy.wait(2500).then(() => {
                        expect(counts.content - before, "journey content requests").to.be.greaterThan(0);
                    });
                });
            });
        });
    });
});
