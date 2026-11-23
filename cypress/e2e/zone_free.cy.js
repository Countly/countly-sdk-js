/* eslint-disable require-jsdoc */

describe("Pages with zone.js", () => {
    it("Starts the SDK's timers and listeners with the functions zone.js keeps unpatched, and keeps working", () => {
        cy.visit("./cypress/fixtures/zone_free.html");
        cy.wait(3000).then(() => {
            cy.window().then((win) => {
                expect(win.zoneFree.timers, "timers started with the browser's own functions").to.be.above(0);
                expect(win.zoned.timers, "timers started with the patched functions").to.equal(0);
                ["mousemove", "scroll", "keydown", "click", "visibilitychange", "storage"].forEach((type) => {
                    expect(win.zoneFree.listeners, "listeners added with the browser's own function").to.include(type);
                    expect(win.zoned.listeners, "listeners added with the patched function").not.to.include(type);
                });
            });
            cy.fetch_local_request_queue("ZONE_FREE_APP_KEY").then((rq) => {
                expect(rq.filter((r) => r.begin_session).length, "the session the heartbeat sent").to.equal(1);
            });
        });
    });
});
