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
});
