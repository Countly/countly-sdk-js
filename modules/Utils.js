import { isBrowser, Countly } from "./Platform.js";
import { logLevelEnums } from "./Constants.js";

/**
 *  Get selected values from multi select input
 *  @param {HTMLElement} input - select with multi true option
 *  @returns {String} coma concatenated values
 */
function getMultiSelectValues(input) {
    var values = [];
    if (typeof input.options !== "undefined") {
        for (var j = 0; j < input.options.length; j++) {
            if (input.options[j].selected) {
                values.push(input.options[j].value);
            }
        }
    }
    return values.join(", ");
}

/**
 * Return a crypto-safe random string
 * @memberof Countly._internals
 * @returns {string} - random string
 */
function secureRandom() {
    var id = "xxxxxxxx";
    id = replacePatternWithRandomValues(id, "[x]");

    // timestamp in milliseconds
    var timestamp = Date.now().toString();

    return (id + timestamp);
}

/**
 *  Generate random UUID value
 *  @memberof Countly._internals
 *  @returns {String} random UUID value
 */
function generateUUID() {
    var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    uuid = replacePatternWithRandomValues(uuid, "[xy]");
    return uuid;
}

/**
 * Generate random value based on pattern
 * 
 * @param {string} str - string to replace
 * @param {string} pattern - pattern to replace
 * @returns {string} - replaced string
*/
function replacePatternWithRandomValues(str, pattern) {
    var d = new Date().getTime();
    var regex = new RegExp(pattern, "g");
    return str.replace(regex, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 *  Get unix timestamp
 *  @memberof Countly._internals
 *  @returns {Number} unix timestamp
 */
function getTimestamp() {
    return Math.floor(new Date().getTime() / 1000);
}

var lastMsTs = 0;
/**
 *  Get unique timestamp in milliseconds
 *  @memberof Countly._internals
 *  @returns {Number} milliseconds timestamp
 */
function getMsTimestamp() {
    var ts = new Date().getTime();
    if (lastMsTs >= ts) {
        lastMsTs++;
    }
    else {
        lastMsTs = ts;
    }
    return lastMsTs;
}

/**
 *  Get config value from multiple sources
 *  like config object, global object or fallback value
 *  @param {String} key - config key
 *  @param {Object} ob - config object
 *  @param {Varies} override - fallback value
 *  @returns {Varies} value to be used as config
 */
function getConfig(key, ob, override) {
    if (ob && Object.keys(ob).length) {
        if (typeof ob[key] !== "undefined") {
            return ob[key];
        }
    }
    else if (typeof Countly[key] !== "undefined") {
        return Countly[key];
    }
    return override;
}

/**
 *  Dispatch errors to instances that lister to errors
 *  @param {Error} error - Error object
 *  @param {Boolean} fatality - fatal if false and nonfatal if true
 *  @param {Object} segments - custom crash segments
 */
function dispatchErrors(error, fatality, segments) {
    // Check each instance like Countly.i[app_key_1], Countly.i[app_key_2] ...
    for (var app_key in Countly.i) {
        // If track_errors is enabled for that instance
        if (Countly.i[app_key].tracking_crashes) {
            // Trigger recordError function for that instance
            Countly.i[app_key].recordError(error, fatality, segments);
        }
    }
}

/**
 *  Convert JSON object to URL encoded query parameter string
 *  @memberof Countly._internals
 *  @param {Object} params - object with query parameters
 *  @param {String} salt - salt to be used for checksum calculation
 *  @returns {String} URL encode query string
 */
function prepareParams(params, salt) {
    var str = [];
    for (var i in params) {
        str.push(i + "=" + encodeURIComponent(params[i]));
    }
    var data = str.join("&");
    if (salt) {
        return calculateChecksum(data, salt).then(checksum => {
            data += "&checksum256=" + checksum;
            return data;
        });
    }
    return Promise.resolve(data);
}

/**
 *  Removing trailing slashes
 *  @memberof Countly._internals
 *  @param {String} str - string from which to remove trailing slash
 *  @returns {String} modified string
 */
function stripTrailingSlash(str) {
    if (typeof str === "string") {
        if (str.substring(str.length - 1) === "/") {
            return str.substring(0, str.length - 1);
        }
    }
    return str;
}

/**
 *  Retrieve only specific properties from object
 *  @memberof Countly._internals
 *  @param {Object} orig - original object
 *  @param {Array} props - array with properties to get from object
 *  @returns {Object} new object with requested properties
 */
function createNewObjectFromProperties(orig, props) {
    var ob = {};
    var prop;
    for (var i = 0, len = props.length; i < len; i++) {
        prop = props[i];
        if (typeof orig[prop] !== "undefined") {
            ob[prop] = orig[prop];
        }
    }
    return ob;
}

/**
 *  Add specified properties to an object from another object
 *  @memberof Countly._internals
 *  @param {Object} orig - original object
 *  @param {Object} transferOb - object to copy values from
 *  @param {Array} props - array with properties to get from object
 *  @returns {Object} original object with additional requested properties
 */
function addNewProperties(orig, transferOb, props) {
    if (!props) {
        return;
    }
    var prop;
    for (var i = 0, len = props.length; i < len; i++) {
        prop = props[i];
        if (typeof transferOb[prop] !== "undefined") {
            orig[prop] = transferOb[prop];
        }
    }
    return orig;
}

/**
 * Truncates an object's key/value pairs to a certain length
 * @param {Object} obj - original object to be truncated
 * @param {Number} keyLimit - limit for key length
 * @param {Number} valueLimit - limit for value length
 * @param {Number} segmentLimit - limit for segments pairs
 * @param {string} errorLog - prefix for error log
 * @param {function} logCall - internal logging function
 * @returns {Object} - the new truncated object
 */
function truncateObject(obj, keyLimit, valueLimit, segmentLimit, errorLog, logCall) {
    var ob = {};
    if (obj) {
        if (Object.keys(obj).length > segmentLimit) {
            var resizedObj = {};
            var i = 0;
            for (var e in obj) {
                if (i < segmentLimit) {
                    resizedObj[e] = obj[e];
                    i++;
                }
            }
            obj = resizedObj;
        }
        for (var key in obj) {
            var newKey = truncateSingleValue(key, keyLimit, errorLog, logCall);
            var newValue = truncateSingleValue(obj[key], valueLimit, errorLog, logCall);
            ob[newKey] = newValue;
        }
    }
    return ob;
}

/**
 * Truncates a single value to a certain length
 * @param {string|number} str - original value to be truncated
 * @param {Number} limit - limit length
 * @param {string} errorLog - prefix for error log
 * @param {function} logCall - internal logging function
 * @returns {string|number} - the new truncated value
 */
function truncateSingleValue(str, limit, errorLog, logCall) {
    var newStr = str;
    if (typeof str === "number") {
        str = str.toString();
    }
    if (typeof str === "string") {
        if (str.length > limit) {
            newStr = str.substring(0, limit);
            logCall(logLevelEnums.DEBUG, errorLog + ", Key: [ " + str + " ] is longer than accepted length. It will be truncated.");
        }
    }
    return newStr;
}

/**
 * Calculates the checksum of the data with the given salt
 * Uses SHA-256 algorithm with web crypto API
 * Implementation based on https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 * TODO: Turn to async function when we drop support for older browsers
 * @param {string} data - data to be used for checksum calculation (concatenated query parameters)
 * @param {string} salt - salt to be used for checksum calculation
 * @returns {string} checksum in hex format
 */
function calculateChecksum(data, salt) {
    const msgUint8 = new TextEncoder().encode(data + salt); // encode as (utf-8) Uint8Array
    return crypto.subtle.digest("SHA-256", msgUint8).then((hashBuffer) => { // hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
        const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""); // convert bytes to hex string
        return hashHex;
    }); 
}

/**
 *  Polyfill to get closest parent matching nodeName
 *  @param {HTMLElement} el - element from which to search
 *  @param {String} nodeName - tag/node name
 *  @returns {HTMLElement} closest parent element
 */
function get_closest_element(el, nodeName) {
    nodeName = nodeName.toUpperCase();
    while (el) {
        if (el.nodeName.toUpperCase() === nodeName) {
            return el;
        }
        el = el.parentElement;
    }
};

/**
 *  Listen to specific browser event
 *  @memberof Countly._internals
 *  @param {HTMLElement} element - HTML element that should listen to event
 *  @param {String} type - event name or action
 *  @param {Function} listener - callback when event is fired
 */
function add_event_listener(element, type, listener) {
    if (!isBrowser) {
        return;
    }
    if (element === null || typeof element === "undefined") { // element can be null so lets check it first
        if (checkIfLoggingIsOn()) {
            // eslint-disable-next-line no-console
            console.warn("[WARNING] [Countly] add_event_listener, Can't bind [" + type + "] event to nonexisting element");
        }
        return;
    }
    if (typeof element.addEventListener !== "undefined") {
        element.addEventListener(type, listener, false);
    }
    // for old browser use attachEvent instead
    else {
        element.attachEvent("on" + type, listener);
    }
};

/**
 *  Get element that fired event
 *  @memberof Countly._internals
 *  @param {Event} event - event that was filed
 *  @returns {HTMLElement} HTML element that caused event to fire
 */
function get_event_target(event) {
    if (!event) {
        return window.event.srcElement;
    }
    if (typeof event.target !== "undefined") {
        return event.target;
    }
    return event.srcElement;
};

/**
 *  Returns raw user agent string
 *  @memberof Countly._internals
 *  @param {string} uaOverride - a string value to pass instead of ua value
 *  @returns {string} currentUserAgentString - raw user agent string
 */
function currentUserAgentString(uaOverride) {
    if (uaOverride) {
        return uaOverride;
    }

    var ua_raw = navigator.userAgent;
    // check if userAgentData is supported and userAgent is not available, then use it
    if (!ua_raw) {
        ua_raw = currentUserAgentDataString();
    }
    // RAW USER AGENT STRING
    return ua_raw;
}

/**
 *  Forms user agent string from userAgentData by concatenating brand, version, mobile and platform
 *  @memberof Countly._internals
 *  @param {string} uaOverride - a string value to pass instead of ua value
 *  @returns {string} currentUserAgentString - user agent string from userAgentData
 */
function currentUserAgentDataString(uaOverride) {
    if (uaOverride) {
        return uaOverride;
    }

    var ua = "";
    if (navigator.userAgentData) {
        // turn brands array into string
        ua = navigator.userAgentData.brands.map(function (e) {
            return e.brand + ":" + e.version;
        }).join();
        // add mobile info
        ua += (navigator.userAgentData.mobile ? " mobi " : " ");
        // add platform info
        ua += navigator.userAgentData.platform;
    }
    return ua;
}

/**
 *  Returns device type information according to user agent string
 *  @memberof Countly._internals
 *  @param {string} uaOverride - a string value to pass instead of ua value
 *  @returns {string} userAgentDeviceDetection - current device type (desktop, tablet, phone)
 */
function userAgentDeviceDetection(uaOverride) {
    var userAgent;
    // TODO: refactor here
    if (uaOverride) {
        userAgent = uaOverride;
    }
    else if (navigator.userAgentData && navigator.userAgentData.mobile) {
        return "phone";
    }
    else {
        userAgent = currentUserAgentString();
    }
    // make it lowercase for regex to work properly
    userAgent = userAgent.toLowerCase();

    // assign the default device
    var device = "desktop";

    // regexps corresponding to tablets or phones that can be found in userAgent string
    var tabletCheck = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/;
    var phoneCheck = /(mobi|ipod|phone|blackberry|opera mini|fennec|minimo|symbian|psp|nintendo ds|archos|skyfire|puffin|blazer|bolt|gobrowser|iris|maemo|semc|teashark|uzard)/;

    // check whether the regexp values corresponds to something in the user agent string
    if (tabletCheck.test(userAgent)) {
        device = "tablet";
    }
    else if (phoneCheck.test(userAgent)) {
        device = "phone";
    }

    // set the device type
    return device;
}

/**
 *  Returns information regarding if the current user is a search bot or not
 *  @memberof Countly._internals
 *  @param {string} uaOverride - a string value to pass instead of ua value
 *  @returns {boolean} userAgentSearchBotDetection - if a search bot is reaching the site or not
 */
function userAgentSearchBotDetection(uaOverride) {
    // search bot regexp
    const searchBotRE = /(CountlySiteBot|nuhk|Googlebot|GoogleSecurityScanner|Yammybot|Openbot|Slurp|MSNBot|Ask Jeeves\/Teoma|ia_archiver|bingbot|Google Web Preview|Mediapartners-Google|AdsBot-Google|Baiduspider|Ezooms|YahooSeeker|AltaVista|AVSearch|Mercator|Scooter|InfoSeek|Ultraseek|Lycos|Wget|YandexBot|Yandex|YaDirectFetcher|SiteBot|Exabot|AhrefsBot|MJ12bot|TurnitinBot|magpie-crawler|Nutch Crawler|CMS Crawler|rogerbot|Domnutch|ssearch_bot|XoviBot|netseer|digincore|fr-crawler|wesee|AliasIO|contxbot|PingdomBot|BingPreview|HeadlessChrome|Lighthouse)/;

    // check override first
    if (uaOverride) {
        return searchBotRE.test(uaOverride);
    }

    // check both userAgent and userAgentData, as one of them might be containing the information we are looking for
    const ua_bot = searchBotRE.test(currentUserAgentString());
    const uaData_bot = searchBotRE.test(currentUserAgentDataString());

    return ua_bot || uaData_bot;
}

/**
 *  Modify event to set standard coordinate properties if they are not available
 *  @memberof Countly._internals
 *  @param {Event} e - event object
 *  @returns {Event} modified event object
 */
function get_page_coord(e) {
    // checking if pageY and pageX is already available
    if (typeof e.pageY === "undefined"
        && typeof e.clientX === "number"
        && document.documentElement) {
        // if not, then add scrolling positions
        e.pageX = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        e.pageY = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }
    // return e which now contains pageX and pageY attributes
    return e;
}

/**
 *  Get height of whole document
 *  @memberof Countly._internals
 *  @returns {Number} height in pixels
 */
function getDocHeight() {
    var D = document;
    return Math.max(
        Math.max(D.body.scrollHeight, D.documentElement.scrollHeight),
        Math.max(D.body.offsetHeight, D.documentElement.offsetHeight),
        Math.max(D.body.clientHeight, D.documentElement.clientHeight)
    );
}

/**
 *  Get width of whole document
 *  @memberof Countly._internals
 *  @returns {Number} width in pixels
 */
function getDocWidth() {
    var D = document;
    return Math.max(
        Math.max(D.body.scrollWidth, D.documentElement.scrollWidth),
        Math.max(D.body.offsetWidth, D.documentElement.offsetWidth),
        Math.max(D.body.clientWidth, D.documentElement.clientWidth)
    );
}

/**
 *  Get height of viewable area
 *  @memberof Countly._internals
 *  @returns {Number} height in pixels
 */
function getViewportHeight() {
    var D = document;
    return Math.min(
        Math.min(D.body.clientHeight, D.documentElement.clientHeight),
        Math.min(D.body.offsetHeight, D.documentElement.offsetHeight),
        window.innerHeight
    );
}

/**
 *  Get device's orientation
 *  @returns {String} device orientation
 */
function getOrientation() {
    return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}



/**
 *  Load external js files
 *  @param {String} tag - Tag/node name to load file in
 *  @param {String} attr - Attribute name for type
 *  @param {String} type - Type value
 *  @param {String} src - Attribute name for file path
 *  @param {String} data - File path
 *  @param {Function} callback - callback when done
 */
function loadFile(tag, attr, type, src, data, callback) {
    var fileRef = document.createElement(tag);
    var loaded;
    fileRef.setAttribute(attr, type);
    fileRef.setAttribute(src, data);
    var callbackFunction = function () {
        if (!loaded) {
            callback();
        }
        loaded = true;
    };
    if (callback) {
        fileRef.onreadystatechange = callbackFunction;
        fileRef.onload = callbackFunction;
    }
    document.getElementsByTagName("head")[0].appendChild(fileRef);
}

/**
 *  Load external js files
 *  @memberof Countly._internals
 *  @param {String} js - path to JS file
 *  @param {Function} callback - callback when done
 */
function loadJS(js, callback) {
    loadFile("script", "type", "text/javascript", "src", js, callback);
}

/**
 *  Load external css files
 *  @memberof Countly._internals
 *  @param {String} css - path to CSS file
 *  @param {Function} callback - callback when done
 */
function loadCSS(css, callback) {
    loadFile("link", "rel", "stylesheet", "href", css, callback);
}

/**
 *  Show loader UI when loading external data
 *  @memberof Countly._internals
 */
function showLoader() {
    if (!isBrowser) {
        return;
    }
    var loader = document.getElementById("cly-loader");
    if (!loader) {
        var css = "#cly-loader {height: 4px; width: 100%; position: absolute; z-index: 99999; overflow: hidden; background-color: #fff; top:0px; left:0px;}"
            + "#cly-loader:before{display: block; position: absolute; content: ''; left: -200px; width: 200px; height: 4px; background-color: #2EB52B; animation: cly-loading 2s linear infinite;}"
            + "@keyframes cly-loading { from {left: -200px; width: 30%;} 50% {width: 30%;} 70% {width: 70%;} 80% { left: 50%;} 95% {left: 120%;} to {left: 100%;}}";
        var head = document.head || document.getElementsByTagName("head")[0];
        var style = document.createElement("style");
        style.type = "text/css";
        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        }
        else {
            style.appendChild(document.createTextNode(css));
        }
        head.appendChild(style);
        loader = document.createElement("div");
        loader.setAttribute("id", "cly-loader");
        window.addEventListener("load", () => {
            if (Countly.showLoaderProtection) {
                if (checkIfLoggingIsOn()) {
                    console.warn("[WARNING] [Countly] showLoader, Loader is already on");
                }
                return;
            }
            try {
                document.body.appendChild(loader);
            } catch (e) {
                if (checkIfLoggingIsOn()) {
                    console.error("[ERROR] [Countly] showLoader, Body is not loaded for loader to append: " + e);
                }
            }
        });

    }
    loader.style.display = "block";
}

/**
 *  Checks if debug is true and console is available in Countly object
 *  @memberof Countly._internals 
 * @returns {Boolean} true if debug is true and console is available in Countly object
 */
function checkIfLoggingIsOn() {
    // check if logging is enabled
    if (Countly && Countly.debug && typeof console !== "undefined") {
        return true;
    }
    return false;
}

/**
 *  Hide loader UI
 *  @memberof Countly._internals
 */
function hideLoader() {
    if (!isBrowser) {
        return;
    }
    // Inform showLoader that it should not append the loader
    Countly.showLoaderProtection = true;
    var loader = document.getElementById("cly-loader");
    if (loader) {
        loader.style.display = "none";
    }
}

export {
    getMultiSelectValues,
    secureRandom,
    generateUUID,
    replacePatternWithRandomValues,
    getTimestamp,
    getMsTimestamp,
    getConfig,
    dispatchErrors,
    prepareParams,
    stripTrailingSlash,
    createNewObjectFromProperties,
    addNewProperties,
    truncateObject,
    truncateSingleValue,
    get_closest_element,
    add_event_listener,
    get_event_target,
    currentUserAgentString,
    userAgentDeviceDetection,
    userAgentSearchBotDetection,
    get_page_coord,
    getDocHeight,
    getDocWidth,
    getViewportHeight,
    getOrientation,
    loadJS,
    loadCSS,
    showLoader,
    checkIfLoggingIsOn,
    hideLoader,
    currentUserAgentDataString,
    calculateChecksum
}; 