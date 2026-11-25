// Used in page footprint tests: the first script of a page footprint page. It watches what the scripts after it do to
// the page, and window.pageFootprint.take() gives what they left on it, each list sorted:
// - globals: the names they added to window
// - listeners: the event listeners they added and did not remove, as "<target>: <type>"
// - replaced: the browser functions and on<event> handler properties they changed
// - timers: the timers still waiting, as "setTimeout <ms>" and "setInterval <ms>"
// - localStorage, sessionStorage, cookies: the keys and cookie names they added
// - elements, attributes: the elements and attributes they added to the page the HTML parser built
// - console: what they wrote to the console, as "<method>: <text>"
// The page sets window.pageFootprint.ready when it has made its calls.
(function () {
    var nativeAddEventListener = EventTarget.prototype.addEventListener;
    var nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
    var nativeSetTimeout = window.setTimeout;
    var nativeSetInterval = window.setInterval;
    var nativeClearTimeout = window.clearTimeout;
    var nativeClearInterval = window.clearInterval;
    var globalsBefore = Object.getOwnPropertyNames(window);
    var localStorageBefore = Object.keys(window.localStorage);
    var sessionStorageBefore = Object.keys(window.sessionStorage);
    var cookiesBefore = cookieNames();
    var listeners = [];
    var timers = {};
    var consoleLines = [];
    var parsedPage = null;

    /**
     * The names of the cookies of the page
     * @returns {string[]} cookie names
     */
    function cookieNames() {
        return document.cookie ? document.cookie.split(";").map(function (cookie) {
            return cookie.split("=")[0].trim();
        }) : [];
    }

    /**
     * The values of a list that another list does not have
     * @param {string[]} values - values
     * @param {string[]} before - values to leave out
     * @returns {string[]} the values left, sorted
     */
    function added(values, before) {
        return values.filter(function (value) {
            return before.indexOf(value) === -1;
        }).sort();
    }

    /**
     * A name for the target of an event listener or for an element
     * @param {*} target - window, document, an element or another event target
     * @returns {string} "window", "document", the tag name with the id, or the kind of the target
     */
    function describe(target) {
        if (target === window) {
            return "window";
        }
        if (target === document) {
            return "document";
        }
        if (target && target.nodeType === 1) {
            return target.tagName.toLowerCase() + (target.id ? "#" + target.id : "");
        }
        return Object.prototype.toString.call(target).slice(8, -1);
    }

    /**
     * Whether event listener options ask for the capture phase
     * @param {boolean|Object} options - the third argument of addEventListener
     * @returns {boolean} true for a capture listener
     */
    function capturing(options) {
        return typeof options === "boolean" ? options : !!(options && options.capture);
    }

    /**
     * The index of an event listener among those added, as the browser tells them apart
     * @param {EventTarget} target - target
     * @param {string} type - event type
     * @param {Function|Object} listener - listener
     * @param {boolean} capture - capture phase
     * @returns {number} index, -1 if it was not added
     */
    function listenerIndex(target, type, listener, capture) {
        for (var i = 0; i < listeners.length; i++) {
            var entry = listeners[i];
            if (entry.target === target && entry.type === type && entry.listener === listener && entry.capture === capture) {
                return i;
            }
        }
        return -1;
    }

    EventTarget.prototype.addEventListener = function (type, listener, options) {
        var capture = capturing(options);
        if (listener && listenerIndex(this, type, listener, capture) === -1) {
            listeners.push({ target: this, type: String(type), listener: listener, capture: capture });
        }
        return nativeAddEventListener.apply(this, arguments);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
        var index = listenerIndex(this, String(type), listener, capturing(options));
        if (index !== -1) {
            listeners.splice(index, 1);
        }
        return nativeRemoveEventListener.apply(this, arguments);
    };

    /**
     * A timer function that keeps the timers it starts until they run or are cleared
     * @param {Function} start - the browser's setTimeout or setInterval
     * @param {string} name - "setTimeout" or "setInterval"
     * @returns {Function} the timer function
     */
    function watchedTimer(start, name) {
        return function (callback, delay) {
            var args = Array.prototype.slice.call(arguments);
            var id;
            if (name === "setTimeout" && typeof callback === "function") {
                args[0] = function () {
                    delete timers[id];
                    return callback.apply(this, arguments);
                };
            }
            id = start.apply(window, args);
            timers[id] = name + " " + (Number(delay) || 0);
            return id;
        };
    }

    /**
     * A function that clears a timer and forgets it
     * @param {Function} clear - the browser's clearTimeout or clearInterval
     * @returns {Function} the clear function
     */
    function watchedClear(clear) {
        return function (id) {
            delete timers[id];
            return clear.apply(window, arguments);
        };
    }

    window.setTimeout = watchedTimer(nativeSetTimeout, "setTimeout");
    window.setInterval = watchedTimer(nativeSetInterval, "setInterval");
    window.clearTimeout = watchedClear(nativeClearTimeout);
    window.clearInterval = watchedClear(nativeClearInterval);

    ["log", "info", "warn", "error", "debug"].forEach(function (method) {
        var original = console[method];
        console[method] = function () {
            consoleLines.push(method + ": " + Array.prototype.map.call(arguments, String).join(" "));
            return original.apply(console, arguments);
        };
    });

    var watchedFunctions = [
        ["window", window, ["fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "open", "postMessage"]],
        ["history", window.history, ["pushState", "replaceState", "back", "forward", "go"]],
        ["navigator", window.navigator, ["sendBeacon"]],
        ["XMLHttpRequest.prototype", XMLHttpRequest.prototype, ["open", "send", "setRequestHeader"]],
        ["EventTarget.prototype", EventTarget.prototype, ["addEventListener", "removeEventListener", "dispatchEvent"]],
        ["Storage.prototype", Storage.prototype, ["getItem", "setItem", "removeItem", "clear"]],
        ["Document.prototype", Document.prototype, ["createElement"]],
        ["Node.prototype", Node.prototype, ["appendChild", "insertBefore", "removeChild"]],
        ["console", console, ["log", "info", "warn", "error", "debug"]],
        ["JSON", JSON, ["parse", "stringify"]]
    ];
    [["window", window], ["document", document]].forEach(function (owner) {
        var handlers = [];
        for (var key in owner[1]) {
            if (key.indexOf("on") === 0) {
                handlers.push(key);
            }
        }
        watchedFunctions.push([owner[0], owner[1], handlers]);
    });
    var originals = watchedFunctions.map(function (watched) {
        return watched[2].map(function (name) {
            return watched[1][name];
        });
    });

    /**
     * The attributes of an element by name
     * @param {Element} element - element
     * @returns {Object} attribute values by name
     */
    function attributesOf(element) {
        var attributes = {};
        Array.prototype.forEach.call(element.attributes, function (attribute) {
            attributes[attribute.name] = attribute.value;
        });
        return attributes;
    }

    // scripts that run after the parser built the page, as module scripts do, find it at "interactive"
    nativeAddEventListener.call(document, "readystatechange", function () {
        if (document.readyState === "interactive" && !parsedPage) {
            parsedPage = Array.prototype.map.call(document.getElementsByTagName("*"), function (element) {
                return { element: element, attributes: attributesOf(element) };
            });
        }
    });

    /**
     * What the scripts after this one left on the page
     * @returns {Object} the lists described at the top of this file
     */
    function take() {
        var parsed = parsedPage || [];
        var parsedElements = parsed.map(function (entry) {
            return entry.element;
        });
        var replaced = [];
        watchedFunctions.forEach(function (watched, i) {
            watched[2].forEach(function (name, j) {
                if (watched[1][name] !== originals[i][j]) {
                    replaced.push(watched[0] + "." + name);
                }
            });
        });
        var attributes = [];
        parsed.forEach(function (entry) {
            var now = attributesOf(entry.element);
            Object.keys(now).forEach(function (name) {
                if (now[name] !== entry.attributes[name]) {
                    attributes.push(describe(entry.element) + "[" + name + "]");
                }
            });
        });
        return {
            globals: added(Object.getOwnPropertyNames(window), globalsBefore.concat("pageFootprint")),
            listeners: listeners.map(function (entry) {
                return describe(entry.target) + ": " + entry.type + (entry.capture ? " (capture)" : "");
            }).sort(),
            replaced: replaced.sort(),
            timers: Object.keys(timers).map(function (id) {
                return timers[id];
            }).sort(),
            localStorage: added(Object.keys(window.localStorage), localStorageBefore),
            sessionStorage: added(Object.keys(window.sessionStorage), sessionStorageBefore),
            cookies: added(cookieNames(), cookiesBefore),
            elements: Array.prototype.filter.call(document.getElementsByTagName("*"), function (element) {
                return parsedElements.indexOf(element) === -1;
            }).map(describe).sort(),
            attributes: attributes.sort(),
            console: consoleLines.slice().sort()
        };
    }

    /**
     * What the scripts after this one left on the page, once it stayed the same for a while
     * @param {number} [quiet] - milliseconds it has to stay the same, 1500 by default
     * @param {number} [limit] - milliseconds to wait at most, 15000 by default
     * @returns {Promise<Object>} what take() gives; rejects when the page still changes at the limit
     */
    function settled(quiet, limit) {
        var quietFor = quiet || 1500;
        var waitAtMost = limit || 15000;
        var started = Date.now();
        var last = JSON.stringify(take());
        var since = started;
        return new Promise(function (resolve, reject) {
            (function check() {
                nativeSetTimeout.call(window, function () {
                    var now = JSON.stringify(take());
                    if (now !== last) {
                        last = now;
                        since = Date.now();
                    }
                    if (Date.now() - since >= quietFor) {
                        resolve(JSON.parse(now));
                    }
                    else if (Date.now() - started >= waitAtMost) {
                        reject(new Error("the page still changed after " + waitAtMost + " ms: " + now));
                    }
                    else {
                        check();
                    }
                }, 100);
            })();
        });
    }

    window.pageFootprint = { ready: false, take: take, settled: settled };
})();
