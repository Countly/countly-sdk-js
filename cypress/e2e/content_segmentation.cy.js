/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper.js");

const npsWidget = { _id: "widget123", type: "nps" };
const widgetData = { true: true };

function initMain(config) {
    Countly.init(Object.assign({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        test_mode: true,
        test_mode_eq: true,
        debug: true
    }, config));
}

function presentedCustomObject() {
    var iframe = document.getElementById("countly-surveys-iframe");
    expect(iframe, "surveys iframe should be created").to.exist;
    // read the way the widget pages read it
    var match = /[?&]custom=([^&#]*)/.exec(iframe.getAttribute("src"));
    return JSON.parse(decodeURIComponent(match[1].replace(/\+/g, " ")));
}

describe("Global content segmentation", () => {
    it("is added to a manually reported widget event, and the event's own keys win over it", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.content.setGlobalContentSegmentation({ screen: "checkout", step: 3, rating: "should lose to the answer" });
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, { rating: 4, comment: "all good" });
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(1);
                cy.check_commons(eq[0]);
                cy.check_event(eq[0], { key: "[CLY]_nps", segmentation: { screen: "checkout", step: 3, rating: 4, comment: "all good", widget_id: "widget123" } });
            });
        });
    });

    it("is replaced by a later call, and cleared by null or an empty object", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.content.setGlobalContentSegmentation({ screen: "checkout" });
            Countly.content.setGlobalContentSegmentation({ state: "logged_in" });
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, { rating: 4 });
            Countly.content.setGlobalContentSegmentation(null);
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, { rating: 4 });
            Countly.content.setGlobalContentSegmentation({});
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, { rating: 4 });
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(3);
                expect(eq[0].segmentation.state).to.equal("logged_in");
                expect(eq[0].segmentation.screen).to.equal(undefined);
                expect(eq[1].segmentation.state).to.equal(undefined);
                expect(eq[2].segmentation.state).to.equal(undefined);
            });
        });
    });

    it("never overrides the keys the widget events report themselves, including on a closed widget", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.content.setGlobalContentSegmentation({ widget_id: "hijacked", app_version: "hijacked", closed: "hijacked", screen: "settings" });
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, null);
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(1);
                cy.check_event(eq[0], { key: "[CLY]_nps", segmentation: { widget_id: "widget123", closed: 1, screen: "settings" } });
                expect(eq[0].segmentation.app_version).to.not.equal("hijacked");
            });
        });
    });

    it("keeps only string, number and boolean values or arrays of them, and copies the arrays", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            var tags = ["new", 2, { nested: true }];
            Countly.content.setGlobalContentSegmentation({ screen: "home", count: 2, beta: false, tags: tags, user: { tier: "free" }, callback: () => {}, empty: null });
            tags.push("later");
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, { rating: 4 });
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(1);
                cy.check_event(eq[0], { key: "[CLY]_nps", segmentation: { screen: "home", count: 2, beta: false, rating: 4 } });
                expect(eq[0].segmentation.tags).to.deep.equal(["new", 2]);
                expect(eq[0].segmentation.user).to.equal(undefined);
                expect(eq[0].segmentation.callback).to.equal(undefined);
                expect(eq[0].segmentation.empty).to.equal(undefined);
            });
        });
    });

    it("gives way to the event's own keys when the segmentation limit is hit", () => {
        hp.haltAndClearStorage(() => {
            initMain({ max_segmentation_values: 5 });
            Countly.content.setGlobalContentSegmentation({ g1: 1, g2: 2, g3: 3 });
            Countly.reportFeedbackWidgetManually(npsWidget, widgetData, { rating: 4, comment: "all good" });
            cy.fetch_local_event_queue().then((eq) => {
                expect(eq.length).to.equal(1);
                // widget_id, app_version, rating and comment leave room for one global key
                cy.check_event(eq[0], { key: "[CLY]_nps", segmentation: { widget_id: "widget123", rating: 4, comment: "all good", g1: 1 } });
                expect(Object.keys(eq[0].segmentation).length).to.equal(5);
                expect(eq[0].segmentation.g2).to.equal(undefined);
                expect(eq[0].segmentation.g3).to.equal(undefined);
            });
        });
    });

    it("is added to a rating widget recorded by id and survives a session ending and a new one starting", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.content.setGlobalContentSegmentation({ screen: "pricing" });
            Countly.end_session();
            Countly.begin_session();
            Countly.recordRatingWidgetWithID({ widget_id: "rating123", rating: 3 });
            cy.fetch_local_event_queue().then((eq) => {
                // begin_session also records an orientation event
                var ratings = eq.filter((e) => e.key === "[CLY]_star_rating");
                expect(ratings.length).to.equal(1);
                cy.check_commons(ratings[0]);
                cy.check_event(ratings[0], { key: "[CLY]_star_rating", segmentation: { screen: "pricing", rating: 3, widget_id: "rating123" } });
            });
        });
    });

    it("travels to a presented widget, which reports its own events", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.content.setGlobalContentSegmentation({ screen: "onboarding", step: 2 });
            Countly.present_feedback_widget(npsWidget);
            var custom = presentedCustomObject();
            expect(custom.sg.screen).to.equal("onboarding");
            expect(custom.sg.step).to.equal(2);
            expect(custom.tc).to.equal(1);
        });
    });

    it("loses to a segmentation given to the presenting call for the same key", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.content.setGlobalContentSegmentation({ screen: "onboarding", step: 2 });
            Countly.present_feedback_widget(npsWidget, undefined, undefined, { screen: "checkout" });
            var custom = presentedCustomObject();
            expect(custom.sg.screen).to.equal("checkout");
            expect(custom.sg.step).to.equal(2);
        });
    });

    it("reaches a presented widget intact when a value has URL characters in it", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            var promo = "50% off & free #1 C++ ?x=y";
            Countly.content.setGlobalContentSegmentation({ promo: promo });
            Countly.present_feedback_widget(npsWidget);
            var custom = presentedCustomObject();
            expect(custom.sg.promo).to.equal(promo);
            expect(custom.tc).to.equal(1);
        });
    });

    it("is left out of the presented widget when nothing was set", () => {
        hp.haltAndClearStorage(() => {
            initMain();
            Countly.present_feedback_widget(npsWidget);
            var custom = presentedCustomObject();
            expect(custom.sg).to.equal(undefined);
        });
    });
});
