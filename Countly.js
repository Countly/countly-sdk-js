import CountlyClass from "./modules/CountlyClass.js";
import { featureList, DeviceIdTypeInternalEnums, CDN, logLevelEnums, preInitCallLimit } from "./modules/Constants.js";
import { add_event_listener, sdkClearInterval, sdkSetInterval, stripTrailingSlash } from "./modules/Utils.js";
import { isBrowser, Countly } from "./modules/Platform.js";
import { addPreInitFunctions, preInitCalls } from "./modules/PreInit.js";

var apmLibrariesNotLoaded = true; // used to prevent loading apm scripts multiple times.

Countly.features = featureList.slice();
Countly.q = Countly.q || [];
Countly.onload = Countly.onload || [];
Countly.CountlyClass = CountlyClass;

Countly.init = function (conf) {
    conf = conf || {};
    if (Countly.loadAPMScriptsAsync && apmLibrariesNotLoaded) {
        apmLibrariesNotLoaded = false;
        initAfterLoadingAPM(conf);
        return;
    }
    var appKey = conf.app_key || Countly.app_key;
    if (!Countly.i || !Countly.i[appKey]) {
        var inst = new CountlyClass(conf);
        if (!Countly.i) {
            Countly.i = {};
            for (var key in inst) {
                Countly[key] = inst[key];
            }
        }
        Countly.i[appKey] = inst;
        var calls = preInitCalls(Countly);
        if (calls.ignored > 0) {
            inst._internals.log(logLevelEnums.WARNING, "init, " + calls.ignored + " calls made before init were ignored, as " + preInitCallLimit + " were waiting already");
            calls.ignored = 0;
        }
        if (!inst.check_any_consent()) {
            runQueuedConsentCalls();
        }
        // made before init, they run ahead of the calls made after it, but wait for the consent an app gives right after init
        if (inst.check_any_consent()) {
            inst._internals.processAsyncQueue();
        }
    }
    return Countly.i[appKey];
};

/**
 * Runs the consent calls waiting in Countly.q ahead of the other calls there, so that the consent an app gave before init
 * applies to every call it made before init. Countly.q stays the same array, as a tag that pushes to it may keep it.
 */
function runQueuedConsentCalls() {
    var consentCalls = ["group_features", "add_consent", "remove_consent"];
    var others = [];
    Countly.q.splice(0, Countly.q.length).forEach(function (call) {
        var name = typeof call === "function" ? call.clyName : Array.isArray(call) && call[0];
        if (consentCalls.indexOf(name) === -1) {
            others.push(call);
        }
        else if (typeof call === "function") {
            call();
        }
        else {
            Countly[name].apply(Countly, call.slice(1));
        }
    });
    Countly.q.push.apply(Countly.q, others);
}

addPreInitFunctions(Countly, isBrowser || (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope));

function initAfterLoadingAPM(conf) {
    // TODO: We assume we are in browser context. If browser context checks at top are removed this code should have its own check.
    // TODO: We already have a loadFile and loadJS functions but they are not used here. If readability would improve that way, they can also be considered here.

    // Create boomerang script
    var boomerangScript = document.createElement("script");
    var countlyBoomerangScript = document.createElement("script");

    // Set boomerang script attributes
    boomerangScript.async = true;
    countlyBoomerangScript.async = true;

    // Set boomerang script source
    boomerangScript.src = Countly.customSourceBoomerang || CDN.BOOMERANG_SRC;
    countlyBoomerangScript.src = Countly.customSourceCountlyBoomerang || CDN.CLY_BOOMERANG_SRC;

    // Append boomerang script to the head
    document.getElementsByTagName("head")[0].appendChild(boomerangScript);
    document.getElementsByTagName("head")[0].appendChild(countlyBoomerangScript);

    var boomLoaded = false;
    var countlyBoomLoaded = false;
    boomerangScript.onload = function () {
        boomLoaded = true;
    };
    countlyBoomerangScript.onload = function () {
        countlyBoomLoaded = true;
    };

    var timeoutCounter = 0;
    var intervalDuration = 50;
    var timeoutLimit = 1500; // TODO: Configurable? Mb with Countly.apmScriptLoadTimeout?
    // init Countly only after boomerang is loaded
    var intervalID = sdkSetInterval(function () {
        timeoutCounter += intervalDuration;
        if ((boomLoaded && countlyBoomLoaded) || (timeoutCounter >= timeoutLimit)) {
            if (Countly.debug) {
                var message = "BoomerangJS loaded:[" + boomLoaded + "], countly_boomerang loaded:[" + countlyBoomLoaded + "].";
                if (boomLoaded && countlyBoomLoaded) {
                    message = "[DEBUG] " + message;
                    // eslint-disable-next-line no-console
                    console.log(message);
                }
                else {
                    message = "[WARNING] " + message + " Initializing without APM.";
                    // eslint-disable-next-line no-console
                    console.warn(message);
                }
            }
            Countly.init(conf);
            sdkClearInterval(intervalID);
        }
    }, intervalDuration);
}

/**
* Overwrite serialization function for extending SDK with encryption, etc
* @param {any} value - value to serialize
* @return {string} serialized value
* */
Countly.serialize = function (value) {
    try {
        // Convert object values to JSON
        if (typeof value === "object") {
            value = JSON.stringify(value);
        }
    } catch (error) {
        // silent fail        
    }
    return value;
};

/**
* Overwrite deserialization function for extending SDK with encryption, etc
* @param {string} data - value to deserialize
* @return {varies} deserialized value
* */
Countly.deserialize = function (data) {
    if (data === "") { // we expect string or null only. Empty sting would throw an error.
        return data;
    }
    // Try to parse JSON...
    try {
        data = JSON.parse(data);
    }
    catch (e) {
        // silent fail
    }

    return data;
};

/**
* Overwrite a way to retrieve view name
* @return {string} view name
* */
Countly.getViewName = function () {
    if (!isBrowser) {
        return "web_worker";
    }
    return window.location.pathname;
};

/**
* Overwrite a way to retrieve view url
* @return {string} view url
* */
Countly.getViewUrl = function () {
    if (!isBrowser) {
        return "web_worker";
    }
    return window.location.pathname;
};
// automatic view tracking tells these defaults from an app's own functions, which win over automatic_view_tracking_mode
Object.defineProperty(Countly.getViewName, "clyDefault", { value: true });
Object.defineProperty(Countly.getViewUrl, "clyDefault", { value: true });

/**
* Overwrite a way to get search query
* @return {string} view url
* */
Countly.getSearchQuery = function () {
    if (!isBrowser) {
        return;
    }
    return window.location.search;
};

/**
* Possible device Id types are: DEVELOPER_SUPPLIED, SDK_GENERATED, TEMPORARY_ID
* @enum DeviceIdType
* */
Countly.DeviceIdType = {
    DEVELOPER_SUPPLIED: DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED,
    SDK_GENERATED: DeviceIdTypeInternalEnums.SDK_GENERATED,
    TEMPORARY_ID: DeviceIdTypeInternalEnums.TEMPORARY_ID
};

/**
 *  Monitor parallel storage changes like other opened tabs, once for each Countly object: another copy of the SDK on
 *  the page, as from the script tag and a bundle, shares this object and its instances through the global Countly
 */
if (isBrowser && !Countly.clyWatchesStorage) {
    Object.defineProperty(Countly, "clyWatchesStorage", { value: true });
    add_event_listener(window, "storage", function (e) {
        try {
            // each tab keeps its queues in its own sessionStorage, which other frames of that tab can change too
            if (e.storageArea && e.storageArea !== window.localStorage) {
                return;
            }
        }
        catch (ex) {
            return;
        }
        var parts = (e.key + "").split("/");
        var key = parts.pop();
        var appKey = parts.pop();
        var inst = Countly.i && Countly.i[appKey];
        // what is left of the key is the namespace, which has to be the instance's own
        if (inst && parts.join("/") === stripTrailingSlash(inst.namespace || "")) {
            inst._internals.onStorageChange(key, e.newValue);
        }
    });
}

/**
 *  The CommonJS and UMD bundles hand out Countly itself, so import and require() get the SDK under every module system.
 *  Countly.default and __esModule keep code written as Countly.default.init and bundlers that read __esModule working;
 *  they are not enumerable, so they do not show when Countly is listed or serialized.
 */
Object.defineProperty(Countly, "default", { value: Countly, enumerable: false, writable: true, configurable: true });
Object.defineProperty(Countly, "__esModule", { value: true, enumerable: false });

export default Countly;