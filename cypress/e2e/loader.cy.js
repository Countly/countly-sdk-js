/* eslint-disable require-jsdoc */

describe("Loader", () => {
    it("Answers before the SDK file loads, loads it at init and runs the calls made before init, in order and with their time", () => {
        cy.visit("./cypress/fixtures/loader.html");
        cy.window().then((win) => {
            expect(win.beforeInit, "what the loader gave before init").to.deep.equal({ addEvent: "function", deviceId: undefined, sdkLoaded: false });
        });
        cy.window().its("afterLoad").should("deep.equal", { sdkLoaded: true, sameObject: true, deviceId: "string" });
        cy.window().then((win) => {
            expect(win.sdkLoadedBeforeInit, "the SDK file was not loaded before init").to.equal(false);
            cy.fetch_local_request_queue("LOADER_APP_KEY").then((rq) => {
                var events = rq.filter((r) => r.events).reduce((all, r) => all.concat(JSON.parse(r.events)), []);
                expect(events.map((e) => e.key).filter((key) => key.indexOf("[CLY]") !== 0), "the events, in the order they were made").to.deep.equal(["early", "after_init"]);
                expect(events.find((e) => e.key === "early").timestamp, "the event made before init, which waited 300 ms").to.be.within(win.calledAt, win.initAt - 1);
            });
        });
    });

    it("Is the SDK itself on a page whose code imported the SDK first, and runs the calls made through it", () => {
        cy.visit("./cypress/fixtures/loader_after_sdk.html");
        cy.window().its("done").should("equal", true);
        cy.window().then((win) => {
            expect(win.sameObject, "the loader's Countly is the SDK's").to.equal(true);
            cy.fetch_local_request_queue("LOADER_ORDER_APP_KEY").then((rq) => {
                var keys = rq.filter((r) => r.events).reduce((all, r) => all.concat(JSON.parse(r.events).map((e) => e.key)), []);
                expect(keys.filter((key) => key.indexOf("[CLY]") !== 0), "the events made through the loader").to.deep.equal(["loader_before_init", "loader_after_init"]);
            });
        });
    });
});
