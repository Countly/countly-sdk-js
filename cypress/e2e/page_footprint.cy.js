/* eslint-disable require-jsdoc */
// What the SDK leaves on a page in each page scenario, without what the page has without the SDK: the globals, event
// listeners, replaced browser functions, timers, storage keys, cookies, elements and attributes it adds and what it
// writes to the console. api/page/<scenario>.json records it. Every site that upgrades gets a change there, so this
// test fails until npm run page:update records the change, and the changelog workflow (api-changelog.yml) then asks
// for a CHANGELOG.md line that tells integrators about it.

const APP_KEY = "PAGE_FOOTPRINT_APP_KEY";
const SCENARIOS = {
    loaded: "page_footprint.html?scenario=loaded",
    started: "page_footprint.html?scenario=started",
    tracking: "page_footprint.html?scenario=tracking",
    views: "page_footprint.html?scenario=views",
    loader: "page_footprint_loader.html"
};

/**
 * Opens a page footprint page and gives what its scripts left on it, once it stays the same
 * @param {string} page - the page and its query string, in cypress/fixtures
 * @returns {Cypress.Chainable<Object>} the footprint, as page_footprint_probe.js gives it
 */
function settledFootprint(page) {
    cy.visit("./cypress/fixtures/" + page);
    cy.window().its("pageFootprint.ready").should("equal", true);
    return cy.window().then({ timeout: 20000 }, (win) => win.pageFootprint.settled());
}

/**
 * The values of a list without those of another, counting each value as often as it appears
 * @param {string[]} values - values
 * @param {string[]} others - values to take away
 * @returns {string[]} the values left
 */
function without(values, others) {
    const left = others.slice();
    return values.filter((value) => {
        const index = left.indexOf(value);
        if (index !== -1) {
            left.splice(index, 1);
        }
        return index === -1;
    });
}

/**
 * A footprint without what the baseline has, with the app key masked
 * @param {Object} footprint - the footprint of a scenario
 * @param {Object} baseline - the footprint of the page without the SDK
 * @returns {Object} the lists of the footprint, without the baseline's values
 */
function withoutBaseline(footprint, baseline) {
    return Object.keys(footprint).reduce((result, key) => {
        result[key] = without(footprint[key], baseline[key] || []).map((value) => value.split(APP_KEY).join("<app_key>"));
        return result;
    }, {});
}

/**
 * The lines that differ between a recorded footprint and the current one: "- list: value" for a value only the record
 * has, "+ list: value" for one only the page has now
 * @param {Object} recorded - the footprint api/page records
 * @param {Object} current - the footprint the page has now
 * @returns {string[]} the lines that differ
 */
function changes(recorded, current) {
    const lines = (footprint) => Object.keys(footprint).reduce((all, key) => all.concat(footprint[key].map((value) => key + ": " + value)), []);
    const was = lines(recorded);
    const now = lines(current);
    return without(was, now).map((line) => "- " + line).concat(without(now, was).map((line) => "+ " + line));
}

describe("Page footprint", () => {
    let baseline = null;
    before(() => {
        settledFootprint("page_footprint_baseline.html").then((footprint) => {
            baseline = footprint;
        });
    });
    beforeEach(() => {
        cy.intercept("https://page-footprint.count.ly/**", { body: { result: "Success" } });
    });
    Object.keys(SCENARIOS).forEach((name) => {
        it("Leaves on the page what api/page/" + name + ".json records, in the " + name + " scenario", () => {
            const file = "api/page/" + name + ".json";
            settledFootprint(SCENARIOS[name]).then((footprint) => {
                const current = withoutBaseline(footprint, baseline);
                if (Cypress.env("updatePageRecords")) {
                    cy.writeFile(file, JSON.stringify(current, null, 2) + "\n");
                    return;
                }
                cy.readFile(file).then((recorded) => {
                    const message = "what the SDK leaves on the page in the " + name + " scenario changed; if that is deliberate, run npm run page:update, check the difference in " + file + " and add a CHANGELOG.md line";
                    expect(changes(recorded, current).join("\n"), message).to.equal("");
                    expect(current, message).to.deep.equal(recorded);
                });
            });
        });
    });
});
