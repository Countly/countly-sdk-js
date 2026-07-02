/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var Utils = require("../../modules/Utils.js");
var hp = require("../support/helper");

// Force what window.matchMedia reports for prefers-color-scheme.
// scheme: "dark" | "light" | "none" (no preference reported)
function stubColorScheme(scheme) {
    window.matchMedia = function(query) {
        var matches = false;
        if (scheme === "dark") {
            matches = query.indexOf("dark") !== -1;
        }
        else if (scheme === "light") {
            matches = query.indexOf("light") !== -1;
        }
        return { matches: matches, media: query, addListener: function() {}, removeListener: function() {} };
    };
}

function initMain() {
    Countly.init({
        app_key: "YOUR_APP_KEY",
        url: "https://your.domain.count.ly",
        test_mode: true,
        debug: true
    });
}

describe("Theme (th) parameter on widget/content URLs", () => {
    var originalMatchMedia;
    beforeEach(() => {
        originalMatchMedia = window.matchMedia;
    });
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    // Unit: the separator (?/&) and value logic, plus omission when the theme is undefined.
    it("appendThemeToUrl applies the correct separator/value and omits when undefined", () => {
        stubColorScheme("dark");
        // no query yet -> "?"
        expect(Utils.appendThemeToUrl("https://c.ly/feedback/nps")).to.equal("https://c.ly/feedback/nps?th=d");
        // existing query -> "&"
        expect(Utils.appendThemeToUrl("https://c.ly/feedback/nps?widget_id=1")).to.equal("https://c.ly/feedback/nps?widget_id=1&th=d");

        stubColorScheme("light");
        expect(Utils.appendThemeToUrl("https://c.ly/content?a=1")).to.equal("https://c.ly/content?a=1&th=l");

        // no resolvable preference -> URL untouched, no dangling "?th="/"&th="
        stubColorScheme("none");
        expect(Utils.appendThemeToUrl("https://c.ly/content?a=1")).to.equal("https://c.ly/content?a=1");
        expect(Utils.appendThemeToUrl("https://c.ly/content")).to.equal("https://c.ly/content");
    });

    // Unit: prefers-color-scheme mapping to d/l/null.
    it("getThemeMode maps prefers-color-scheme to d/l/null", () => {
        stubColorScheme("dark");
        expect(Utils.getThemeMode()).to.equal("d");
        stubColorScheme("light");
        expect(Utils.getThemeMode()).to.equal("l");
        stubColorScheme("none");
        expect(Utils.getThemeMode()).to.equal(null);
    });

    // Integration: the theme reaches the actual feedback widget iframe that gets loaded.
    it("appends th to the presented feedback widget iframe URL matching the color scheme", () => {
        hp.haltAndClearStorage(() => {
            stubColorScheme("dark");
            initMain();
            Countly.present_feedback_widget({ _id: "widget_nps_1", type: "nps" });
            cy.get("#countly-surveys-iframe")
                .should("have.attr", "src")
                .and("match", /[?&]th=d(&|$)/);
        });
    });
});
