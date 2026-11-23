/* eslint-disable require-jsdoc */

describe("Calls made before init", () => {
    it("Runs every call made before init after init, in order, and answers the value functions without throwing", () => {
        cy.visit("./cypress/fixtures/pre_init_calls.html");
        cy.window().then((win) => {
            expect(win.beforeInit, "what the functions gave before init").to.deep.equal({
                addEvent: "function",
                enterContentZone: "function",
                userDataSet: "function",
                deviceId: undefined,
                consent: false,
                sdkVersion: win.beforeInit.sdkVersion
            });
            expect(win.beforeInit.sdkVersion, "the SDK version before init").to.match(/^\d+\.\d+\.\d+$/);
        });
        cy.wait(2000).then(() => {
            cy.fetch_local_request_queue("PRE_INIT_APP_KEY").then((rq) => {
                var keys = rq.filter((r) => r.events).reduce((all, r) => all.concat(JSON.parse(r.events).map((e) => e.key)), []);
                expect(keys.filter((key) => key.indexOf("early_") === 0), "the events recorded before init, in their order").to.deep.equal(["early_1", "early_2"]);
                var details = rq.filter((r) => r.user_details).map((r) => JSON.parse(r.user_details));
                expect(details.length, "the user properties saved before init").to.equal(1);
                expect(details[0].custom, "the user property set before init").to.deep.equal({ plan: "pro" });
            });
        });
    });

    it("Records the calls made before init ahead of a call made right after init, each with the time it was made", () => {
        cy.visit("./cypress/fixtures/pre_init_calls.html");
        cy.wait(2000);
        cy.window().then((win) => {
            cy.fetch_local_request_queue("PRE_INIT_APP_KEY").then((rq) => {
                var events = rq.filter((r) => r.events).reduce((all, r) => all.concat(JSON.parse(r.events)), []);
                var keys = events.map((e) => e.key).filter((key) => key.indexOf("early_") === 0 || key === "after_init");
                expect(keys, "the events recorded before init, then the one recorded right after it").to.deep.equal(["early_1", "early_2", "after_init"]);
                var early = events.find((e) => e.key === "early_1");
                expect(early.timestamp, "the event recorded before init, which waited 300 ms").to.be.within(win.calledAt, win.initAt - 1);
                var after = events.find((e) => e.key === "after_init");
                expect(after.timestamp, "the event recorded after init").to.be.at.least(win.initAt);
            });
        });
    });

    [
        { consent: "init", consents: { sessions: true, events: true, views: false } },
        { consent: "init-all", consents: { sessions: true, events: true, views: true } }
    ].forEach(({ consent, consents }) => {
        it("With consent required, gives the consent of the init options (" + consent + ") before the calls made before init run, and sends it once", () => {
            cy.visit("./cypress/fixtures/pre_init_consent.html?consent=" + consent);
            cy.wait(2500);
            cy.fetch_local_request_queue("PRE_INIT_CONSENT_APP_KEY").then((rq) => {
                var keys = rq.filter((r) => r.events).reduce((all, r) => all.concat(JSON.parse(r.events).map((e) => e.key)), []);
                expect(keys.filter((key) => key.indexOf("[CLY]") !== 0), "the events recorded").to.deep.equal(["early", "after_init"]);
                expect(rq.some((r) => r.begin_session), "a session began").to.equal(true);
                var states = rq.filter((r) => r.consent).map((r) => JSON.parse(r.consent));
                expect(states.length, "consent requests").to.equal(1);
                Object.keys(consents).forEach((feature) => expect(states[0][feature], feature).to.equal(consents[feature]));
            });
        });
    });

    it("Ignores the consent of the init options when consent is not required, and sends no consent request", () => {
        cy.visit("./cypress/fixtures/pre_init_consent.html?consent=init&required=0");
        cy.wait(2500);
        cy.fetch_local_request_queue("PRE_INIT_CONSENT_APP_KEY").then((rq) => {
            expect(rq.filter((r) => r.consent), "consent requests").to.deep.equal([]);
            expect(rq.some((r) => r.events), "the events were recorded, as no consent is needed").to.equal(true);
        });
    });

    [
        { consent: "before", events: ["early", "after_init"], session: true },
        { consent: "right-after", events: ["early", "after_init"], session: true },
        { consent: "later", events: ["later"], session: true },
        { consent: "never", events: [], session: false }
    ].forEach(({ consent, events, session }) => {
        it("With consent required, given " + consent + " init, records " + (events.join(", ") || "no event") + " and " + (session ? "starts" : "no") + " session", () => {
            cy.visit("./cypress/fixtures/pre_init_consent.html?consent=" + consent);
            cy.wait(2500);
            cy.fetch_local_request_queue("PRE_INIT_CONSENT_APP_KEY").then((rq) => {
                var keys = rq.filter((r) => r.events).reduce((all, r) => all.concat(JSON.parse(r.events).map((e) => e.key)), []);
                expect(keys.filter((key) => key.indexOf("[CLY]") !== 0), "the events recorded").to.deep.equal(events);
                expect(rq.some((r) => r.begin_session), "a session began").to.equal(session);
            });
        });
    });

    it("Keeps at most 1000 calls made before init, for a page that never initializes the SDK", () => {
        cy.visit("./cypress/fixtures/pre_init_limit.html");
        cy.window().its("waitingCalls").should("equal", 1000);
    });

    it("Logs at init how many calls made before init it ignored because 1000 were waiting", () => {
        cy.visit("./cypress/fixtures/pre_init_limit.html?init=1");
        cy.window().its("logs").should((logs) => {
            var lines = logs.filter((line) => line.indexOf("calls made before init were ignored") !== -1);
            expect(lines, "the log line about the ignored calls").to.deep.equal(["warning: [Countly] init, 5 calls made before init were ignored, as 1000 were waiting already"]);
        });
    });
});
