/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper");

// Inits the SDK with the given log listener, answering every request and collecting its params in "sent" when given
function initWithListener(listener, sent, extra) {
    var config = {
        app_key: hp.appKey,
        url: "https://your.domain.count.ly",
        log_listener: listener,
        fake_request_handler: function(req) {
            if (sent) {
                sent.push(req.params);
            }
            return { status: 200, responseText: "{\"result\":\"Success\"}" };
        }
    };
    Countly.init(Object.assign(config, extra));
}

// The keys of every event in the collected request params, in the order they were sent
function sentEventKeys(sent) {
    return sent
        .filter((p) => p.events)
        .flatMap((p) => JSON.parse(p.events))
        .map((e) => e.key);
}

// The received lines this spec logged itself, leaving out what the SDK logs on its own
function testLines(lines) {
    return lines.filter((line) => line.message.indexOf("log_listener_test") !== -1);
}

describe("Log listener", () => {
    it("receives every log line with its level while debug is off", () => {
        hp.haltAndClearStorage(() => {
            var lines = [];
            initWithListener(function(message, level) {
                lines.push({ message: message, level: level });
            });
            expect(lines).to.deep.include({ message: "[Countly] initialize, Countly initialized", level: "info" });

            Countly._internals.log("[ERROR] ", "log_listener_test, error line");
            Countly._internals.log("[WARNING] ", "log_listener_test, warning line");
            Countly._internals.log("[INFO] ", "log_listener_test, info line");
            Countly._internals.log("[DEBUG] ", "log_listener_test, debug line");
            Countly._internals.log("[VERBOSE] ", "log_listener_test, verbose line", { key: "value" });
            expect(testLines(lines)).to.deep.equal([
                { message: "[Countly] log_listener_test, error line", level: "error" },
                { message: "[Countly] log_listener_test, warning line", level: "warning" },
                { message: "[Countly] log_listener_test, info line", level: "info" },
                { message: "[Countly] log_listener_test, debug line", level: "debug" },
                { message: "[Countly] log_listener_test, verbose line {\"key\":\"value\"}", level: "verbose" }
            ]);
        });
    });
    it("receives the printed line without its level prefix while debug is on", () => {
        hp.haltAndClearStorage(() => {
            var lines = [];
            var consoleInfo = cy.spy(console, "info");
            initWithListener(function(message, level) {
                lines.push({ message: message, level: level });
            }, null, { debug: true });

            Countly._internals.log("[INFO] ", "log_listener_test, printed line");
            expect(testLines(lines)).to.deep.equal([{ message: "[Countly] log_listener_test, printed line", level: "info" }]);
            expect(consoleInfo).to.have.been.calledWith("[INFO] [Countly] log_listener_test, printed line");
        });
    });
    it("keeps the SDK working when the listener throws", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            var calls = 0;
            initWithListener(function() {
                calls++;
                throw new Error("log_listener_test, listener failure");
            }, sent);

            Countly.add_event({ key: "after_listener_threw" });
            cy.wait(1500).then(() => {
                expect(calls).to.be.above(1);
                expect(sentEventKeys(sent)).to.include("after_listener_threw");
            });
        });
    });
    it("ignores a log listener that is not a function", () => {
        hp.haltAndClearStorage(() => {
            var sent = [];
            var consoleWarn = cy.spy(console, "warn");
            initWithListener("not a function", sent, { debug: true });
            expect(consoleWarn).to.have.been.calledWith("[WARNING] [Countly] initialize, log_listener must be a function, ignoring it");

            Countly.add_event({ key: "with_invalid_listener" });
            cy.wait(1500).then(() => {
                expect(sentEventKeys(sent)).to.include("with_invalid_listener");
            });
        });
    });
    it("stops receiving log lines after halt", () => {
        hp.haltAndClearStorage(() => {
            var lines = [];
            initWithListener(function(message, level) {
                lines.push({ message: message, level: level });
            });
            Countly.halt();
            expect(lines).to.deep.include({ message: "[Countly] halt, Resetting Countly", level: "warning" });

            var countAfterHalt = lines.length;
            Countly._internals.log("[INFO] ", "log_listener_test, after halt");
            expect(lines.length).to.equal(countAfterHalt);
        });
    });
});
