/* eslint-disable require-jsdoc */
// A page can run a second copy of the SDK, as from the script tag and a bundle, or from two bundles. The copies share
// one Countly through the global Countly, so the second copy must not handle what the first one already handles.
var Countly = require("../../Countly.js");
var hp = require("../support/helper");
import { triggerStorageChange } from "../support/integration_helper";

describe("A second copy of the SDK on the page", () => {
    it("Shares Countly, and a storage change from another tab is handled once", () => {
        hp.haltAndClearStorage(() => {
            Countly.init({
                app_key: "SECOND_COPY_APP_KEY",
                url: "https://your.domain.count.ly",
                test_mode: true,
                test_mode_eq: true
            });
            // the query makes webpack load the SDK file a second time, as a second copy
            var secondCopy = require("../../Countly.js?second_copy");
            expect(secondCopy, "the second copy's Countly").to.equal(Countly);

            var internals = Countly.i.SECOND_COPY_APP_KEY._internals;
            var onStorageChange = internals.onStorageChange;
            var handled = 0;
            internals.onStorageChange = function () {
                handled++;
                return onStorageChange.apply(this, arguments);
            };
            triggerStorageChange("SECOND_COPY_APP_KEY/cly_id", "other_tab_device_id");
            expect(handled, "times the storage change was handled").to.equal(1);
            expect(Countly.get_device_id()).to.equal("other_tab_device_id");
        });
    });
});
