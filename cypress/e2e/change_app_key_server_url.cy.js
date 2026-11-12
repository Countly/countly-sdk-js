/* eslint-disable require-jsdoc */
var Countly = require("../../Countly.js");
var hp = require("../support/helper");

const KEY_A = "app_key_a";
const KEY_B = "app_key_b";
const URL_A = "https://a.count.ly";
const URL_B = "https://b.count.ly";

/**
 * Starts the SDK with a fake server that records what it receives
 * @param {Array} sent - collects { functionName, url, params } of every request
 * @param {Object} [config] - more init options
 * @param {Function} [answer] - gives the answer to a request, success when it gives nothing
 */
function initWith(sent, config, answer) {
    Countly.init(Object.assign({
        app_key: KEY_A,
        url: URL_A,
        device_id: "device",
        enable_orientation_tracking: false,
        fake_request_handler: (req) => {
            sent.push({ functionName: req.functionName, url: req.url, params: JSON.parse(JSON.stringify(req.params)) });
            return answer ? answer(req) : undefined;
        }
    }, config));
}

/**
 * What a queued request carries, in short
 * @param {Object} params - request parameters
 * @returns {String} e.g. "app_key_a events:a,b"
 */
function describeQueued(params) {
    var what = "other";
    if (params.begin_session) {
        what = "begin_session";
    }
    else if (params.end_session) {
        what = "end_session";
    }
    else if (params.user_details) {
        what = "user_details";
    }
    else if (params.consent) {
        what = "consent";
    }
    else if (params.old_device_id) {
        what = "merge";
    }
    else if (params.events) {
        what = "events:" + JSON.parse(params.events).map((e) => {
            if (e.key === "[CLY]_view") {
                return (typeof e.dur === "number" ? "view_end:" : "view:") + e.segmentation.name;
            }
            return e.key;
        }).join(",");
    }
    return params.app_key + " " + what;
}

/**
 * The queued requests the server received, with their URL
 * @param {Array} sent - recorded requests
 * @returns {Array} e.g. "https://a.count.ly/i app_key_a begin_session"
 */
function queued(sent) {
    return sent.filter((r) => r.functionName === "send_request_queue").map((r) => r.url + " " + describeQueued(r.params));
}

/**
 * The requests made outside the queue, without the health check
 * @param {Array} sent - recorded requests
 * @returns {Array} e.g. "server_config https://b.count.ly/o/sdk app_key_a"
 */
function immediate(sent) {
    return sent.filter((r) => r.functionName !== "send_request_queue" && r.functionName !== "[healthCheck]").map((r) => r.functionName + " " + r.url + " " + r.params.app_key);
}

describe("Changing the server URL and the app key, and the queue operations", () => {
    it("sends the queued and later requests to a new valid server URL, and ignores invalid ones", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent, {}, (req) => (req.url.indexOf(URL_A) === 0 ? { status: 503, responseText: "down" } : undefined));
            cy.wait(1200).then(() => {
                Countly.add_event({ key: "while_a_is_down" });
            });
            cy.wait(1200).then(() => {
                expect(queued(sent)).to.deep.equal([URL_A + "/i app_key_a events:while_a_is_down"]);
                ["", "not a url", "ftp://x", "http://", "http:///", "//b.count.ly", null, undefined, 42].forEach((url) => Countly.change_server_url(url));
                expect(Countly.i[KEY_A].url).to.equal(URL_A);
                sent.length = 0;
                Countly.change_server_url(URL_B + "///");
                expect(Countly.i[KEY_A].url).to.equal(URL_B);
                expect(Countly.i[KEY_A].app_key).to.equal(KEY_A);
                Countly.add_event({ key: "after_the_change" });
            });
            cy.window({ timeout: 6000 }).should(() => {
                // the failed request is not held back by the wait after the failure at the previous server
                expect(queued(sent)).to.deep.equal([URL_B + "/i app_key_a events:while_a_is_down", URL_B + "/i app_key_a events:after_the_change"]);
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_B + "/o/sdk app_key_a"]);
                window.dispatchEvent(new Event("pagehide"));
                expect(JSON.parse(localStorage.getItem(KEY_A + "/cly_hc_log_codes")).e102).to.equal(9);
            });
        });
    });

    it("closes the previous app with its key, begins a session for the new app and keeps the instance on its init key", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent);
            Countly.track_sessions();
            Countly.track_pageview("first page");
            cy.wait(1500).then(() => {
                Countly.add_event({ key: "for_a" });
                Countly.userData.set("plan", "gold");
                Countly.start_event("timed");
                Countly.change_app_key(KEY_B);
                expect(Countly.i[KEY_A].app_key).to.equal(KEY_B);
                expect(Countly.i[KEY_B]).to.equal(undefined);
                expect(Countly.app_key).to.equal(KEY_A);
                expect(Countly.get_device_id()).to.equal("device");
                Countly.track_errors();
                expect(Countly.i[KEY_A].tracking_crashes).to.equal(true);
                Countly.end_event("timed");
                Countly.add_event({ key: "for_b" });
            });
            cy.window({ timeout: 8000 }).should(() => {
                expect(queued(sent)).to.deep.equal([
                    URL_A + "/i app_key_a begin_session",
                    URL_A + "/i app_key_a events:view:first page",
                    URL_A + "/i app_key_a user_details",
                    URL_A + "/i app_key_a events:for_a,view_end:first page",
                    URL_A + "/i app_key_a end_session",
                    URL_A + "/i app_key_b begin_session",
                    URL_A + "/i app_key_b events:timed,for_b"
                ]);
                expect(immediate(sent).filter((r) => r.indexOf("server_config") === 0)).to.deep.equal(["server_config " + URL_A + "/o/sdk app_key_a", "server_config " + URL_A + "/o/sdk app_key_b"]);
                // what is stored stays under the key the instance started with
                expect(sessionStorage.getItem(KEY_B + "/cly_queue")).to.equal(null);
                expect(localStorage.getItem(KEY_B + "/cly_id")).to.equal(null);
                expect(localStorage.getItem(KEY_A + "/cly_id")).to.equal("device");
            });
        });
    });

    it("ignores an invalid, placeholder or unchanged app key", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent);
            Countly.begin_session();
            cy.wait(1500).then(() => {
                ["", null, undefined, 42, {}, "YOUR_APP_KEY", KEY_A].forEach((key) => Countly.change_app_key(key));
                expect(Countly.i[KEY_A].app_key).to.equal(KEY_A);
                Countly.add_event({ key: "still_a" });
                window.dispatchEvent(new Event("pagehide"));
                expect(JSON.parse(localStorage.getItem(KEY_A + "/cly_hc_log_codes")).e103).to.equal(6);
            });
            cy.window({ timeout: 5000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_A + "/i app_key_a begin_session", URL_A + "/i app_key_a events:still_a"]);
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_A + "/o/sdk app_key_a"]);
            });
        });
    });

    it("keeps the app key of queued requests, and replace_all_app_keys_in_queue_with_current_app_key gives them the current one", () => {
        hp.haltAndClearStorage(() => {
            initWith([], { test_mode: true });
            Countly.begin_session();
            cy.wait(1500).then(() => {
                Countly.add_event({ key: "for_a" });
                Countly.change_app_key(KEY_B);
                Countly.add_event({ key: "for_b" });
                Countly.attempt_to_send_stored_requests();
            });
            cy.fetch_local_request_queue(KEY_A).then((rq) => {
                expect(rq.map(describeQueued)).to.deep.equal(["app_key_a begin_session", "app_key_a events:for_a", "app_key_a end_session", "app_key_b begin_session", "app_key_b events:for_b"]);
                Countly.replace_all_app_keys_in_queue_with_current_app_key();
            });
            cy.fetch_local_request_queue(KEY_A).then((rq) => {
                expect(rq.map(describeQueued)).to.deep.equal(["app_key_b begin_session", "app_key_b events:for_a", "app_key_b end_session", "app_key_b begin_session", "app_key_b events:for_b"]);
            });
        });
    });

    it("remove_different_app_keys_from_queue drops the queued requests of other app keys, also those left while sending failed", () => {
        var sent = [];
        var down = true;
        hp.haltAndClearStorage(() => {
            initWith(sent, {}, () => (down ? { status: 503, responseText: "down" } : undefined));
            Countly.begin_session();
            cy.wait(1500).then(() => {
                Countly.add_event({ key: "for_a" });
            });
            cy.wait(1000).then(() => {
                // the failed requests wait in the shared storage for this tab to send them again
                expect(hp.waitingQueues(KEY_A).requestQ.map(describeQueued)).to.deep.equal(["app_key_a begin_session", "app_key_a events:for_a"]);
                Countly.change_app_key(KEY_B);
                Countly.add_event({ key: "for_b" });
                Countly.attempt_to_send_stored_requests();
                Countly.remove_different_app_keys_from_queue();
                expect(hp.waitingQueues(KEY_A).requestQ.map(describeQueued)).to.deep.equal(["app_key_b begin_session", "app_key_b events:for_b"]);
                sent.length = 0;
                down = false;
                Countly.change_server_url(URL_B);
            });
            cy.window({ timeout: 6000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_B + "/i app_key_b begin_session", URL_B + "/i app_key_b events:for_b"]);
            });
        });
    });

    it("flush_queues discards the queued events and requests and keeps timed events and pending user profile changes", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent, { test_mode: true });
            Countly.begin_session();
            cy.wait(1500).then(() => {
                Countly.add_event({ key: "queued_request" });
                Countly.attempt_to_send_stored_requests();
                Countly.add_event({ key: "queued_event" });
                Countly.start_event("timed");
                Countly.userData.set("plan", "gold");
                Countly.flush_queues();
                expect(Countly._internals.getLocalQueues()).to.deep.equal({ eventQ: [], requestQ: [] });
            });
            cy.fetch_local_request_queue(KEY_A).then((rq) => {
                expect(rq).to.deep.equal([]);
                Countly.test_mode_rq(false);
                Countly.end_event("timed");
                Countly.add_event({ key: "after_the_flush" });
            });
            cy.window({ timeout: 5000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_A + "/i app_key_a user_details", URL_A + "/i app_key_a events:timed,after_the_flush"]);
            });
        });
    });

    [["flush_queues", KEY_A], ["remove_different_app_keys_from_queue", KEY_B]].forEach(([operation, keyAfter]) => {
        it(operation + " while a request is on its way does not take the next request with it", () => {
            var arrived = [];
            cy.intercept("https://slow.count.ly/**", (req) => {
                var params = new URLSearchParams(typeof req.body === "string" ? req.body : "");
                if (params.get("events")) {
                    arrived.push(JSON.parse(params.get("events"))[0].key + " " + params.get("app_key"));
                }
                req.reply({ delay: params.get("events") ? 1500 : 0, statusCode: 200, body: { result: "Success" } });
            });
            hp.haltAndClearStorage(() => {
                // without a tab store, as with storage "none", the sent request was taken off the front of the queue
                Countly.init({ app_key: KEY_A, url: "https://slow.count.ly", device_id: "device", storage: "none", enable_orientation_tracking: false });
                cy.wait(1200).then(() => {
                    Countly.add_event({ key: "first" });
                });
                cy.window({ timeout: 3000 }).should(() => {
                    expect(arrived).to.deep.equal(["first " + KEY_A]);
                }).then(() => {
                    if (keyAfter !== KEY_A) {
                        Countly.change_app_key(keyAfter);
                    }
                    Countly[operation]();
                    Countly.add_event({ key: "second" });
                });
                cy.window({ timeout: 6000 }).should(() => {
                    expect(arrived).to.deep.equal(["first " + KEY_A, "second " + keyAfter]);
                });
                cy.wait(2500).then(() => {
                    expect(arrived).to.deep.equal(["first " + KEY_A, "second " + keyAfter]);
                    expect(Countly._internals.getLocalQueues().requestQ).to.deep.equal([]);
                });
            });
        });
    });

    it("sends the requests waiting for a device ID merge to the server URL in use when they go out", () => {
        var sent = [];
        var down = true;
        hp.haltAndClearStorage(() => {
            initWith(sent, {}, (req) => (down && req.functionName === "send_request_queue" ? { status: 503, responseText: "down" } : undefined));
            cy.wait(1200).then(() => {
                Countly.change_id("merged id", true);
                Countly.fetch_remote_config();
            });
            cy.wait(1500).then(() => {
                expect(queued(sent)).to.deep.equal([URL_A + "/i app_key_a merge"]);
                expect(sent.filter((r) => r.functionName === "fetch_remote_config_explicit")).to.deep.equal([]);
                down = false;
                Countly.change_server_url(URL_B);
            });
            cy.window({ timeout: 6000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_A + "/i app_key_a merge", URL_B + "/i app_key_a merge"]);
                expect(sent.filter((r) => r.functionName === "fetch_remote_config_explicit").map((r) => r.url + " " + r.params.device_id)).to.deep.equal([URL_B + "/o/sdk merged id"]);
            });
        });
    });

    it("tells a new server and a new app the consent state and fetches their behavior settings and remote config", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent, { require_consent: true, remote_config: true }, (req) => {
                if (req.functionName === "fetch_remote_config_explicit") {
                    return { status: 200, responseText: JSON.stringify(req.params.app_key === KEY_A ? { color: "red" } : { size: 1 }) };
                }
            });
            Countly.add_consent(["sessions", "events", "remote-config"]);
            cy.wait(2500).then(() => {
                expect(Countly.get_remote_config()).to.deep.equal({ color: "red" });
                sent.length = 0;
                Countly.change_server_url(URL_B);
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_B + "/o/sdk app_key_a", "fetch_remote_config_explicit " + URL_B + "/o/sdk app_key_a"]);
            });
            cy.window({ timeout: 4000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_B + "/i app_key_a consent"]);
            }).then(() => {
                sent.length = 0;
                Countly.change_app_key(KEY_B);
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_B + "/o/sdk app_key_b", "fetch_remote_config_explicit " + URL_B + "/o/sdk app_key_b"]);
                expect(Countly.get_remote_config()).to.deep.equal({ size: 1 });
            });
            cy.window({ timeout: 4000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_B + "/i app_key_b consent"]);
                expect(JSON.parse(sent.filter((r) => r.params.consent)[0].params.consent)).to.include({ sessions: true, events: true, "remote-config": true, push: false });
            });
        });
    });

    it("ignores the behavior settings and remote config answers for the previous app key that arrive after the change", () => {
        cy.intercept("https://slow.count.ly/**", (req) => {
            var params = new URLSearchParams(typeof req.body === "string" ? req.body : "");
            var forA = params.get("app_key") === KEY_A;
            var body = { result: "Success" };
            if (params.get("method") === "sc") {
                body = forA ? { c: { tracking: false } } : { c: {} };
            }
            else if (params.get("method") === "rc") {
                body = forA ? { color: "red" } : { size: 1 };
            }
            req.reply({ delay: forA && params.get("method") ? 2000 : 0, statusCode: 200, body: body });
        });
        hp.haltAndClearStorage(() => {
            Countly.init({ app_key: KEY_A, url: "https://slow.count.ly", device_id: "device", remote_config: true, enable_orientation_tracking: false });
            cy.wait(500).then(() => {
                Countly.change_app_key(KEY_B);
            });
            cy.wait(3000).then(() => {
                expect(Countly.get_remote_config()).to.deep.equal({ size: 1 });
                // the settings answer for the previous app key turned tracking off, it must not apply
                Countly.add_event({ key: "after_the_old_answers" });
                expect(Countly._internals.getLocalQueues().eventQ.map((e) => e.key)).to.deep.equal(["after_the_old_answers"]);
                expect(localStorage.getItem(KEY_A + "/cly_remote_configs")).to.equal(null);
                expect(localStorage.getItem(KEY_A + "/cly_config")).to.equal("{}");
            });
        });
    });

    it("drops the remote config values of the previous app when remote config is not downloaded automatically", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent, {}, (req) => (req.functionName === "fetch_remote_config_explicit" ? { status: 200, responseText: JSON.stringify({ color: "red" }) } : undefined));
            cy.wait(1200).then(() => {
                Countly.fetch_remote_config();
                expect(Countly.get_remote_config()).to.deep.equal({ color: "red" });
                sent.length = 0;
                Countly.change_app_key(KEY_B);
                expect(Countly.get_remote_config()).to.deep.equal({});
                // the values stored for the app of the init key are left for its next init
                expect(JSON.parse(localStorage.getItem(KEY_A + "/cly_remote_configs"))).to.deep.equal({ color: "red" });
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_A + "/o/sdk app_key_b"]);
            });
        });
    });

    it("in offline mode skips the fetches, and the queued requests wait until offline mode ends", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            initWith(sent, { device_id: undefined, offline_mode: true, remote_config: true });
            cy.wait(1200).then(() => {
                sent.length = 0;
                Countly.add_event({ key: "offline" });
                Countly.change_server_url(URL_B);
                Countly.change_app_key(KEY_B);
                Countly.add_event({ key: "online" });
            });
            cy.wait(1500).then(() => {
                expect(sent.filter((r) => r.functionName !== "[healthCheck]")).to.deep.equal([]);
                Countly.disable_offline_mode("real id");
            });
            cy.window({ timeout: 5000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_B + "/i app_key_a events:offline", URL_B + "/i app_key_b events:online"]);
                expect(sent.filter((r) => r.functionName === "send_request_queue").map((r) => r.params.device_id)).to.deep.equal(["real id", "real id"]);
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_B + "/o/sdk app_key_b"]);
            });
        });
    });

    it("a new init uses the URL and app key of its config again, and finds what was stored where it was", () => {
        hp.haltAndClearStorage(() => {
            initWith([], { device_id: undefined, test_mode: true });
            var deviceId = Countly.get_device_id();
            cy.wait(1200).then(() => {
                Countly.change_server_url(URL_B);
                Countly.change_app_key(KEY_B);
                Countly.add_event({ key: "for_b" });
                Countly.attempt_to_send_stored_requests();
                Countly.halt();
                initWith([], { device_id: undefined, test_mode: true });
                expect(Countly.i[KEY_A].url).to.equal(URL_A);
                expect(Countly.i[KEY_A].app_key).to.equal(KEY_A);
                expect(Countly.get_device_id()).to.equal(deviceId);
                // a request queued after the change still goes to the app it was made for
                expect(Countly._internals.getLocalQueues().requestQ.map(describeQueued)).to.deep.equal(["app_key_b events:for_b"]);
            });
        });
    });

    it("runs the calls given to Countly.q before init in their order", () => {
        var sent = [];
        hp.haltAndClearStorage(() => {
            Countly.q.push(["change_server_url", URL_B]);
            Countly.q.push(["change_app_key", KEY_B]);
            Countly.q.push(["add_event", { key: "queued_call" }]);
            initWith(sent);
            cy.window({ timeout: 5000 }).should(() => {
                expect(queued(sent)).to.deep.equal([URL_B + "/i app_key_b events:queued_call"]);
                expect(immediate(sent)).to.deep.equal(["server_config " + URL_A + "/o/sdk app_key_a", "server_config " + URL_B + "/o/sdk app_key_a", "server_config " + URL_B + "/o/sdk app_key_b"]);
            });
        });
    });
});
