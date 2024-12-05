import CountlyClass from "./modules/CountlyClass.js";
import { featureEnums, DeviceIdTypeInternalEnums, CDN } from "./modules/Constants.js";
import { checkIfLoggingIsOn } from "./modules/Utils.js";
import { isBrowser, Countly } from "./modules/Platform.js";

var apmLibrariesNotLoaded = true; // used to prevent loading apm scripts multiple times.

Countly.features = [featureEnums.APM, featureEnums.ATTRIBUTION, featureEnums.CLICKS, featureEnums.CRASHES, featureEnums.EVENTS, featureEnums.FEEDBACK, featureEnums.FORMS, featureEnums.LOCATION, featureEnums.REMOTE_CONFIG, featureEnums.SCROLLS, featureEnums.SESSIONS, featureEnums.STAR_RATING, featureEnums.USERS, featureEnums.VIEWS];
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
    }
    return Countly.i[appKey];
};

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
    var intervalID = setInterval(function () {
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
            clearInterval(intervalID);
        }
    }, intervalDuration);
}

/**
* Overwrite serialization function for extending SDK with encryption, etc
* @param {any} value - value to serialize
* @return {string} serialized value
* */
Countly.serialize = function (value) {
    // Convert object values to JSON
    if (typeof value === "object") {
        value = JSON.stringify(value);
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
        if (checkIfLoggingIsOn()) {
            // eslint-disable-next-line no-console
            console.warn("[WARNING] [Countly] deserialize, Could not parse the file:[" + data + "], error: " + e);
        }
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
 *  Monitor parallel storage changes like other opened tabs
 */
if (isBrowser) {
    window.addEventListener("storage", function (e) {
        var parts = (e.key + "").split("/");
        var key = parts.pop();
        var appKey = parts.pop();
        if (Countly.i && Countly.i[appKey]) {
            Countly.i[appKey]._internals.onStorageChange(key, e.newValue);
        }
    });
}

export default Countly;