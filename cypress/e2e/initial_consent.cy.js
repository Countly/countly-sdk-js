/* eslint-disable require-jsdoc */

describe("Consent given in the init options", () => {
    it("Gives the consent of the init options when the server's behavior settings start requiring consent later", () => {
        cy.visit("./cypress/fixtures/initial_consent_server.html");
        cy.wait(1000);
        cy.window().then((win) => {
            expect(win.Countly.check_consent("views"), "any feature, while consent is not required").to.equal(true);
            win.serverCr = true;
            // a device ID change with merge keeps the visitor and fetches the behavior settings again
            win.Countly.change_id("initial-consent-merged-user", true);
            cy.wait(1500).then(() => {
                expect(win.Countly.check_consent("events"), "the feature the init options gave consent for").to.equal(true);
                expect(win.Countly.check_consent("views"), "a feature the init options left out").to.equal(false);
            });
        });
    });
});
