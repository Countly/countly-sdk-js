

import { DeviceIdTypeInternalEnums, SDK_NAME, SDK_VERSION, configurationDefaultValues, featureEnums, healthCheckCounterEnum, internalEventKeyEnums, internalEventKeyEnumsArray, logLevelEnums, urlParseRE } from "./Constants.js";
import {
    getMultiSelectValues,
    secureRandom,
    generateUUID,
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
    currentUserAgentDataString,
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
    calculateChecksum
} from "./Utils.js";
import { isBrowser, Countly } from "./Platform.js";

class CountlyClass {
    #consentTimer;
    #self;
    #global;
    #sessionStarted;
    #apiPath;
    #readPath;
    #beatInterval;
    #queueSize;
    #requestQueue;
    #eventQueue;
    #remoteConfigs;
    #crashLogs;
    #timedEvents;
    #ignoreReferrers;
    #crashSegments;
    #autoExtend;
    #lastBeat;
    #storedDuration;
    #lastView;
    #lastViewTime;
    #lastViewStoredDuration;
    #failTimeout;
    #failTimeoutAmount;
    #inactivityTime;
    #inactivityCounter;
    #sessionUpdate;
    #maxEventBatch;
    #maxCrashLogs;
    #useSessionCookie;
    #sessionCookieTimeout;
    #readyToProcess;
    #hasPulse;
    #offlineMode;
    #lastParams;
    #trackTime;
    #startTime;
    #lsSupport;
    #firstView;
    #deviceIdType;
    #isScrollRegistryOpen;
    #scrollRegistryTopPosition;
    #trackingScrolls;
    #currentViewId;
    #previousViewId;
    #freshUTMTags;
    #sdkName;
    #sdkVersion;
    #shouldSendHC;
    #consents;
    #generatedRequests;
    #contentTimeInterval;
    #contentEndPoint;
    #inContentZone;
    #contentZoneTimer;
    #contentIframeID;
constructor(ob) {
        this.#self = this;
        this.#global = !Countly.i;
        this.#sessionStarted = false;
        this.#apiPath = "/i";
        this.#readPath = "/o/sdk";
        this.#beatInterval = getConfig("interval", ob, configurationDefaultValues.BEAT_INTERVAL);
        this.#queueSize = getConfig("queue_size", ob, configurationDefaultValues.QUEUE_SIZE);
        this.#requestQueue = [];
        this.#eventQueue = [];
        this.#remoteConfigs = {};
        this.#crashLogs = [];
        this.#timedEvents = {};
        this.#ignoreReferrers = getConfig("ignore_referrers", ob, []);
        this.#crashSegments = null;
        this.#autoExtend = true;
        this.#lastBeat;
        this.#storedDuration = 0;
        this.#lastView = null;
        this.#lastViewTime = 0;
        this.#lastViewStoredDuration = 0;
        this.#failTimeout = 0;
        this.#failTimeoutAmount = getConfig("fail_timeout", ob, configurationDefaultValues.FAIL_TIMEOUT_AMOUNT);
        this.#inactivityTime = getConfig("inactivity_time", ob, configurationDefaultValues.INACTIVITY_TIME);
        this.#inactivityCounter = 0;
        this.#sessionUpdate = getConfig("session_update", ob, configurationDefaultValues.SESSION_UPDATE);
        this.#maxEventBatch = getConfig("max_events", ob, configurationDefaultValues.MAX_EVENT_BATCH);
        this.#maxCrashLogs = getConfig("max_logs", ob, null);
        this.#useSessionCookie = getConfig("use_session_cookie", ob, true);
        this.#sessionCookieTimeout = getConfig("session_cookie_timeout", ob, configurationDefaultValues.SESSION_COOKIE_TIMEOUT);
        this.#readyToProcess = true;
        this.#hasPulse = false;
        this.#offlineMode = getConfig("offline_mode", ob, false);
        this.#lastParams = {};
        this.#trackTime = true;
        this.#startTime = getTimestamp();
        this.#lsSupport = true;
        this.#firstView = null;
        this.#deviceIdType = DeviceIdTypeInternalEnums.SDK_GENERATED;
        this.#isScrollRegistryOpen = false;
        this.#scrollRegistryTopPosition = 0;
        this.#trackingScrolls = false;
        this.#currentViewId = null; // this is the global variable for tracking the current view's ID. Used in view tracking. Becomes previous view ID at the end.
        this.#previousViewId = null; // this is the global variable for tracking the previous view's ID. Used in view tracking. First view has no previous view ID.
        this.#freshUTMTags = null;
        this.#sdkName = getConfig("sdk_name", ob, SDK_NAME);
        this.#sdkVersion = getConfig("sdk_version", ob, SDK_VERSION);
        this.#shouldSendHC = false;
        this.#generatedRequests = [];
        this.#contentTimeInterval = 30000;
        this.#contentEndPoint = "/o/sdk/content";
        this.#inContentZone = false;
        this.#contentZoneTimer = null;
        this.#contentIframeID = "cly-content-iframe";

        try {
            localStorage.setItem("cly_testLocal", true);
            // clean up test
            localStorage.removeItem("cly_testLocal");
        }
        catch (e) {
            this.#log(logLevelEnums.ERROR, "Local storage test failed, Halting local storage support: " + e);
            this.#lsSupport = false;
        }

        // create object to store consents
        this.#consents = {};
        for (var it = 0; it < Countly.features.length; it++) {
            this.#consents[Countly.features[it]] = {};
        }

        this.#initialize(ob);
    };

    /**
     * Initialize the Countly
     * @param {Object} ob - config object
     * @returns 
     */
    #initialize = (ob) => {
        this.serialize = getConfig("serialize", ob, Countly.serialize);
        this.deserialize = getConfig("deserialize", ob, Countly.deserialize);
        this.getViewName = getConfig("getViewName", ob, Countly.getViewName);
        this.getViewUrl = getConfig("getViewUrl", ob, Countly.getViewUrl);
        this.getSearchQuery = getConfig("getSearchQuery", ob, Countly.getSearchQuery);
        this.DeviceIdType = Countly.DeviceIdType; // it is Countly device Id type Enums for clients to use
        this.namespace = getConfig("namespace", ob, "");
        this.clearStoredId = getConfig("clear_stored_id", ob, false);
        this.app_key = getConfig("app_key", ob, null);
        this.onload = getConfig("onload", ob, []);
        this.utm = getConfig("utm", ob, { source: true, medium: true, campaign: true, term: true, content: true });
        this.ignore_prefetch = getConfig("ignore_prefetch", ob, true);
        this.rcAutoOptinAb = getConfig("rc_automatic_optin_for_ab", ob, true);
        this.useExplicitRcApi = getConfig("use_explicit_rc_api", ob, false);
        this.debug = getConfig("debug", ob, false);
        this.test_mode = getConfig("test_mode", ob, false);
        this.test_mode_eq = getConfig("test_mode_eq", ob, false);
        this.metrics = getConfig("metrics", ob, {});
        this.headers = getConfig("headers", ob, {});
        this.url = stripTrailingSlash(getConfig("url", ob, ""));
        this.app_version = getConfig("app_version", ob, "0.0");
        this.country_code = getConfig("country_code", ob, null);
        this.city = getConfig("city", ob, null);
        this.ip_address = getConfig("ip_address", ob, null);
        this.ignore_bots = getConfig("ignore_bots", ob, true);
        this.force_post = getConfig("force_post", ob, false);
        this.remote_config = getConfig("remote_config", ob, false);
        this.ignore_visitor = getConfig("ignore_visitor", ob, false);
        this.require_consent = getConfig("require_consent", ob, false);
        this.track_domains = !isBrowser ? undefined : getConfig("track_domains", ob, true);
        this.storage = getConfig("storage", ob, "default");
        this.enableOrientationTracking = !isBrowser ? undefined : getConfig("enable_orientation_tracking", ob, true);
        this.maxKeyLength = getConfig("max_key_length", ob, configurationDefaultValues.MAX_KEY_LENGTH);
        this.maxValueSize = getConfig("max_value_size", ob, configurationDefaultValues.MAX_VALUE_SIZE);
        this.maxSegmentationValues = getConfig("max_segmentation_values", ob, configurationDefaultValues.MAX_SEGMENTATION_VALUES);
        this.maxBreadcrumbCount = getConfig("max_breadcrumb_count", ob, null);
        this.maxStackTraceLinesPerThread = getConfig("max_stack_trace_lines_per_thread", ob, configurationDefaultValues.MAX_STACKTRACE_LINES_PER_THREAD);
        this.maxStackTraceLineLength = getConfig("max_stack_trace_line_length", ob, configurationDefaultValues.MAX_STACKTRACE_LINE_LENGTH);
        this.heatmapWhitelist = getConfig("heatmap_whitelist", ob, []);
        this.salt = getConfig("salt", ob, null);
        this.hcErrorCount = this.#getValueFromStorage(healthCheckCounterEnum.errorCount) || 0;
        this.hcWarningCount = this.#getValueFromStorage(healthCheckCounterEnum.warningCount) || 0;
        this.hcStatusCode = this.#getValueFromStorage(healthCheckCounterEnum.statusCode) || -1;
        this.hcErrorMessage = this.#getValueFromStorage(healthCheckCounterEnum.errorMessage) || "";

        if (this.#maxCrashLogs && !this.maxBreadcrumbCount) {
            this.maxBreadcrumbCount = this.#maxCrashLogs;
            this.#log(logLevelEnums.WARNING, "initialize, 'maxCrashLogs' is deprecated. Use 'maxBreadcrumbCount' instead!");
        }
        else if (!this.#maxCrashLogs && !this.maxBreadcrumbCount) {
            this.maxBreadcrumbCount = 100;
        }

        if (this.storage === "cookie") {
            this.#lsSupport = false;
        }

        if (!this.rcAutoOptinAb && !this.useExplicitRcApi) {
            this.#log(logLevelEnums.WARNING, "initialize, Auto opting is disabled, switching to explicit RC API");
            this.useExplicitRcApi = true;
        }

        if (!Array.isArray(this.#ignoreReferrers)) {
            this.#ignoreReferrers = [];
        }

        if (this.url === "") {
            this.#log(logLevelEnums.ERROR, "initialize, Please provide server URL");
            this.ignore_visitor = true;
        }
        if (this.#getValueFromStorage("cly_ignore")) {
            // opted out user
            this.ignore_visitor = true;
        }
        this.#checkIgnore();

        if (isBrowser) {
            if (window.name && window.name.indexOf("cly:") === 0) {
                try {
                    this.passed_data = JSON.parse(window.name.replace("cly:", ""));
                }
                catch (ex) {
                    this.#log(logLevelEnums.ERROR, "initialize, Could not parse name: " + window.name + ", error: " + ex);
                }
            }
            else if (location.hash && location.hash.indexOf("this.#cly:") === 0) {
                try {
                    this.passed_data = JSON.parse(location.hash.replace("this.#cly:", ""));
                }
                catch (ex) {
                    this.#log(logLevelEnums.ERROR, "initialize, Could not parse hash: " + location.hash + ", error: " + ex);
                }
            }
        }

        if ((this.passed_data && this.passed_data.app_key && this.passed_data.app_key === this.app_key) || (this.passed_data && !this.passed_data.app_key && this.#global)) {
            if (this.passed_data.token && this.passed_data.purpose) {
                if (this.passed_data.token !== this.#getValueFromStorage("cly_old_token")) {
                    this.#setToken(this.passed_data.token);
                    this.#setValueInStorage("cly_old_token", this.passed_data.token);
                }
                var strippedList = [];
                // if whitelist is provided is an array
                if (Array.isArray(this.heatmapWhitelist)) {
                    this.heatmapWhitelist.push(this.url);
                    strippedList = this.heatmapWhitelist.map((e) => {
                        // remove trailing slashes from the entries
                        return stripTrailingSlash(e);
                    });
                }
                else {
                    strippedList = [this.url];
                }
                // if the passed url is in the whitelist proceed
                if (strippedList.includes(this.passed_data.url)) {
                    if (this.passed_data.purpose === "heatmap") {
                        this.ignore_visitor = true;
                        showLoader();
                        loadJS(this.passed_data.url + "/views/heatmap.js", hideLoader);
                    }
                }
            }
        }

        if (this.ignore_visitor) {
            this.#log(logLevelEnums.WARNING, "initialize, ignore_visitor:[" + this.ignore_visitor + "], this user will not be tracked");
            return;
        }

        this.#migrate();

        this.#requestQueue = this.#getValueFromStorage("cly_queue") || [];
        this.#eventQueue = this.#getValueFromStorage("cly_event") || [];
        this.#remoteConfigs = this.#getValueFromStorage("cly_remote_configs") || {};

        // flag that indicates that the offline mode was enabled at the end of the previous app session 
        var tempIdModeWasEnabled = (this.#getValueFromStorage("cly_id") === "[CLY]_temp_id");

        if (this.clearStoredId) {
            // retrieve stored device ID and type from local storage and use it to flush existing events
            if (this.#getValueFromStorage("cly_id") && !tempIdModeWasEnabled) {
                this.device_id = this.#getValueFromStorage("cly_id");
                this.#log(logLevelEnums.DEBUG, "initialize, temporarily using the previous device ID to flush existing events");
                this.#deviceIdType = this.#getValueFromStorage("cly_id_type");
                if (!this.#deviceIdType) {
                    this.#log(logLevelEnums.DEBUG, "initialize, No device ID type info from the previous session, falling back to DEVELOPER_SUPPLIED, for event flushing");
                    this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
                }
                // don't process async queue here, just send the events (most likely async data is for the new user)
                this.#sendEventsForced();
                // set them back to their initial values
                this.device_id = undefined;
                this.#deviceIdType = DeviceIdTypeInternalEnums.SDK_GENERATED;
            }
            // then clear the storage so that a new device ID is set again later
            this.#log(logLevelEnums.INFO, "initialize, Clearing the device ID storage");
            this.#removeValueFromStorage("cly_id");
            this.#removeValueFromStorage("cly_id_type");
            this.#removeValueFromStorage("cly_session");
        }

        // init configuration is printed out here:
        // key values should be printed out as is
        if (this.#sdkName === SDK_NAME && this.#sdkVersion === SDK_VERSION) {
            this.#log(logLevelEnums.DEBUG, "initialize, SDK name:[" + this.#sdkName + "], version:[" + this.#sdkVersion + "]");
        } else {
            this.#log(logLevelEnums.DEBUG, "initialize, SDK name:[" + this.#sdkName + "], version:[" + this.#sdkVersion + "], default name:[" + SDK_NAME + "] and default version:[" + SDK_VERSION + "]");
        }
        this.#log(logLevelEnums.DEBUG, "initialize, app_key:[" + this.app_key + "], url:[" + this.url + "]");
        this.#log(logLevelEnums.DEBUG, "initialize, device_id:[" + getConfig("device_id", ob, undefined) + "]");
        this.#log(logLevelEnums.DEBUG, "initialize, require_consent is enabled:[" + this.require_consent + "]");
        try {
            this.#log(logLevelEnums.DEBUG, "initialize, metric override:[" + JSON.stringify(this.metrics) + "]");
            this.#log(logLevelEnums.DEBUG, "initialize, header override:[" + JSON.stringify(this.headers) + "]");
            // empty array is truthy and so would be printed if provided
            this.#log(logLevelEnums.DEBUG, "initialize, number of onload callbacks provided:[" + this.onload.length + "]");
            // if the utm object is different to default utm object print it here
            this.#log(logLevelEnums.DEBUG, "initialize, utm tags:[" + JSON.stringify(this.utm) + "]");
            // empty array printed if non provided
            if (this.#ignoreReferrers) {
                this.#log(logLevelEnums.DEBUG, "initialize, referrers to ignore :[" + JSON.stringify(this.#ignoreReferrers) + "]");
            }
            this.#log(logLevelEnums.DEBUG, "initialize, salt given:[" + !!this.salt + "]");
        }
        catch (e) {
            this.#log(logLevelEnums.ERROR, "initialize, Could not stringify some config object values");
        }
        this.#log(logLevelEnums.DEBUG, "initialize, app_version:[" + this.app_version + "]");

        // location info printed here
        this.#log(logLevelEnums.DEBUG, "initialize, provided location info; country_code:[" + this.country_code + "], city:[" + this.city + "], ip_address:[" + this.ip_address + "]");

        // print non vital values only if provided by the developer or differs from the default value
        if (this.namespace !== "") {
            this.#log(logLevelEnums.DEBUG, "initialize, namespace given:[" + this.namespace + "]");
        }
        if (this.clearStoredId) {
            this.#log(logLevelEnums.DEBUG, "initialize, clearStoredId flag set to:[" + this.clearStoredId + "]");
        }
        if (this.ignore_prefetch) {
            this.#log(logLevelEnums.DEBUG, "initialize, ignoring pre-fetching and pre-rendering from counting as real website visits :[" + this.ignore_prefetch + "]");
        }
        // if test mode is enabled warn the user
        if (this.test_mode) {
            this.#log(logLevelEnums.WARNING, "initialize, test_mode:[" + this.test_mode + "], request queue won't be processed");
        }
        if (this.test_mode_eq) {
            this.#log(logLevelEnums.WARNING, "initialize, test_mode_eq:[" + this.test_mode_eq + "], event queue won't be processed");
        }
        // if test mode is enabled warn the user
        if (this.heatmapWhitelist) {
            this.#log(logLevelEnums.DEBUG, "initialize, heatmap whitelist:[" + JSON.stringify(this.heatmapWhitelist) + "], these domains will be whitelisted");
        }
        // if storage is se to something other than local storage
        if (this.storage !== "default") {
            this.#log(logLevelEnums.DEBUG, "initialize, storage is set to:[" + this.storage + "]");
        }
        if (this.ignore_bots) {
            this.#log(logLevelEnums.DEBUG, "initialize, ignore traffic from bots :[" + this.ignore_bots + "]");
        }
        if (this.force_post) {
            this.#log(logLevelEnums.DEBUG, "initialize, forced post method for all requests:[" + this.force_post + "]");
        }
        if (this.remote_config) {
            this.#log(logLevelEnums.DEBUG, "initialize, remote_config callback provided:[" + !!this.remote_config + "]");
        }
        if (typeof this.rcAutoOptinAb === "boolean") {
            this.#log(logLevelEnums.DEBUG, "initialize, automatic RC optin is enabled:[" + this.rcAutoOptinAb + "]");
        }
        if (!this.useExplicitRcApi) {
            this.#log(logLevelEnums.WARNING, "initialize, will use legacy RC API. Consider enabling new API during init with use_explicit_rc_api flag");
        }
        if (this.track_domains) {
            this.#log(logLevelEnums.DEBUG, "initialize, tracking domain info:[" + this.track_domains + "]");
        }
        if (this.enableOrientationTracking) {
            this.#log(logLevelEnums.DEBUG, "initialize, enableOrientationTracking:[" + this.enableOrientationTracking + "]");
        }
        if (!this.#useSessionCookie) {
            this.#log(logLevelEnums.WARNING, "initialize, use_session_cookie is enabled:[" + this.#useSessionCookie + "]");
        }
        if (this.#offlineMode) {
            this.#log(logLevelEnums.DEBUG, "initialize, offline_mode:[" + this.#offlineMode + "], user info won't be send to the servers");
        }
        if (this.#remoteConfigs) {
            this.#log(logLevelEnums.DEBUG, "initialize, stored remote configs:[" + JSON.stringify(this.#remoteConfigs) + "]");
        }
        // functions, if provided, would be printed as true without revealing their content
        this.#log(logLevelEnums.DEBUG, "initialize, 'getViewName' callback override provided:[" + (this.getViewName !== Countly.getViewName) + "]");
        this.#log(logLevelEnums.DEBUG, "initialize, 'getSearchQuery' callback override provided:[" + (this.getSearchQuery !== Countly.getSearchQuery) + "]");

        // limits are printed here if they were modified 
        if (this.maxKeyLength !== configurationDefaultValues.MAX_KEY_LENGTH) {
            this.#log(logLevelEnums.DEBUG, "initialize, maxKeyLength set to:[" + this.maxKeyLength + "] characters");
        }
        if (this.maxValueSize !== configurationDefaultValues.MAX_VALUE_SIZE) {
            this.#log(logLevelEnums.DEBUG, "initialize, maxValueSize set to:[" + this.maxValueSize + "] characters");
        }
        if (this.maxSegmentationValues !== configurationDefaultValues.MAX_SEGMENTATION_VALUES) {
            this.#log(logLevelEnums.DEBUG, "initialize, maxSegmentationValues set to:[" + this.maxSegmentationValues + "] key/value pairs");
        }
        if (this.maxBreadcrumbCount !== configurationDefaultValues.MAX_BREADCRUMB_COUNT) {
            this.#log(logLevelEnums.DEBUG, "initialize, maxBreadcrumbCount for custom logs set to:[" + this.maxBreadcrumbCount + "] entries");
        }
        if (this.maxStackTraceLinesPerThread !== configurationDefaultValues.MAX_STACKTRACE_LINES_PER_THREAD) {
            this.#log(logLevelEnums.DEBUG, "initialize, maxStackTraceLinesPerThread set to:[" + this.maxStackTraceLinesPerThread + "] lines");
        }
        if (this.maxStackTraceLineLength !== configurationDefaultValues.MAX_STACKTRACE_LINE_LENGTH) {
            this.#log(logLevelEnums.DEBUG, "initialize, maxStackTraceLineLength set to:[" + this.maxStackTraceLineLength + "] characters");
        }
        if (this.#beatInterval !== configurationDefaultValues.BEAT_INTERVAL) {
            this.#log(logLevelEnums.DEBUG, "initialize, interval for heartbeats set to:[" + this.#beatInterval + "] milliseconds");
        }
        if (this.#queueSize !== configurationDefaultValues.QUEUE_SIZE) {
            this.#log(logLevelEnums.DEBUG, "initialize, queue_size set to:[" + this.#queueSize + "] items max");
        }
        if (this.#failTimeoutAmount !== configurationDefaultValues.FAIL_TIMEOUT_AMOUNT) {
            this.#log(logLevelEnums.DEBUG, "initialize, fail_timeout set to:[" + this.#failTimeoutAmount + "] seconds of wait time after a failed connection to server");
        }
        if (this.#inactivityTime !== configurationDefaultValues.INACTIVITY_TIME) {
            this.#log(logLevelEnums.DEBUG, "initialize, inactivity_time set to:[" + this.#inactivityTime + "] minutes to consider a user as inactive after no observable action");
        }
        if (this.#sessionUpdate !== configurationDefaultValues.SESSION_UPDATE) {
            this.#log(logLevelEnums.DEBUG, "initialize, session_update set to:[" + this.#sessionUpdate + "] seconds to check if extending a session is needed while the user is active");
        }
        if (this.#maxEventBatch !== configurationDefaultValues.MAX_EVENT_BATCH) {
            this.#log(logLevelEnums.DEBUG, "initialize, max_events set to:[" + this.#maxEventBatch + "] events to send in one batch");
        }
        if (this.#maxCrashLogs) {
            this.#log(logLevelEnums.WARNING, "initialize, max_logs set to:[" + this.#maxCrashLogs + "] breadcrumbs to store for crash logs max, deprecated ");
        }
        if (this.#sessionCookieTimeout !== configurationDefaultValues.SESSION_COOKIE_TIMEOUT) {
            this.#log(logLevelEnums.DEBUG, "initialize, session_cookie_timeout set to:[" + this.#sessionCookieTimeout + "] minutes to expire a cookies session");
        }

        var deviceIdParamValue = null;
        var searchQuery = this.getSearchQuery();
        var hasUTM = false;
        var utms = {};
        if (searchQuery) {
            // remove the '?' character from the beginning if it exists
            if (searchQuery.indexOf('?') === 0) {
                searchQuery = searchQuery.substring(1);
            };
            var parts = searchQuery.split("&");
            for (var i = 0; i < parts.length; i++) {
                var nv = parts[i].split("=");
                if (nv[0] === "cly_id") {
                    this.#setValueInStorage("cly_cmp_id", nv[1]);
                }
                else if (nv[0] === "cly_uid") {
                    this.#setValueInStorage("cly_cmp_uid", nv[1]);
                }
                else if (nv[0] === "cly_device_id") {
                    deviceIdParamValue = nv[1];
                }
                else if ((nv[0] + "").indexOf("utm_") === 0 && this.utm[nv[0].replace("utm_", "")]) {
                    utms[nv[0].replace("utm_", "")] = nv[1];
                    hasUTM = true;
                }
            }
        }

        var developerSetDeviceId = getConfig("device_id", ob, undefined);
        if (typeof developerSetDeviceId === "number") { // device ID should always be string
            developerSetDeviceId = developerSetDeviceId.toString();
        }

        // check if there wqs stored ID
        if (this.#getValueFromStorage("cly_id") && !tempIdModeWasEnabled) {
            this.device_id = this.#getValueFromStorage("cly_id");
            this.#log(logLevelEnums.INFO, "initialize, Set the stored device ID");
            this.#deviceIdType = this.#getValueFromStorage("cly_id_type");
            if (!this.#deviceIdType) {
                this.#log(logLevelEnums.INFO, "initialize, No device ID type info from the previous session, falling back to DEVELOPER_SUPPLIED");
                // there is a device ID saved but there is no device ID information saved 
                this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
            }
            this.#offlineMode = false;
        }
        // if not check if device ID was provided with URL
        else if (deviceIdParamValue !== null) {
            this.#log(logLevelEnums.INFO, "initialize, Device ID set by URL");
            this.device_id = deviceIdParamValue;
            this.#deviceIdType = DeviceIdTypeInternalEnums.URL_PROVIDED;
            this.#offlineMode = false;
        }
        // if not check if developer provided any ID
        else if (developerSetDeviceId) {
            this.#log(logLevelEnums.INFO, "initialize, Device ID set by developer");
            this.device_id = developerSetDeviceId;
            if (ob && Object.keys(ob).length) {
                if (ob.device_id !== undefined) {
                    this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
                }
            }
            else if (Countly.device_id !== undefined) {
                this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
            }
            this.#offlineMode = false;
        }
        // if not check if offline mode is on
        else if (this.#offlineMode || tempIdModeWasEnabled) {
            this.device_id = "[CLY]_temp_id";
            this.#deviceIdType = DeviceIdTypeInternalEnums.TEMPORARY_ID;
            if (this.#offlineMode && tempIdModeWasEnabled) {
                this.#log(logLevelEnums.INFO, "initialize, Temp ID set, continuing offline mode from previous app session");
            }
            else if (this.#offlineMode && !tempIdModeWasEnabled) {
                // this if we get here then it means either first init we enter offline mode or we cleared the device ID during the init and still user entered the offline mode
                this.#log(logLevelEnums.INFO, "initialize, Temp ID set, entering offline mode");
            }
            else {
                // no device ID was provided, no offline mode flag was provided, in the previous app session we entered offline mode and now we carry on
                this.#offlineMode = true;
                this.#log(logLevelEnums.INFO, "initialize, Temp ID set, enabling offline mode");
            }
        }
        // if all fails generate an ID
        else {
            this.#log(logLevelEnums.INFO, "initialize, Generating the device ID");
            this.device_id = getConfig("device_id", ob, this.#getStoredIdOrGenerateId());
            if (ob && Object.keys(ob).length) {
                if (ob.device_id !== undefined) {
                    this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
                }
            }
            else if (Countly.device_id !== undefined) {
                this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
            }
        }

        // Store the device ID and device ID type
        this.#setValueInStorage("cly_id", this.device_id);
        this.#setValueInStorage("cly_id_type", this.#deviceIdType);

        // as we have assigned the device ID now we can save the tags
        if (hasUTM) {
            this.#freshUTMTags = {};
            for (var tag in this.utm) { // this.utm is a filter for allowed tags
                if (utms[tag]) { // utms is the tags that were passed in the URL
                    this.userData.set("utm_" + tag, utms[tag]);
                    this.#freshUTMTags[tag] = utms[tag];
                }
                else {
                    this.userData.unset("utm_" + tag);
                }
            }
            this.userData.save();
        }

        this.#notifyLoaders();

        setTimeout(() => {
            if (!Countly.noHeartBeat) {
                this.#heartBeat();
            } else {
                this.#log(logLevelEnums.WARNING, "initialize, Heartbeat disabled. This is for testing purposes only!");
            }
        
            if (this.remote_config) {
                this.fetch_remote_config(this.remote_config);
            }
        }, 1);
        if (isBrowser) {
            document.documentElement.setAttribute("data-countly-useragent", currentUserAgentString());
        }
        // send instant health check request
        this.#HealthCheck.sendInstantHCRequest();
        this.#log(logLevelEnums.INFO, "initialize, Countly initialized");
    };

    #updateConsent = () => {
        if (this.#consentTimer) {
            // delay syncing consents
            clearTimeout(this.#consentTimer);
            this.#consentTimer = null;
        }
        this.#consentTimer = setTimeout(() => {
            var consentMessage = {};
            for (var i = 0; i < Countly.features.length; i++) {
                if (this.#consents[Countly.features[i]].optin === true) {
                    consentMessage[Countly.features[i]] = true;
                }
                else {
                    consentMessage[Countly.features[i]] = false;
                }
            }
            this.#toRequestQueue({ consent: JSON.stringify(consentMessage) });
            this.#log(logLevelEnums.DEBUG, "Consent update request has been sent to the queue.");
        }, 1000);
    };

        /**
         * WARNING!!!
         * Should be used only for testing purposes!!!
         * 
         * Resets Countly to its initial state (used mainly to wipe the queues in memory).
         * Calling this will result in a loss of data
         */
        halt = () => {
            this.#log(logLevelEnums.WARNING, "halt, Resetting Countly");
            Countly.i = undefined;
            Countly.q = [];
            Countly.noHeartBeat = undefined;
            this.#global = !Countly.i;
            this.#sessionStarted = false;
            this.#apiPath = "/i";
            this.#readPath = "/o/sdk";
            this.#beatInterval = 500;
            this.#queueSize = 1000;
            this.#requestQueue = [];
            this.#eventQueue = [];
            this.#remoteConfigs = {};
            this.#crashLogs = [];
            this.#timedEvents = {};
            this.#ignoreReferrers = [];
            this.#crashSegments = null;
            this.#autoExtend = true;
            this.#storedDuration = 0;
            this.#lastView = null;
            this.#lastViewTime = 0;
            this.#lastViewStoredDuration = 0;
            this.#failTimeout = 0;
            this.#failTimeoutAmount = 60;
            this.#inactivityTime = 20;
            this.#inactivityCounter = 0;
            this.#sessionUpdate = 60;
            this.#maxEventBatch = 100;
            this.#maxCrashLogs = null;
            this.#useSessionCookie = true;
            this.#sessionCookieTimeout = 30;
            this.#readyToProcess = true;
            this.#hasPulse = false;
            this.#offlineMode = false;
            this.#lastParams = {};
            this.#trackTime = true;
            this.#startTime = getTimestamp();
            this.#lsSupport = true;
            this.#firstView = null;
            this.#deviceIdType = DeviceIdTypeInternalEnums.SDK_GENERATED;
            this.#isScrollRegistryOpen = false;
            this.#scrollRegistryTopPosition = 0;
            this.#trackingScrolls = false;
            this.#currentViewId = null;
            this.#previousViewId = null;
            this.#freshUTMTags = null;
            this.#generatedRequests = [];

            try {
                localStorage.setItem("cly_testLocal", true);
                // clean up test
                localStorage.removeItem("cly_testLocal");
            }
            catch (e) {
                this.#log(logLevelEnums.ERROR, "halt, Local storage test failed, will fallback to cookies");
                this.#lsSupport = false;
            }

            Countly.features = [featureEnums.SESSIONS, featureEnums.EVENTS, featureEnums.VIEWS, featureEnums.SCROLLS, featureEnums.CLICKS, featureEnums.FORMS, featureEnums.CRASHES, featureEnums.ATTRIBUTION, featureEnums.USERS, featureEnums.STAR_RATING, featureEnums.LOCATION, featureEnums.APM, featureEnums.FEEDBACK, featureEnums.REMOTE_CONFIG];

            // CONSENTS
            this.#consents = {};
            for (var a = 0; a < Countly.features.length; a++) {
                this.#consents[Countly.features[a]] = {};
            }

            this.app_key = undefined;
            this.device_id = undefined;
            this.onload = undefined;
            this.utm = undefined;
            this.ignore_prefetch = undefined;
            this.debug = undefined;
            this.test_mode = undefined;
            this.test_mode_eq = undefined;
            this.metrics = undefined;
            this.headers = undefined;
            this.url = undefined;
            this.app_version = undefined;
            this.country_code = undefined;
            this.city = undefined;
            this.ip_address = undefined;
            this.ignore_bots = undefined;
            this.force_post = undefined;
            this.rcAutoOptinAb = undefined;
            this.useExplicitRcApi = undefined;
            this.remote_config = undefined;
            this.ignore_visitor = undefined;
            this.require_consent = undefined;
            this.track_domains = undefined;
            this.storage = undefined;
            this.enableOrientationTracking = undefined;
            this.salt = undefined;
            this.maxKeyLength = undefined;
            this.maxValueSize = undefined;
            this.maxSegmentationValues = undefined;
            this.maxBreadcrumbCount = undefined;
            this.maxStackTraceLinesPerThread = undefined;
            this.maxStackTraceLineLength = undefined;
        };

        /**
        * Modify feature groups for consent management. Allows you to group multiple features under one feature group
        * @param {object} features - object to define feature name as key and core features as value
        * @example <caption>Adding all features under one group</caption>
        * Countly.group_features({all:["sessions","events","views","scrolls","clicks","forms","crashes","attribution","users"]});
        * //After this call Countly.add_consent("all") to allow all features
        @example <caption>Grouping features</caption>
        * Countly.group_features({
        *    activity:["sessions","events","views"],
        *    interaction:["scrolls","clicks","forms"]
        * });
        * //After this call Countly.add_consent("activity") to allow "sessions","events","views"
        * //or call Countly.add_consent("interaction") to allow "scrolls","clicks","forms"
        * //or call Countly.add_consent("crashes") to allow some separate feature
        */
        group_features = (features) => {
            this.#log(logLevelEnums.INFO, "group_features, Grouping features");
            if (features) {
                for (var i in features) {
                    if (!this.#consents[i]) {
                        if (typeof features[i] === "string") {
                            this.#consents[i] = { features: [features[i]] };
                        }
                        else if (features[i] && Array.isArray(features[i]) && features[i].length) {
                            this.#consents[i] = { features: features[i] };
                        }
                        else {
                            this.#log(logLevelEnums.ERROR, "group_features, Incorrect feature list for [" + i + "] value: [" + features[i] + "]");
                        }
                    }
                    else {
                        this.#log(logLevelEnums.WARNING, "group_features, Feature name [" + i + "] is already reserved");
                    }
                }
            }
            else {
                this.#log(logLevelEnums.ERROR, "group_features, Incorrect features:[" + features + "]");
            }
        };

        /**
        * Check if consent is given for specific feature (either core feature of from custom feature group)
        * @param {string} feature - name of the feature, possible values, "sessions","events","views","scrolls","clicks","forms","crashes","attribution","users" or custom provided through {@link Countly.group_features}
        * @returns {Boolean} true if consent was given for the feature or false if it was not
        */
        check_consent = (feature) => {
            this.#log(logLevelEnums.INFO, "check_consent, Checking if consent is given for specific feature:[" + feature + "]");
            if (!this.require_consent) {
                // we don't need to have specific consents
                this.#log(logLevelEnums.INFO, "check_consent, require_consent is off, no consent is necessary");
                return true;
            }
            if (this.#consents[feature]) {
                return !!(this.#consents[feature] && this.#consents[feature].optin);
            }
            this.#log(logLevelEnums.ERROR, "check_consent, No feature available for [" + feature + "]");
            return false;
        };

        /**
        * Check and return the current device id type
        * @returns {number} a number that indicates the device id type
        */
        get_device_id_type = () => {
            this.#log(logLevelEnums.INFO, "check_device_id_type, Retrieving the current device id type.[" + this.#deviceIdType + "]");
            var type;
            switch (this.#deviceIdType) {
                case DeviceIdTypeInternalEnums.SDK_GENERATED:
                    type = this.DeviceIdType.SDK_GENERATED;
                    break;
                case DeviceIdTypeInternalEnums.URL_PROVIDED:
                case DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED:
                    type = this.DeviceIdType.DEVELOPER_SUPPLIED;
                    break;
                case DeviceIdTypeInternalEnums.TEMPORARY_ID:
                    type = this.DeviceIdType.TEMPORARY_ID;
                    break;
                default:
                    type = -1;
                    break;
            }
            return type;
        };

        /**
        * Gets the current device id (of the CountlyClass instance)
        * @returns {string} device id
        */
        get_device_id = () => {
            this.#log(logLevelEnums.INFO, "get_device_id, Retrieving the device id: [" + this.device_id + "]");
            return this.device_id;
        };

        /**
        * Check if any consent is given, for some cases, when crucial parts are like device_id are needed for any request
        * @returns {Boolean} true is has any consent given, false if no consents given
        */
        check_any_consent = () => {
            this.#log(logLevelEnums.INFO, "check_any_consent, Checking if any consent is given");
            if (!this.require_consent) {
                // we don't need to have consents
                this.#log(logLevelEnums.INFO, "check_any_consent, require_consent is off, no consent is necessary");
                return true;
            }
            for (var i in this.#consents) {
                if (this.#consents[i] && this.#consents[i].optin) {
                    return true;
                }
            }
            this.#log(logLevelEnums.INFO, "check_any_consent, No consents given");
            return false;
        };

        /**
        * Add consent for specific feature, meaning, user allowed to track that data (either core feature of from custom feature group)
        * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","scrolls","clicks","forms","crashes","attribution","users", etc or custom provided through {@link Countly.group_features}
        */
        add_consent = (feature) => {
            this.#log(logLevelEnums.INFO, "add_consent, Adding consent for [" + feature + "]");
            if (Array.isArray(feature)) {
                for (var i = 0; i < feature.length; i++) {
                    this.add_consent(feature[i]);
                }
            }
            else if (this.#consents[feature]) {
                if (this.#consents[feature].features) {
                    this.#consents[feature].optin = true;
                    // this is added group, let's iterate through sub features
                    this.add_consent(this.#consents[feature].features);
                }
                else {
                    // this is core feature
                    if (this.#consents[feature].optin !== true) {
                        this.#consents[feature].optin = true;
                        this.#updateConsent();
                        setTimeout(() => {
                            if (feature === featureEnums.SESSIONS && this.#lastParams.begin_session) {
                                this.begin_session.apply(this, this.#lastParams.begin_session);
                                this.#lastParams.begin_session = null;
                            }
                            else if (feature === featureEnums.VIEWS && this.#lastParams.track_pageview) {
                                this.#lastView = null;
                                this.track_pageview.apply(this, this.#lastParams.track_pageview);
                                this.#lastParams.track_pageview = null;
                            }
                        }, 1);
                    }
                }
            }
            else {
                this.#log(logLevelEnums.ERROR, "add_consent, No feature available for [" + feature + "]");
            }
        };

        /**
        * Remove consent for specific feature, meaning, user opted out to track that data (either core feature of from custom feature group)
        * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","scrolls","clicks","forms","crashes","attribution","users", etc or custom provided through {@link Countly.group_features}
        */
        remove_consent = (feature) => {
            this.#log(logLevelEnums.INFO, "remove_consent, Removing consent for [" + feature + "]");
            this.remove_consent_internal(feature, true);
        };

        /**
        * Remove consent for specific feature, meaning, user opted out to track that data (either core feature of from custom feature group)
        * @param {string|array} feature - name of the feature, possible values, "sessions","events","views","scrolls","clicks","forms","crashes","attribution","users", etc or custom provided through {@link Countly.group_features}
        * @param {Boolean} enforceConsentUpdate - regulates if a request will be sent to the server or not. If true, removing consents will send a request to the server and if false, consents will be removed without a request 
        */
        remove_consent_internal = (feature, enforceConsentUpdate) => {
            // if true updateConsent will execute when possible
            enforceConsentUpdate = enforceConsentUpdate || false;
            if (Array.isArray(feature)) {
                for (var i = 0; i < feature.length; i++) {
                    this.remove_consent_internal(feature[i], enforceConsentUpdate);
                }
            }
            else if (this.#consents[feature]) {
                if (this.#consents[feature].features) {
                    // this is added group, let's iterate through sub features
                    this.remove_consent_internal(this.#consents[feature].features, enforceConsentUpdate);
                }
                else {
                    this.#consents[feature].optin = false;
                    // this is core feature
                    if (enforceConsentUpdate && this.#consents[feature].optin !== false) {
                        this.#updateConsent();
                    }
                }
            }
            else {
                this.#log(logLevelEnums.WARNING, "remove_consent, No feature available for [" + feature + "]");
            }
        };

        enable_offline_mode = () => {
            this.#log(logLevelEnums.INFO, "enable_offline_mode, Enabling offline mode");
            // clear consents
            this.remove_consent_internal(Countly.features, false);
            this.#offlineMode = true;
            this.device_id = "[CLY]_temp_id";
            this.device_id = this.device_id;
            this.#deviceIdType = DeviceIdTypeInternalEnums.TEMPORARY_ID;
        };

        disable_offline_mode = (device_id) => {
            if (!this.#offlineMode) {
                this.#log(logLevelEnums.WARNING, "disable_offline_mode, Countly was not in offline mode.");
                return;
            }
            this.#log(logLevelEnums.INFO, "disable_offline_mode, Disabling offline mode");
            this.#offlineMode = false;
            if (device_id && this.device_id !== device_id) {
                this.device_id = device_id;
                this.device_id = this.device_id;
                this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
                this.#setValueInStorage("cly_id", this.device_id);
                this.#setValueInStorage("cly_id_type", DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED);
                this.#log(logLevelEnums.INFO, "disable_offline_mode, Changing id to: " + this.device_id);
            }
            else {
                this.device_id = this.#getStoredIdOrGenerateId();
                if (this.device_id === "[CLY]_temp_id") {
                    this.device_id = generateUUID();
                }
                this.device_id = this.device_id;
                if (this.device_id !== this.#getValueFromStorage("cly_id")) {
                    this.#setValueInStorage("cly_id", this.device_id);
                    this.#setValueInStorage("cly_id_type", DeviceIdTypeInternalEnums.SDK_GENERATED);
                }
            }
            var needResync = false;
            if (this.#requestQueue.length > 0) {
                for (var i = 0; i < this.#requestQueue.length; i++) {
                    if (this.#requestQueue[i].device_id === "[CLY]_temp_id") {
                        this.#requestQueue[i].device_id = this.device_id;
                        needResync = true;
                    }
                }
            }
            if (needResync) {
                this.#setValueInStorage("cly_queue", this.#requestQueue, true);
            }
            if (this.#shouldSendHC) {
                this.#HealthCheck.sendInstantHCRequest();
                this.#shouldSendHC = false;
            }
        };

        /**
        * Start session
        * @param {boolean} noHeartBeat - true if you don't want to use internal heartbeat to manage session
        * @param {bool} force - force begin session request even if session cookie is enabled
        */
        begin_session = (noHeartBeat, force) => {
            this.#log(logLevelEnums.INFO, "begin_session, Starting the session. There was an ongoing session: [" + this.#sessionStarted + "]");
            if (noHeartBeat) {
                this.#log(logLevelEnums.INFO, "begin_session, Heartbeats are disabled");
            }
            if (force) {
                this.#log(logLevelEnums.INFO, "begin_session, Session starts irrespective of session cookie");
            }
            if (this.check_consent(featureEnums.SESSIONS)) {
                if (!this.#sessionStarted) {
                    if (this.enableOrientationTracking) {
                        // report orientation
                        this.#report_orientation();
                        add_event_listener(window, "resize", () => {
                            this.#report_orientation();
                        });
                    }
                    this.#lastBeat = getTimestamp();
                    this.#sessionStarted = true;
                    this.#autoExtend = !(noHeartBeat);
                    var expire = this.#getValueFromStorage("cly_session");
                    this.#log(logLevelEnums.VERBOSE, "begin_session, Session state, forced: [" + force + "], useSessionCookie: [" + this.#useSessionCookie + "], seconds to expire: [" + (expire - this.#lastBeat) + "], expired: [" + (parseInt(expire) <= getTimestamp()) + "] ");
                    if (force || !this.#useSessionCookie || !expire || parseInt(expire) <= getTimestamp()) {
                        this.#log(logLevelEnums.INFO, "begin_session, Session started");
                        if (this.#firstView === null) {
                            this.#firstView = true;
                        }
                        var req = {};
                        req.begin_session = 1;
                        req.metrics = JSON.stringify(this.#getMetrics());
                        this.#toRequestQueue(req);
                    }
                    this.#setValueInStorage("cly_session", getTimestamp() + (this.#sessionCookieTimeout * 60));
                }
            }
            else {
                this.#lastParams.begin_session = [noHeartBeat, force];
            }
        };

        /**
        * Report session duration
        * @param {int} sec - amount of seconds to report for current session
        */
        session_duration = (sec) => {
            this.#log(logLevelEnums.INFO, "session_duration, Reporting session duration: [" + sec + "]");
            if (!this.check_consent(featureEnums.SESSIONS)) {
                return;
            }

            if (!this.#sessionStarted) {
                this.#log(logLevelEnums.DEBUG, "session_duration, No session was started");
                return;
            }

            this.#log(logLevelEnums.INFO, "session_duration, Session extended: [" + sec + "]");
            this.#toRequestQueue({ session_duration: sec });
            this.#extendSession();
        };

        /**
        * End current session
        * @param {int} sec - amount of seconds to report for current session, before ending it
        * @param {bool} force - force end session request even if session cookie is enabled
        */
        end_session = (sec, force) => {
            this.#log(logLevelEnums.INFO, "end_session, Ending the current session. There was an on going session:[" + this.#sessionStarted + "]");
            if (this.check_consent(featureEnums.SESSIONS)) {
                if (this.#sessionStarted) {
                    sec = sec || getTimestamp() - this.#lastBeat;
                    this.#reportViewDuration();
                    if (!this.#useSessionCookie || force) {
                        this.#log(logLevelEnums.INFO, "end_session, Session ended");
                        this.#toRequestQueue({ end_session: 1, session_duration: sec });
                    }
                    else {
                        this.session_duration(sec);
                    }
                    this.#sessionStarted = false;
                }
            }
        };

        /**
        * Changes the current device ID according to the device ID type (the preffered method)
        * @param {string} newId - new user/device ID to use. Must be a non-empty string value. Invalid values (like null, empty string or undefined) will be rejected
        * */
        set_id = (newId) => {
            this.#log(logLevelEnums.INFO, "set_id, Changing the device ID to:[" + newId + "]");
            if (newId == null || newId === "") {
                this.#log(logLevelEnums.WARNING, "set_id, The provided device is not a valid ID");
                return;
            }
            if (this.#deviceIdType === DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED) {
                /*change ID without merge as current ID is Dev supplied, so not first login*/
                this.change_id(newId, false);
            } else {
                /*change ID with merge as current ID is not Dev supplied*/
                this.change_id(newId, true);
            }
        }

        /**
        * Change current user/device id (use set_id instead if you are not sure about the merge operation)
        * @param {string} newId - new user/device ID to use. Must be a non-empty string value. Invalid values (like null, empty string or undefined) will be rejected
        * @param {boolean} merge - move data from old ID to new ID on server
        * */
        change_id = (newId, merge) => {
            this.#log(logLevelEnums.INFO, "change_id, Changing the device ID to: [" + newId + "] with merge:[" + merge + "]");
            if (!newId || typeof newId !== "string" || newId.length === 0) {
                this.#log(logLevelEnums.WARNING, "change_id, The provided device ID is not a valid ID");
                return;
            }
            if (this.#offlineMode) {
                this.#log(logLevelEnums.WARNING, "change_id, Offline mode was on, initiating disabling sequence instead.");
                this.disable_offline_mode(newId);
                return;
            }
            // eqeq is used here since we want to catch number to string checks too. type conversion might happen at a new init
            // eslint-disable-next-line eqeqeq
            if (this.device_id == newId) {
                this.#log(logLevelEnums.DEBUG, "change_id, Provided device ID is equal to the current device ID. Aborting.");
                return;
            }
            if (!merge) {
                // process async queue before sending events
                this.#processAsyncQueue(); 
                // empty event queue
                this.#sendEventsForced();
                // end current session
                this.end_session(null, true);
                // clear timed events
                this.#timedEvents = {};
                // clear all consents
                this.remove_consent_internal(Countly.features, false);
            }
            var oldId = this.device_id;
            this.device_id = newId;
            this.device_id = this.device_id;
            this.#deviceIdType = DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED;
            this.#setValueInStorage("cly_id", this.device_id);
            this.#setValueInStorage("cly_id_type", DeviceIdTypeInternalEnums.DEVELOPER_SUPPLIED);
            this.#log(logLevelEnums.INFO, "change_id, Changing ID from:[" + oldId + "] to [" + newId + "]");
            if (merge) {
                // no consent check here since 21.11.0
                this.#toRequestQueue({ old_device_id: oldId });
            }
            else {
                // start new session for new ID TODO: check this when no session tracking is enabled
                this.begin_session(!this.#autoExtend, true);
            }
            // if init time remote config was enabled with a callback function, remove currently stored remote configs and fetch remote config again
            if (this.remote_config) {
                this.#remoteConfigs = {};
                this.#setValueInStorage("cly_remote_configs", this.#remoteConfigs);
                this.fetch_remote_config(this.remote_config);
            }
        };

        /**
        * Report custom event
        * @param {Object} event - Countly {@link Event} object
        * @param {string} event.key - name or id of the event
        * @param {number} [event.count=1] - how many times did event occur
        * @param {number=} event.sum - sum to report with event (if any)
        * @param {number=} event.dur - duration to report with event (if any)
        * @param {Object=} event.segmentation - object with segments key /values
        * */
        add_event = (event) => {
            this.#log(logLevelEnums.INFO, "add_event, Adding event: ", event);
            // initially no consent is given
            var respectiveConsent = false;
            switch (event.key) {
                case internalEventKeyEnums.NPS:
                    respectiveConsent = this.check_consent(featureEnums.FEEDBACK);
                    break;
                case internalEventKeyEnums.SURVEY:
                    respectiveConsent = this.check_consent(featureEnums.FEEDBACK);
                    break;
                case internalEventKeyEnums.STAR_RATING:
                    respectiveConsent = this.check_consent(featureEnums.STAR_RATING);
                    break;
                case internalEventKeyEnums.VIEW:
                    respectiveConsent = this.check_consent(featureEnums.VIEWS);
                    break;
                case internalEventKeyEnums.ORIENTATION:
                    respectiveConsent = this.check_consent(featureEnums.USERS);
                    break;
                case internalEventKeyEnums.ACTION:
                    respectiveConsent = this.check_consent(featureEnums.CLICKS) || this.check_consent(featureEnums.SCROLLS);
                    break;
                default:
                    respectiveConsent = this.check_consent(featureEnums.EVENTS);
            }
            // if consent is given adds event to the queue
            if (respectiveConsent) {
                this.#add_cly_events(event);
            }
        };

        /**
         *  Add events to event queue
         *  @memberof Countly._internals
         *  @param {Event} event - countly event
         *  @param {String} eventIdOverride - countly event ID
         */
        #add_cly_events = (event, eventIdOverride) => {
            // ignore bots
            if (this.ignore_visitor) {
                this.#log(logLevelEnums.ERROR, "Adding event failed. Possible bot or user opt out");
                return;
            }

            if (!event.key) {
                this.#log(logLevelEnums.ERROR, "Adding event failed. Event must have a key property");
                return;
            }

            if (!event.count) {
                event.count = 1;
            }
            // we omit the internal event keys from truncation. TODO: This is not perfect as it would omit a key that includes an internal event key and more too. But that possibility seems negligible. 
            if (!internalEventKeyEnumsArray.includes(event.key)) {
                // truncate event name and segmentation to internal limits
                event.key = truncateSingleValue(event.key, this.maxKeyLength, "add_cly_event", this.#log);
            }
            event.segmentation = truncateObject(event.segmentation, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "add_cly_event", this.#log);
            var props = ["key", "count", "sum", "dur", "segmentation"];
            var e = createNewObjectFromProperties(event, props);
            e.timestamp = getMsTimestamp();
            var date = new Date();
            e.hour = date.getHours();
            e.dow = date.getDay();
            e.id = eventIdOverride || secureRandom();
            if (e.key === internalEventKeyEnums.VIEW) {
                e.pvid = this.#previousViewId || "";
            }
            else {
                e.cvid = this.#currentViewId || "";
            }
            this.#eventQueue.push(e);
            this.#setValueInStorage("cly_event", this.#eventQueue);
            this.#log(logLevelEnums.INFO, "With event ID: [" + e.id + "], successfully adding the last event:", e);
        }

        /**
        * Start timed event, which will fill in duration property upon ending automatically
        * This works basically as a timer and does not create an event till end_event is called
        * @param {string} key - event name that will be used as key property
        * */
        start_event = (key) => {
            if (!key || typeof key !== "string") {
                this.#log(logLevelEnums.WARNING, "start_event, you have to provide a valid string key instead of: [" + key + "]");
                return;
            }
            this.#log(logLevelEnums.INFO, "start_event, Starting timed event with key: [" + key + "]");
            // truncate event name to internal limits
            key = truncateSingleValue(key, this.maxKeyLength, "start_event", this.#log);
            if (this.#timedEvents[key]) {
                this.#log(logLevelEnums.WARNING, "start_event, Timed event with key: [" + key + "] already started");
                return;
            }
            this.#timedEvents[key] = getTimestamp();
        };

        /**
        * Cancel timed event, cancels a timed event if it exists
        * @param {string} key - event name that will canceled
        * @returns {boolean} - returns true if the event was canceled and false if no event with that key was found
        * */
        cancel_event = (key) => {
            if (!key || typeof key !== "string") {
                this.#log(logLevelEnums.WARNING, "cancel_event, you have to provide a valid string key instead of: [" + key + "]");
                return false;
            }
            this.#log(logLevelEnums.INFO, "cancel_event, Canceling timed event with key: [" + key + "]");
            // truncate event name to internal limits. This is done incase start_event key was truncated.
            key = truncateSingleValue(key, this.maxKeyLength, "cancel_event", this.#log);
            if (this.#timedEvents[key]) {
                delete this.#timedEvents[key];
                this.#log(logLevelEnums.INFO, "cancel_event, Timed event with key: [" + key + "] is canceled");
                return true;
            }
            this.#log(logLevelEnums.WARNING, "cancel_event, Timed event with key: [" + key + "] was not found");
            return false;
        };

        /**
        * End timed event
        * @param {string|object} event - event key if string or Countly event same as passed to {@link Countly.add_event}
        * */
        end_event = (event) => {
            if (!event) {
                this.#log(logLevelEnums.WARNING, "end_event, you have to provide a valid string key or event object instead of: [" + event + "]");
                return;
            }
            this.#log(logLevelEnums.INFO, "end_event, Ending timed event");
            if (typeof event === "string") {
                // truncate event name to internal limits. This is done incase start_event key was truncated.
                event = truncateSingleValue(event, this.maxKeyLength, "end_event", this.#log);
                event = { key: event };
            }
            if (!event.key) {
                this.#log(logLevelEnums.ERROR, "end_event, Timed event must have a key property");
                return;
            }
            if (!this.#timedEvents[event.key]) {
                this.#log(logLevelEnums.ERROR, "end_event, Timed event with key: [" + event.key + "] was not started");
                return;
            }
            event.dur = getTimestamp() - this.#timedEvents[event.key];
            this.add_event(event);
            delete this.#timedEvents[event.key];
        };

        /**
        * Report device orientation
        * @param {string=} orientation - orientation as landscape or portrait
        * */
        #report_orientation = (orientation) => {
            this.#log(logLevelEnums.INFO, "report_orientation, Reporting orientation");
            if (this.check_consent(featureEnums.USERS)) {
                this.#add_cly_events({
                    key: internalEventKeyEnums.ORIENTATION,
                    segmentation: {
                        mode: orientation || getOrientation(),
                    },
                });
            }
        };

        /**
        * Report user conversion to the server (when user signup or made a purchase, or whatever your conversion is), if there is no campaign data, user will be reported as organic
        * @param {string=} campaign_id - id of campaign, or will use the one that is stored after campaign link click
        * @param {string=} campaign_user_id - id of user's click on campaign, or will use the one that is stored after campaign link click
        * 
        * @deprecated use 'recordDirectAttribution' in place of this call
        * */
        report_conversion = (campaign_id, campaign_user_id) => {
            this.#log(logLevelEnums.WARNING, "report_conversion, Deprecated function call! Use 'recordDirectAttribution' in place of this call. Call will be redirected now!");
            this.recordDirectAttribution(campaign_id, campaign_user_id);
        };
        /**
        * Report user conversion to the server (when user signup or made a purchase, or whatever your conversion is), if there is no campaign data, user will be reported as organic
        * @param {string=} campaign_id - id of campaign, or will use the one that is stored after campaign link click
        * @param {string=} campaign_user_id - id of user's click on campaign, or will use the one that is stored after campaign link click
        * */
        recordDirectAttribution = (campaign_id, campaign_user_id) => {
            this.#log(logLevelEnums.INFO, "recordDirectAttribution, Recording the attribution for campaign ID: [" + campaign_id + "] and the user ID: [" + campaign_user_id + "]");
            if (this.check_consent(featureEnums.ATTRIBUTION)) {
                campaign_id = campaign_id || this.#getValueFromStorage("cly_cmp_id") || "cly_organic";
                campaign_user_id = campaign_user_id || this.#getValueFromStorage("cly_cmp_uid");

                if (campaign_user_id) {
                    this.#toRequestQueue({ campaign_id: campaign_id, campaign_user: campaign_user_id });
                }
                else {
                    this.#toRequestQueue({ campaign_id: campaign_id });
                }
            }
        };

        /**
        * Provide information about user
        * @param {Object} user - Countly {@link UserDetails} object
        * @param {string=} user.name - user's full name
        * @param {string=} user.username - user's username or nickname
        * @param {string=} user.email - user's email address
        * @param {string=} user.organization - user's organization or company
        * @param {string=} user.phone - user's phone number
        * @param {string=} user.picture - url to user's picture
        * @param {string=} user.gender - M value for male and F value for female
        * @param {number=} user.byear - user's birth year used to calculate current age
        * @param {Object=} user.custom - object with custom key value properties you want to save with user
        * */
        user_details = (user) => {
            this.#log(logLevelEnums.INFO, "user_details, Trying to add user details: ", user);
            if (this.check_consent(featureEnums.USERS)) {
                // process async queue before sending events
                this.#processAsyncQueue(); 
                // flush events to event queue to prevent a drill issue
                this.#sendEventsForced();
                this.#log(logLevelEnums.INFO, "user_details, flushed the event queue");
                // truncating user values and custom object key value pairs
                user.name = truncateSingleValue(user.name, this.maxValueSize, "user_details", this.#log);
                user.username = truncateSingleValue(user.username, this.maxValueSize, "user_details", this.#log);
                user.email = truncateSingleValue(user.email, this.maxValueSize, "user_details", this.#log);
                user.organization = truncateSingleValue(user.organization, this.maxValueSize, "user_details", this.#log);
                user.phone = truncateSingleValue(user.phone, this.maxValueSize, "user_details", this.#log);
                user.picture = truncateSingleValue(user.picture, 4096, "user_details", this.#log);
                user.gender = truncateSingleValue(user.gender, this.maxValueSize, "user_details", this.#log);
                user.byear = truncateSingleValue(user.byear, this.maxValueSize, "user_details", this.#log);
                user.custom = truncateObject(user.custom, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "user_details", this.#log);
                var props = ["name", "username", "email", "organization", "phone", "picture", "gender", "byear", "custom"];
                this.#toRequestQueue({ user_details: JSON.stringify(createNewObjectFromProperties(user, props)) });
            }
        };

        /** ************************
        * Modifying custom property values of user details
        * Possible modification commands
        *  - inc, to increment existing value by provided value
        *  - mul, to multiply existing value by provided value
        *  - max, to select maximum value between existing and provided value
        *  - min, to select minimum value between existing and provided value
        *  - setOnce, to set value only if it was not set before
        *  - push, creates an array property, if property does not exist, and adds value to array
        *  - pull, to remove value from array property
        *  - addToSet, creates an array property, if property does not exist, and adds unique value to array, only if it does not yet exist in array
        ************************* */
        #customData = {};
        #change_custom_property = (key, value, mod) => {
            if (this.check_consent(featureEnums.USERS)) {
                if (!this.#customData[key]) {
                    this.#customData[key] = {};
                }
                if (mod === "$push" || mod === "$pull" || mod === "$addToSet") {
                    if (!this.#customData[key][mod]) {
                        this.#customData[key][mod] = [];
                    }
                    this.#customData[key][mod].push(value);
                }
                else {
                    this.#customData[key][mod] = value;
                }
            }
        };

        /**
        * Control user related custom properties. Don't forget to call save after finishing manipulation of custom data
        * @namespace Countly.userData
        * @name Countly.userData
        * @example
        * //set custom key value property
        * Countly.userData.set("twitter", "hulk@rowboat");
        * //create or increase specific number property
        * Countly.userData.increment("login_count");
        * //add new value to array property if it is not already there
        * Countly.userData.push_unique("selected_category", "IT");
        * //send all custom property modified data to server
        * Countly.userData.save();
        */
        userData = {
            /**
            * Sets user's custom property value
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {string|number} value - value to store under provided property
            * */
            set: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] set, Setting user's custom property value: [" + value + "] under the key: [" + key + "]");
                // truncate user's custom property value to internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData set", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData set", this.#log);
                this.#customData[key] = value;
            },
            /**
            * Unset/deletes user's custom property
            * @memberof Countly.userData
            * @param {string} key - name of the property to delete
            * */
            unset: (key) => {
                this.#log(logLevelEnums.INFO, "[userData] unset, Resetting user's custom property with key: [" + key + "] ");
                this.#customData[key] = "";
            },
            /**
            * Sets user's custom property value only if it was not set before
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {string|number} value - value to store under provided property
            * */
            set_once: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] set_once, Setting user's unique custom property value: [" + value + "] under the key: [" + key + "] ");
                // truncate user's custom property value to internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData set_once", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData set_once", this.#log);
                this.#change_custom_property(key, value, "$setOnce");
            },
            /**
            * Increment value under the key of this user's custom properties by one
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * */
            increment: (key) => {
                this.#log(logLevelEnums.INFO, "[userData] increment, Increasing user's custom property value under the key: [" + key + "] by one");
                // truncate property name wrt internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData increment", this.#log);
                this.#change_custom_property(key, 1, "$inc");
            },
            /**
            * Increment value under the key of this user's custom properties by provided value
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {number} value - value by which to increment server value
            * */
            increment_by: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] increment_by, Increasing user's custom property value under the key: [" + key + "] by: [" + value + "]");
                // truncate property name and value wrt internal limits 
                key = truncateSingleValue(key, this.maxKeyLength, "userData increment_by", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData increment_by", this.#log);
                this.#change_custom_property(key, value, "$inc");
            },
            /**
            * Multiply value under the key of this user's custom properties by provided value
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {number} value - value by which to multiply server value
            * */
            multiply: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] multiply, Multiplying user's custom property value under the key: [" + key + "] by: [" + value + "]");
                // truncate key value pair wrt internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData multiply", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData multiply", this.#log);
                this.#change_custom_property(key, value, "$mul");
            },
            /**
            * Save maximal value under the key of this user's custom properties
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {number} value - value which to compare to server's value and store maximal value of both provided
            * */
            max: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] max, Saving user's maximum custom property value compared to the value: [" + value + "] under the key: [" + key + "]");
                // truncate key value pair wrt internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData max", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData max", this.#log);
                this.#change_custom_property(key, value, "$max");
            },
            /**
            * Save minimal value under the key of this user's custom properties
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {number} value - value which to compare to server's value and store minimal value of both provided
            * */
            min: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] min, Saving user's minimum custom property value compared to the value: [" + value + "] under the key: [" + key + "]");
                // truncate key value pair wrt internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData min", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData min", this.#log);
                this.#change_custom_property(key, value, "$min");
            },
            /**
            * Add value to array under the key of this user's custom properties. If property is not an array, it will be converted to array
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {string|number} value - value which to add to array
            * */
            push: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] push, Pushing a value: [" + value + "] under the key: [" + key + "] to user's custom property array");
                // truncate key value pair wrt internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData push", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData push", this.#log);
                this.#change_custom_property(key, value, "$push");
            },
            /**
            * Add value to array under the key of this user's custom properties, storing only unique values. If property is not an array, it will be converted to array
            * @memberof Countly.userData
            * @param {string} key - name of the property to attach to user
            * @param {string|number} value - value which to add to array
            * */
            push_unique: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] push_unique, Pushing a unique value: [" + value + "] under the key: [" + key + "] to user's custom property array");
                // truncate key value pair wrt internal limits
                key = truncateSingleValue(key, this.maxKeyLength, "userData push_unique", this.#log);
                value = truncateSingleValue(value, this.maxValueSize, "userData push_unique", this.#log);
                this.#change_custom_property(key, value, "$addToSet");
            },
            /**
            * Remove value from array under the key of this user's custom properties
            * @memberof Countly.userData
            * @param {string} key - name of the property
            * @param {string|number} value - value which to remove from array
            * */
            pull: (key, value) => {
                this.#log(logLevelEnums.INFO, "[userData] pull, Removing the value: [" + value + "] under the key: [" + key + "] from user's custom property array");
                this.#change_custom_property(key, value, "$pull");
            },
            /**
            * Save changes made to user's custom properties object and send them to server
            * @memberof Countly.userData
            * */
            save: () => {
                this.#log(logLevelEnums.INFO, "[userData] save, Saving changes to user's custom property");
                if (this.check_consent(featureEnums.USERS)) {
                    // process async queue before sending events
                    this.#processAsyncQueue(); 
                    // flush events to event queue to prevent a drill issue
                    this.#sendEventsForced(); 
                    this.#log(logLevelEnums.INFO, "user_details, flushed the event queue");
                    this.#toRequestQueue({ user_details: JSON.stringify({ custom: this.#customData }) });
                }
                this.#customData = {};
            }
        };

        /**
        * Report performance trace
        * @param {Object} trace - apm trace object
        * @param {string} trace.type - device or network
        * @param {string} trace.name - url or view of the trace
        * @param {number} trace.stz - start timestamp
        * @param {number} trace.etz - end timestamp
        * @param {Object} trace.app_metrics - key/value metrics like duration, to report with trace where value is number
        * @param {Object=} trace.apm_attr - object profiling attributes (not yet supported)
        */
        report_trace = (trace) => {
            this.#log(logLevelEnums.INFO, "report_trace, Reporting performance trace");
            if (this.check_consent(featureEnums.APM)) {
                var props = ["type", "name", "stz", "etz", "apm_metrics", "apm_attr"];
                for (var i = 0; i < props.length; i++) {
                    if (props[i] !== "apm_attr" && typeof trace[props[i]] === "undefined") {
                        this.#log(logLevelEnums.WARNING, "report_trace, APM trace don't have the property: " + props[i]);
                        return;
                    }
                }
                // truncate trace name and metrics wrt internal limits
                trace.name = truncateSingleValue(trace.name, this.maxKeyLength, "report_trace", this.#log);
                trace.app_metrics = truncateObject(trace.app_metrics, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "report_trace", this.#log);
                var e = createNewObjectFromProperties(trace, props);
                e.timestamp = trace.stz;
                var date = new Date();
                e.hour = date.getHours();
                e.dow = date.getDay();
                this.#toRequestQueue({ apm: JSON.stringify(e) });
                this.#log(logLevelEnums.INFO, "report_trace, Successfully adding APM trace: ", e);
            }
        };

        /**
        * Automatically track javascript errors that happen on the website and report them to the server
        * @param {Object} segments - additional key value pairs you want to provide with error report, like versions of libraries used, etc.
        * */
        track_errors = (segments) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "track_errors, window object is not available. Not tracking errors.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_errors, Started tracking errors");
            // Indicated that for this instance of the countly error tracking is enabled
            Countly.i[this.app_key].tracking_crashes = true;
            if (!window.cly_crashes) {
                window.cly_crashes = true;
                this.#crashSegments = segments;
                // override global 'uncaught error' handler
                window.onerror = function errorBundler(msg, url, line, col, err) {
                    // old browsers like IE 10 and Safari 9 won't give this value 'err' to us, but if it is provided we can trigger error recording immediately
                    if (err !== undefined && err !== null) {
                        // false indicates fatal error (as in non_fatal:false)
                        dispatchErrors(err, false);
                    }
                    // fallback if no error object is present for older browsers, we create it instead
                    else {
                        col = col || (window.event && window.event.errorCharacter);
                        var error = "";
                        if (typeof msg !== "undefined") {
                            error += msg + "\n";
                        }
                        if (typeof url !== "undefined") {
                            error += "at " + url;
                        }
                        if (typeof line !== "undefined") {
                            error += ":" + line;
                        }
                        if (typeof col !== "undefined") {
                            error += ":" + col;
                        }
                        error += "\n";

                        try {
                            var stack = [];
                            // deprecated, must be changed 
                            // eslint-disable-next-line no-caller
                            var f = errorBundler.caller;
                            while (f) {
                                stack.push(f.name);
                                f = f.caller;
                            }
                            error += stack.join("\n");
                        }
                        catch (ex) {
                            // silent error
                        }
                        // false indicates fatal error (as in non_fatal:false)
                        dispatchErrors(error, false);
                    }
                };

                // error handling for 'uncaught rejections'
                window.addEventListener("unhandledrejection", (event) => {
                    // true indicates non fatal error (as in non_fatal: true)
                    dispatchErrors(new Error("Unhandled rejection (reason: " + (event.reason && event.reason.stack ? event.reason.stack : event.reason) + ")."), true);
                });
            }
        };

        /**
        * Log an exception that you caught through try and catch block and handled yourself and just want to report it to server
        * @param {Object} err - error exception object provided in catch block
        * @param {Object} segments - additional key value pairs you want to provide with error report, like versions of libraries used, etc.
        * */
        log_error = (err, segments) => {
            this.#log(logLevelEnums.INFO, "log_error, Logging errors");
            // true indicates non fatal error (as in non_fatal:true)
            this.recordError(err, true, segments);
        };

        /**
        * Add new line in the log of breadcrumbs of what user did, will be included together with error report
        * @param {string} record - any text describing what user did
        * */
        add_log = (record) => {
            this.#log(logLevelEnums.INFO, "add_log, Adding a new log of breadcrumbs: [ " + record + " ]");
            if (this.check_consent(featureEnums.CRASHES)) {
                // truncate description wrt internal limits
                record = truncateSingleValue(record, this.maxValueSize, "add_log", this.#log);
                while (this.#crashLogs.length >= this.maxBreadcrumbCount) {
                    this.#crashLogs.shift();
                    this.#log(logLevelEnums.WARNING, "add_log, Reached maximum crashLogs size. Will erase the oldest one.");
                }
                this.#crashLogs.push(record);
            }
        };
        /**
        * Fetch remote config from the server (old one for method=fetch_remote_config API)
        * @param {array=} keys - Array of keys to fetch, if not provided will fetch all keys
        * @param {array=} omit_keys - Array of keys to omit, if provided will fetch all keys except provided ones
        * @param {function=} callback - Callback to notify with first param error and second param remote config object
        * */
        fetch_remote_config = (keys, omit_keys, callback) => {
            var keysFiltered = null;
            var omitKeysFiltered = null;
            var callbackFiltered = null;

            // check first param is truthy
            if (keys) {
                // if third parameter is falsy and first param is a function assign it as the callback function
                if (!callback && typeof keys === "function") {
                    callbackFiltered = keys;
                }
                // else if first param is an array assign it as 'keys'
                else if (Array.isArray(keys)) {
                    keysFiltered = keys;
                }
            }
            // check second param is truthy
            if (omit_keys) {
                // if third parameter is falsy and second param is a function assign it as the callback function
                if (!callback && typeof omit_keys === "function") {
                    callbackFiltered = omit_keys;
                }
                // else if second param is an array assign it as 'omit_keys'
                else if (Array.isArray(omit_keys)) {
                    omitKeysFiltered = omit_keys;
                }
            }
            // assign third param as a callback function if it was not assigned yet in first two params
            if (!callbackFiltered && typeof callback === "function") {
                callbackFiltered = callback;
            }

            // use new RC API
            if (this.useExplicitRcApi) {
                this.#log(logLevelEnums.INFO, "fetch_remote_config, Fetching remote config");
                // opt in is true(1) or false(0)
                var opt = this.rcAutoOptinAb ? 1 : 0;
                this.#fetch_remote_config_explicit(keysFiltered, omitKeysFiltered, opt, null, callbackFiltered);
                return;
            }

            this.#log(logLevelEnums.WARNING, "fetch_remote_config, Fetching remote config, with legacy API");
            this.#fetch_remote_config_explicit(keysFiltered, omitKeysFiltered, null, "legacy", callbackFiltered);
        };

        /**
        * Fetch remote config from the server (new one with method=rc API)
        * @param {array=} keys - Array of keys to fetch, if not provided will fetch all keys
        * @param {array=} omit_keys - Array of keys to omit, if provided will fetch all keys except provided ones
        * @param {number=} optIn - an inter to indicate if the user is opted in for the AB testing or not (1 is opted in, 0 is opted out)
        * @param {string=} api - which API to use, if not provided would use default ("legacy" is for method="fetch_remote_config", default is method="rc")
        * @param {function=} callback - Callback to notify with first param error and second param remote config object
        * */
        #fetch_remote_config_explicit = (keys, omit_keys, optIn, api, callback) =>{
            this.#log(logLevelEnums.INFO, "fetch_remote_config_explicit, Fetching sequence initiated");
            var request = {
                method: "rc",
                av: this.app_version
            };
            // check if keys were provided
            if (keys) {
                request.keys = JSON.stringify(keys);
            }
            // check if omit_keys were provided
            if (omit_keys) {
                request.omit_keys = JSON.stringify(omit_keys);
            }
            var providedCall;
            // legacy api prompt check
            if (api === "legacy") {
                request.method = "fetch_remote_config";
            }
            // opted out/in check
            if (optIn === 0) {
                request.oi = 0;
            }
            if (optIn === 1) {
                request.oi = 1;
            }
            // callback check
            if (typeof callback === "function") {
                providedCall = callback;
            }
            if (this.check_consent(featureEnums.SESSIONS)) {
                request.metrics = JSON.stringify(this.#getMetrics());
            }
            if (this.check_consent(featureEnums.REMOTE_CONFIG)) {
                this.#prepareRequest(request);
                this.#makeNetworkRequest("fetch_remote_config_explicit", this.url + this.#readPath, request, (err, params, responseText) => {
                    if (err) {
                        // error has been logged by the request function
                        return;
                    }
                    try {
                        var configs = JSON.parse(responseText);
                        if (request.keys || request.omit_keys) {
                            // we merge config
                            for (var i in configs) {
                                this.#remoteConfigs[i] = configs[i];
                            }
                        }
                        else {
                            // we replace config
                            this.#remoteConfigs = configs;
                        }
                        this.#setValueInStorage("cly_remote_configs", this.#remoteConfigs);
                    }
                    catch (ex) {
                        this.#log(logLevelEnums.ERROR, "fetch_remote_config_explicit, Had an issue while parsing the response: " + ex);
                    }
                    if (providedCall) {
                        this.#log(logLevelEnums.INFO, "fetch_remote_config_explicit, Callback function is provided");
                        providedCall(err, this.#remoteConfigs);
                    }
                    // JSON array can pass    
                }, true);
            }
            else {
                this.#log(logLevelEnums.ERROR, "fetch_remote_config_explicit, Remote config requires explicit consent");
                if (providedCall) {
                    providedCall(new Error("Remote config requires explicit consent"), this.#remoteConfigs);
                }
            }
        }

        /**
        * AB testing key provider, opts the user in for the selected keys
        * @param {array=} keys - Array of keys opt in FOR
        * */
        enrollUserToAb = (keys) => {
            this.#log(logLevelEnums.INFO, "enrollUserToAb, Providing AB test keys to opt in for");
            if (!keys || !Array.isArray(keys) || keys.length === 0) {
                this.#log(logLevelEnums.ERROR, "enrollUserToAb, No keys provided");
                return;
            }
            var request = {
                method: "ab",
                keys: JSON.stringify(keys),
                av: this.app_version
            };
            this.#prepareRequest(request);
            this.#makeNetworkRequest("enrollUserToAb", this.url + this.#readPath, request, (err, params, responseText) => {
                if (err) {
                    // error has been logged by the request function
                    return;
                }
                try {
                    var resp = JSON.parse(responseText);
                    this.#log(logLevelEnums.DEBUG, "enrollUserToAb, Parsed the response's result: [" + resp.result + "]");
                }
                catch (ex) {
                    this.#log(logLevelEnums.ERROR, "enrollUserToAb, Had an issue while parsing the response: " + ex);
                }
                // JSON array can pass    
            }, true);
        };

        /**
        * Gets remote config object (all key/value pairs) or specific value for provided key from the storage
        * @param {string=} key - if provided, will return value for key, or return whole object
        * @returns {object} remote configs
        * */
        get_remote_config = (key) => {
            this.#log(logLevelEnums.INFO, "get_remote_config, Getting remote config from storage");
            if (typeof key !== "undefined") {
                return this.#remoteConfigs[key];
            }
            return this.#remoteConfigs;
        };

        /**
        * Stop tracking duration time for this user
        * */
        #stop_time = () => {
            this.#log(logLevelEnums.INFO, "stop_time, Stopping tracking duration");
            if (this.#trackTime) {
                this.#trackTime = false;
                this.#storedDuration = getTimestamp() - this.#lastBeat;
                this.#lastViewStoredDuration = getTimestamp() - this.#lastViewTime;
            }
        };

        /** 
        * Start tracking duration time for this user, by default it is automatically tracked if you are using internal session handling
        * */
        #start_time = () => {
            this.#log(logLevelEnums.INFO, "start_time, Starting tracking duration");
            if (!this.#trackTime) {
                this.#trackTime = true;
                this.#lastBeat = getTimestamp() - this.#storedDuration;
                this.#lastViewTime = getTimestamp() - this.#lastViewStoredDuration;
                this.#lastViewStoredDuration = 0;
                this.#extendSession();
            }
        };

        /**
        * Track user sessions automatically, including  time user spent on your website
        * */
        track_sessions = () => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "track_sessions, window object is not available. Not tracking sessions.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_session, Starting tracking user session");
            // start session
            this.begin_session();
            this.#start_time();
            // end session on unload
            add_event_listener(window, "beforeunload", () => {
                // process async queue before sending events
                this.#processAsyncQueue(); 
                // empty the event queue
                this.#sendEventsForced();
                this.end_session();
            });

            // manage sessions on window visibility events
            var hidden = "hidden";

            /**
             *  Handle visibility change events
             */
            var onchange = () => {
                if (document[hidden] || !document.hasFocus()) {
                    this.#stop_time();
                }
                else {
                    this.#start_time();
                }
            }

            // add focus handling eventListeners
            add_event_listener(window, "focus", onchange);
            add_event_listener(window, "blur", onchange);

            // newer mobile compatible way
            add_event_listener(window, "pageshow", onchange);
            add_event_listener(window, "pagehide", onchange);

            // IE 9 and lower:
            if ("onfocusin" in document) {
                add_event_listener(window, "focusin", onchange);
                add_event_listener(window, "focusout", onchange);
            }

            // Page Visibility API for changing tabs and minimizing browser
            if (hidden in document) {
                document.addEventListener("visibilitychange", onchange);
            }
            else if ("mozHidden" in document) {
                hidden = "mozHidden";
                document.addEventListener("mozvisibilitychange", onchange);
            }
            else if ("webkitHidden" in document) {
                hidden = "webkitHidden";
                document.addEventListener("webkitvisibilitychange", onchange);
            }
            else if ("msHidden" in document) {
                hidden = "msHidden";
                document.addEventListener("msvisibilitychange", onchange);
            }

            /**
             *  Reset inactivity counter and time
             */
            var resetInactivity = () => {
                if (this.#inactivityCounter >= this.#inactivityTime) {
                    this.#start_time();
                }
                this.#inactivityCounter = 0;
            }

            add_event_listener(window, "mousemove", resetInactivity);
            add_event_listener(window, "click", resetInactivity);
            add_event_listener(window, "keydown", resetInactivity);
            add_event_listener(window, "scroll", resetInactivity);

            // track user inactivity
            setInterval(() => {
                this.#inactivityCounter++;
                if (this.#inactivityCounter >= this.#inactivityTime) {
                    this.#stop_time();
                }
            }, 60000);
        };

        /**
        * Track page views user visits
        * @param {string=} page - optional name of the page, by default uses current url path
        * @param {array=} ignoreList - optional array of strings or regexps to test for the url/view name to ignore and not report
        * @param {object=} viewSegments - optional key value object with segments to report with the view
        * */
        track_pageview = (page, ignoreList, viewSegments) => {
            if (!isBrowser && !page) {
                this.#log(logLevelEnums.WARNING, "track_pageview, window object is not available. Not tracking page views is page is not provided.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_pageview, Tracking page views");
            this.#log(logLevelEnums.VERBOSE, "track_pageview, last view is:[" + this.#lastView + "], current view ID is:[" + this.#currentViewId + "], previous view ID is:[" + this.#previousViewId + "]");
            if (this.#lastView && this.#trackingScrolls) {
                this.#log(logLevelEnums.DEBUG, "track_pageview, Scroll registry triggered");
                this.#processScrollView(); // for single page site's view change
                this.#isScrollRegistryOpen = true;
                this.#scrollRegistryTopPosition = 0;
            }
            this.#reportViewDuration();
            this.#previousViewId = this.#currentViewId;
            this.#currentViewId = secureRandom();
            // truncate page name and segmentation wrt internal limits
            page = truncateSingleValue(page, this.maxKeyLength, "track_pageview", this.#log);
            // if the first parameter we got is an array we got the ignoreList first, assign it here
            if (page && Array.isArray(page)) {
                ignoreList = page;
                page = null;
            }
            // no page or ignore list provided, get the current view name/url
            if (!page) {
                page = this.getViewName();
            }
            if (page === undefined || page === "") {
                this.#log(logLevelEnums.ERROR, "track_pageview, No page name to track (it is either undefined or empty string). No page view can be tracked.");
                return;
            }
            if (page === null) {
                this.#log(logLevelEnums.ERROR, "track_pageview, View name returned as null. Page view will be ignored.");
                return;
            }

            if (ignoreList && ignoreList.length) {
                for (var i = 0; i < ignoreList.length; i++) {
                    try {
                        var reg = new RegExp(ignoreList[i]);
                        if (reg.test(page)) {
                            this.#log(logLevelEnums.INFO, "track_pageview, Ignoring the page: " + page);
                            return;
                        }
                    }
                    catch (ex) {
                        this.#log(logLevelEnums.ERROR, "track_pageview, Problem with finding ignore list item: " + ignoreList[i] + ", error: " + ex);
                    }
                }
            }
            var segments = {
                name: page,
                visit: 1,
                view: this.getViewUrl()
            };
            // truncate new segment
            segments = truncateObject(segments, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "track_pageview", this.#log);
            if (this.track_domains) {
                segments.domain = window.location.hostname;
            }

            if (this.#useSessionCookie) {
                if (!this.#sessionStarted) {
                    // tracking view was called before tracking session, so we check expiration ourselves
                    var expire = this.#getValueFromStorage("cly_session");
                    if (!expire || parseInt(expire) <= getTimestamp()) {
                        this.#firstView = false;
                        segments.start = 1;
                    }
                }
                // tracking views called after tracking session, so we can rely on tracking session decision
                else if (this.#firstView) {
                    this.#firstView = false;
                    segments.start = 1;
                }
            }
            // if we are not using session cookie, there is no session state between refreshes
            // so we fallback to old logic of landing
            else if (isBrowser && typeof document.referrer !== "undefined" && document.referrer.length) {
                var matches = urlParseRE.exec(document.referrer);
                // do not report referrers of current website
                if (matches && matches[11] && matches[11] !== window.location.hostname) {
                    segments.start = 1;
                }
            }

            // add utm tags
            if (this.#freshUTMTags && Object.keys(this.#freshUTMTags).length) {
                this.#log(logLevelEnums.INFO, "track_pageview, Adding fresh utm tags to segmentation:[" + JSON.stringify(this.#freshUTMTags) + "]");
                for (var utm in this.#freshUTMTags) {
                    if (typeof segments["utm_" + utm] === "undefined") {
                        segments["utm_" + utm] = this.#freshUTMTags[utm];
                    }
                }
                // TODO: Current logic adds utm tags to each view if the user landed with utm tags for that session(in non literal sense)
                // we might want to change this logic to add utm tags only to the first view's segmentation by freshUTMTags = null; here
            }

            // add referrer if it is usable
            if (isBrowser && this.#isReferrerUsable()) {
                this.#log(logLevelEnums.INFO, "track_pageview, Adding referrer to segmentation:[" + document.referrer + "]");
                segments.referrer = document.referrer; // add referrer
            }

            if (viewSegments) {
                viewSegments = truncateObject(viewSegments, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "track_pageview", this.#log);

                for (var key in viewSegments) {
                    if (typeof segments[key] === "undefined") {
                        segments[key] = viewSegments[key];
                    }
                }
            }

            // track pageview
            if (this.check_consent(featureEnums.VIEWS)) {
                this.#add_cly_events({
                    key: internalEventKeyEnums.VIEW,
                    segmentation: segments
                }, this.#currentViewId);
                this.#lastView = page;
                this.#lastViewTime = getTimestamp();
                this.#log(logLevelEnums.VERBOSE, "track_pageview, last view is assigned:[" + this.#lastView + "]");
            }
            else {
                this.#lastParams.track_pageview = [page, ignoreList, viewSegments];
            }
        };

        /**
        * Track page views user visits. Alias of {@link track_pageview} method for compatibility with NodeJS SDK
        * @param {string=} page - optional name of the page, by default uses current url path
        * @param {array=} ignoreList - optional array of strings or regexps to test for the url/view name to ignore and not report
        * @param {object=} segments - optional view segments to track with the view
        * */
        track_view = (page, ignoreList, segments) => {
            this.#log(logLevelEnums.INFO, "track_view, Initiating tracking page views");
            this.track_pageview(page, ignoreList, segments);
        };

        /**
        * Track all clicks on this page
        * @param {Object=} parent - DOM object which children to track, by default it is document body
        * */
        track_clicks = (parent) =>{
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "track_clicks, window object is not available. Not tracking clicks.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_clicks, Starting to track clicks");
            if (parent) {
                this.#log(logLevelEnums.INFO, "track_clicks, Tracking the specified children:[" + parent + "]");
            }
            parent = parent || document;
            var shouldProcess = true;
            /**
             *  Process click information
             *  @param {Event} event - click event
             */
            var processClick = (event) => {
                if (shouldProcess) {
                    shouldProcess = false;

                    // cross browser click coordinates
                    get_page_coord(event);
                    if (typeof event.pageX !== "undefined" && typeof event.pageY !== "undefined") {
                        var height = getDocHeight();
                        var width = getDocWidth();

                        // record click event
                        if (this.check_consent(featureEnums.CLICKS)) {
                            var segments = {
                                type: "click",
                                x: event.pageX,
                                y: event.pageY,
                                width: width,
                                height: height,
                                view: this.getViewUrl()
                            };
                            // truncate new segment
                            segments = truncateObject(segments, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "processClick", this.#log);
                            if (this.track_domains) {
                                segments.domain = window.location.hostname;
                            }
                            this.#add_cly_events({
                                key: internalEventKeyEnums.ACTION,
                                segmentation: segments
                            });
                        }
                    }
                    setTimeout(() => {
                        shouldProcess = true;
                    }, 1000);
                }
            }
            // add any events you want
            add_event_listener(parent, "click", processClick);
        };

        /**
        * Track all scrolls on this page
        * @param {Object=} parent - DOM object which children to track, by default it is document body
        * */
        track_scrolls = (parent) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "track_scrolls, window object is not available. Not tracking scrolls.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_scrolls, Starting to track scrolls");
            if (parent) {
                this.#log(logLevelEnums.INFO, "track_scrolls, Tracking the specified children");
            }
            parent = parent || window;
            this.#isScrollRegistryOpen = true;
            this.#trackingScrolls = true;

            add_event_listener(parent, "scroll", this.#processScroll);
            add_event_listener(parent, "beforeunload", this.#processScrollView);
        };

        /**
        * Generate custom event for all links that were clicked on this page
        * @param {Object=} parent - DOM object which children to track, by default it is document body
        * */
        track_links = (parent) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "track_links, window object is not available. Not tracking links.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_links, Starting to track clicks to links");
            if (parent) {
                this.#log(logLevelEnums.INFO, "track_links, Tracking the specified children");
            }
            parent = parent || document;
            /**
             *  Process click information
             *  @param {Event} event - click event
             */
            var processClick = (event) => {
                // get element which was clicked
                var elem = get_closest_element(get_event_target(event), "a");

                if (elem) {
                    // cross browser click coordinates
                    get_page_coord(event);

                    // record click event
                    if (this.check_consent(featureEnums.CLICKS)) {
                        this.#add_cly_events({
                            key: "linkClick",
                            segmentation: {
                                href: elem.href,
                                text: elem.innerText,
                                id: elem.id,
                                view: this.getViewUrl()
                            }
                        });
                    }
                }
            }

            // add any events you want
            add_event_listener(parent, "click", processClick);
        };

        /**
        * Generate custom event for all forms that were submitted on this page
        * @param {Object=} parent - DOM object which children to track, by default it is document body
        * @param {boolean=} trackHidden - provide true to also track hidden inputs, default false
        * */
        track_forms = (parent, trackHidden) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "track_forms, window object is not available. Not tracking forms.");
                return;
            }
            this.#log(logLevelEnums.INFO, "track_forms, Starting to track form submissions. DOM object provided:[" + (!!parent) + "] Tracking hidden inputs :[" + (!!trackHidden) + "]");
            parent = parent || document;
            /**
             *  Get name of the input
             *  @param {HTMLElement} input - HTML input from which to get name
             *  @returns {String} name of the input
             */
            var getInputName = (input) => {
                return input.name || input.id || input.type || input.nodeName;
            }
            /**
             *  Process form data
             *  @param {Event} event - form submission event
             */
            var processForm = (event) => {
                var form = get_event_target(event);
                var segmentation = {
                    id: form.attributes.id && form.attributes.id.nodeValue,
                    name: form.attributes.name && form.attributes.name.nodeValue,
                    action: form.attributes.action && form.attributes.action.nodeValue,
                    method: form.attributes.method && form.attributes.method.nodeValue,
                    view: this.getViewUrl()
                };

                // get input values
                var input;
                if (typeof form.elements !== "undefined") {
                    for (var i = 0; i < form.elements.length; i++) {
                        input = form.elements[i];
                        if (input && input.type !== "password" && input.className.indexOf("cly_user_ignore") === -1) {
                            if (typeof segmentation["input:" + getInputName(input)] === "undefined") {
                                segmentation["input:" + getInputName(input)] = [];
                            }
                            if (input.nodeName.toLowerCase() === "select") {
                                if (typeof input.multiple !== "undefined") {
                                    segmentation["input:" + getInputName(input)].push(getMultiSelectValues(input));
                                }
                                else {
                                    segmentation["input:" + getInputName(input)].push(input.options[input.selectedIndex].value);
                                }
                            }
                            else if (input.nodeName.toLowerCase() === "input") {
                                if (typeof input.type !== "undefined") {
                                    if (input.type.toLowerCase() === "checkbox" || input.type.toLowerCase() === "radio") {
                                        if (input.checked) {
                                            segmentation["input:" + getInputName(input)].push(input.value);
                                        }
                                    }
                                    else if (input.type.toLowerCase() !== "hidden" || trackHidden) {
                                        segmentation["input:" + getInputName(input)].push(input.value);
                                    }
                                }
                                else {
                                    segmentation["input:" + getInputName(input)].push(input.value);
                                }
                            }
                            else if (input.nodeName.toLowerCase() === "textarea") {
                                segmentation["input:" + getInputName(input)].push(input.value);
                            }
                            else if (typeof input.value !== "undefined") {
                                segmentation["input:" + getInputName(input)].push(input.value);
                            }
                        }
                    }
                    for (var key in segmentation) {
                        if (segmentation[key] && typeof segmentation[key].join === "function") {
                            segmentation[key] = segmentation[key].join(", ");
                        }
                    }
                }

                // record submit event
                if (this.check_consent(featureEnums.FORMS)) {
                    this.#add_cly_events({
                        key: "formSubmit",
                        segmentation: segmentation
                    });
                }
            }

            // add any events you want
            add_event_listener(parent, "submit", processForm);
        };

        /**
        * Collect possible user data from submitted forms. Add cly_user_ignore class to ignore inputs in forms or cly_user_{key} to collect data from this input as specified key, as cly_user_username to save collected value from this input as username property. If not class is provided, Countly SDK will try to determine type of information automatically.
        * @param {Object=} parent - DOM object which children to track, by default it is document body
        * @param {boolean} [useCustom=false] - submit collected data as custom user properties, by default collects as main user properties
        * */
        collect_from_forms = (parent, useCustom) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "collect_from_forms, window object is not available. Not collecting from forms.");
                return;
            }
            this.#log(logLevelEnums.INFO, "collect_from_forms, Starting to collect possible user data. DOM object provided:[" + (!!parent) + "] Submitting custom user property:[" + (!!useCustom) + "]");
            parent = parent || document;
            /**
             *  Process form data
             *  @param {Event} event - form submission event
             */
            var processForm = (event) => {
                var form = get_event_target(event);
                var userdata = {};
                var hasUserInfo = false;

                // get input values
                var input;
                if (typeof form.elements !== "undefined") {
                    // load labels for inputs
                    var labelData = {};
                    var labels = parent.getElementsByTagName("LABEL");
                    var i;
                    var j;
                    for (i = 0; i < labels.length; i++) {
                        if (labels[i].htmlFor && labels[i].htmlFor !== "") {
                            labelData[labels[i].htmlFor] = labels[i].innerText || labels[i].textContent || labels[i].innerHTML;
                        }
                    }
                    for (i = 0; i < form.elements.length; i++) {
                        input = form.elements[i];
                        if (input && input.type !== "password") {
                            // check if element should be ignored
                            if (input.className.indexOf("cly_user_ignore") === -1) {
                                var value = "";
                                // get value from input
                                if (input.nodeName.toLowerCase() === "select") {
                                    if (typeof input.multiple !== "undefined") {
                                        value = getMultiSelectValues(input);
                                    }
                                    else {
                                        value = input.options[input.selectedIndex].value;
                                    }
                                }
                                else if (input.nodeName.toLowerCase() === "input") {
                                    if (typeof input.type !== "undefined") {
                                        if (input.type.toLowerCase() === "checkbox" || input.type.toLowerCase() === "radio") {
                                            if (input.checked) {
                                                value = input.value;
                                            }
                                        }
                                        else {
                                            value = input.value;
                                        }
                                    }
                                    else {
                                        value = input.value;
                                    }
                                }
                                else if (input.nodeName.toLowerCase() === "textarea") {
                                    value = input.value;
                                }
                                else if (typeof input.value !== "undefined") {
                                    value = input.value;
                                }
                                // check if input was marked to be collected
                                if (input.className && input.className.indexOf("cly_user_") !== -1) {
                                    var classes = input.className.split(" ");
                                    for (j = 0; j < classes.length; j++) {
                                        if (classes[j].indexOf("cly_user_") === 0) {
                                            userdata[classes[j].replace("cly_user_", "")] = value;
                                            hasUserInfo = true;
                                            break;
                                        }
                                    }
                                }
                                // check for email
                                else if ((input.type && input.type.toLowerCase() === "email")
                                    || (input.name && input.name.toLowerCase().indexOf("email") !== -1)
                                    || (input.id && input.id.toLowerCase().indexOf("email") !== -1)
                                    || (input.id && labelData[input.id] && labelData[input.id].toLowerCase().indexOf("email") !== -1)
                                    || (/[^@\s]+@[^@\s]+\.[^@\s]+/).test(value)) {
                                    if (!userdata.email) {
                                        userdata.email = value;
                                    }
                                    hasUserInfo = true;
                                }
                                else if ((input.name && input.name.toLowerCase().indexOf("username") !== -1)
                                    || (input.id && input.id.toLowerCase().indexOf("username") !== -1)
                                    || (input.id && labelData[input.id] && labelData[input.id].toLowerCase().indexOf("username") !== -1)) {
                                    if (!userdata.username) {
                                        userdata.username = value;
                                    }
                                    hasUserInfo = true;
                                }
                                else if ((input.name && (input.name.toLowerCase().indexOf("tel") !== -1 || input.name.toLowerCase().indexOf("phone") !== -1 || input.name.toLowerCase().indexOf("number") !== -1))
                                    || (input.id && (input.id.toLowerCase().indexOf("tel") !== -1 || input.id.toLowerCase().indexOf("phone") !== -1 || input.id.toLowerCase().indexOf("number") !== -1))
                                    || (input.id && labelData[input.id] && (labelData[input.id].toLowerCase().indexOf("tel") !== -1 || labelData[input.id].toLowerCase().indexOf("phone") !== -1 || labelData[input.id].toLowerCase().indexOf("number") !== -1))) {
                                    if (!userdata.phone) {
                                        userdata.phone = value;
                                    }
                                    hasUserInfo = true;
                                }
                                else if ((input.name && (input.name.toLowerCase().indexOf("org") !== -1 || input.name.toLowerCase().indexOf("company") !== -1))
                                    || (input.id && (input.id.toLowerCase().indexOf("org") !== -1 || input.id.toLowerCase().indexOf("company") !== -1))
                                    || (input.id && labelData[input.id] && (labelData[input.id].toLowerCase().indexOf("org") !== -1 || labelData[input.id].toLowerCase().indexOf("company") !== -1))) {
                                    if (!userdata.organization) {
                                        userdata.organization = value;
                                    }
                                    hasUserInfo = true;
                                }
                                else if ((input.name && input.name.toLowerCase().indexOf("name") !== -1)
                                    || (input.id && input.id.toLowerCase().indexOf("name") !== -1)
                                    || (input.id && labelData[input.id] && labelData[input.id].toLowerCase().indexOf("name") !== -1)) {
                                    if (!userdata.name) {
                                        userdata.name = "";
                                    }
                                    userdata.name += value + " ";
                                    hasUserInfo = true;
                                }
                            }
                        }
                    }
                }

                // record user info, if any
                if (hasUserInfo) {
                    this.#log(logLevelEnums.INFO, "collect_from_forms, Gathered user data", userdata);
                    if (useCustom) {
                        this.user_details({ custom: userdata });
                    }
                    else {
                        this.user_details(userdata);
                    }
                }
            }

            // add any events you want
            add_event_listener(parent, "submit", processForm);
        };

        /**
        * Collect information about user from Facebook, if your website integrates Facebook SDK. Call this method after Facebook SDK is loaded and user is authenticated.
        * @param {Object=} custom - Custom keys to collected from Facebook, key will be used to store as key in custom user properties and value as key in Facebook graph object. For example, {"tz":"timezone"} will collect Facebook's timezone property, if it is available and store it in custom user's property under "tz" key. If you want to get value from some sub object properties, then use dot as delimiter, for example, {"location":"location.name"} will collect data from Facebook's {"location":{"name":"MyLocation"}} object and store it in user's custom property "location" key
        * */
        collect_from_facebook = (custom) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "collect_from_facebook, window object is not available. Not collecting from Facebook.");
                return;
            }
            if (typeof FB === "undefined" || !FB || !FB.api) {
                this.#log(logLevelEnums.ERROR, "collect_from_facebook, Facebook SDK is not available");
                return;
            }
            this.#log(logLevelEnums.INFO, "collect_from_facebook, Starting to collect possible user data");
            /* globals FB */
            FB.api("/me", (resp) => {
                var data = {};
                if (resp.name) {
                    data.name = resp.name;
                }
                if (resp.email) {
                    data.email = resp.email;
                }
                if (resp.gender === "male") {
                    data.gender = "M";
                }
                else if (resp.gender === "female") {
                    data.gender = "F";
                }
                if (resp.birthday) {
                    var byear = resp.birthday.split("/").pop();
                    if (byear && byear.length === 4) {
                        data.byear = byear;
                    }
                }
                if (resp.work && resp.work[0] && resp.work[0].employer && resp.work[0].employer.name) {
                    data.organization = resp.work[0].employer.name;
                }
                // check if any custom keys to collect
                if (custom) {
                    data.custom = {};
                    for (var i in custom) {
                        var parts = custom[i].split(".");
                        var get = resp;
                        for (var j = 0; j < parts.length; j++) {
                            get = get[parts[j]];
                            if (typeof get === "undefined") {
                                break;
                            }
                        }
                        if (typeof get !== "undefined") {
                            data.custom[i] = get;
                        }
                    }
                }
                this.user_details(data);
            });
        };
        /**
        * Opts out user of any metric tracking
        * */
        opt_out = () => {
            this.#log(logLevelEnums.WARNING, "opt_out, Opting out the user. Deprecated function call! Use 'consent' in place of this call.");
            this.ignore_visitor = true;
            this.#setValueInStorage("cly_ignore", true);
        };

        /**
        * Opts in user for tracking, if complies with other user ignore rules like bot useragent and prefetch settings
        * */
        opt_in = () => {
            this.#log(logLevelEnums.WARNING, "opt_in, Opting in the user. Deprecated function call! Use 'consent' in place of this call.");
            this.#setValueInStorage("cly_ignore", false);
            this.ignore_visitor = false;
            this.#checkIgnore();
            if (!this.ignore_visitor && !this.#hasPulse) {
                this.#heartBeat();
            }
        };

        /**
        * Provide information about user
        * @param {Object} ratingWidget - object with rating widget properties
        * @param {string} ratingWidget.widget_id - id of the widget in the dashboard
        * @param {boolean=} ratingWidget.contactMe - did user give consent to contact him
        * @param {string=} ratingWidget.platform - user's platform (will be filled if not provided)
        * @param {string=} ratingWidget.app_version - app's app version (will be filled if not provided)
        * @param {number} ratingWidget.rating - user's rating from 1 to 5
        * @param {string=} ratingWidget.email - user's email
        * @param {string=} ratingWidget.comment - user's comment
        * 
        * @deprecated use 'recordRatingWidgetWithID' in place of this call
        * */
        report_feedback = (ratingWidget) => {
            this.#log(logLevelEnums.WARNING, "report_feedback, Deprecated function call! Use 'recordRatingWidgetWithID' or 'reportFeedbackWidgetManually' in place of this call. Call will be redirected to 'recordRatingWidgetWithID' now!");
            this.recordRatingWidgetWithID(ratingWidget);
        };
        /**
        * Provide information about user
        * @param {Object} ratingWidget - object with rating widget properties
        * @param {string} ratingWidget.widget_id - id of the widget in the dashboard
        * @param {boolean=} ratingWidget.contactMe - did user give consent to contact him
        * @param {string=} ratingWidget.platform - user's platform (will be filled if not provided)
        * @param {string=} ratingWidget.app_version - app's app version (will be filled if not provided)
        * @param {number} ratingWidget.rating - user's rating from 1 to 5
        * @param {string=} ratingWidget.email - user's email
        * @param {string=} ratingWidget.comment - user's comment
        * */
        recordRatingWidgetWithID = (ratingWidget) => {
            this.#log(logLevelEnums.INFO, "recordRatingWidgetWithID, Providing information about user with ID: [ " + ratingWidget.widget_id + " ]");
            if (!this.check_consent(featureEnums.STAR_RATING)) {
                return;
            }
            if (!ratingWidget.widget_id) {
                this.#log(logLevelEnums.ERROR, "recordRatingWidgetWithID, Rating Widget must contain widget_id property");
                return;
            }
            if (!ratingWidget.rating) {
                this.#log(logLevelEnums.ERROR, "recordRatingWidgetWithID, Rating Widget must contain rating property");
                return;
            }
            var props = ["widget_id", "contactMe", "platform", "app_version", "rating", "email", "comment"];
            var event = {
                key: internalEventKeyEnums.STAR_RATING,
                count: 1,
                segmentation: {}
            };
            event.segmentation = createNewObjectFromProperties(ratingWidget, props);
            if (!event.segmentation.app_version) {
                event.segmentation.app_version = this.metrics._app_version || this.app_version;
            }
            if (event.segmentation.rating > 5) {
                this.#log(logLevelEnums.WARNING, "recordRatingWidgetWithID, You have entered a rating higher than 5. Changing it back to 5 now.");
                event.segmentation.rating = 5;
            }
            else if (event.segmentation.rating < 1) {
                this.#log(logLevelEnums.WARNING, "recordRatingWidgetWithID, You have entered a rating lower than 1. Changing it back to 1 now.");
                event.segmentation.rating = 1;
            }
            this.#log(logLevelEnums.INFO, "recordRatingWidgetWithID, Reporting Rating Widget: ", event);
            this.#add_cly_events(event);
        };
        /**
        * Report information about survey, nps or rating widget answers/results
        * @param {Object} CountlyFeedbackWidget - it is the widget object retrieved from get_available_feedback_widgets
        * @param {Object} CountlyWidgetData - it is the widget data object retrieved from getFeedbackWidgetData
        * @param {Object} widgetResult - it is the widget results that need to be reported, different for all widgets, if provided as null it means the widget was closed
        * widgetResult For NPS
        * Should include rating and comment from the nps. Example:
        * widgetResult = {rating: 3, comment: "comment"}
        * 
        * widgetResult For Survey
        * Should include questions ids and their answers as key/value pairs. Keys should be formed as “answ-”+[question.id]. Example:
        * widgetResult = {
        *   "answ-1602694029-0": "Some text field long answer", //for text fields
        *   "answ-1602694029-1": 7, //for rating
        *   "answ-1602694029-2": "ch1602694029-0", //There is a question with choices like multi or radio. It is a choice key.
        *   "answ-1602694029-3": "ch1602694030-0,ch1602694030-1" //In case 2 selected
        *   }
        * 
        * widgetResult For Rating Widget
        * Should include rating, email, comment and contact consent information. Example:
        * widgetResult = {
        *   rating: 2, 
        *   email: "email@mail.com", 
        *   contactMe: true,    
        *   comment: "comment"
        *   }
        * */
        reportFeedbackWidgetManually = (CountlyFeedbackWidget, CountlyWidgetData, widgetResult) => {
            if (!this.check_consent(featureEnums.FEEDBACK)) {
                return;
            }
            if (!(CountlyFeedbackWidget && CountlyWidgetData)) {
                this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Widget data and/or Widget object not provided. Aborting.");
                return;
            }
            if (!CountlyFeedbackWidget._id) {
                this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Feedback Widgets must contain _id property");
                return;
            }
            if (this.#offlineMode) {
                this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Feedback Widgets can not be reported in offline mode");
                return;
            }

            this.#log(logLevelEnums.INFO, "reportFeedbackWidgetManually, Providing information about user with, provided result of the widget with  ID: [ " + CountlyFeedbackWidget._id + " ] and type: [" + CountlyFeedbackWidget.type + "]");

            // type specific checks to see if everything was provided
            var props = [];
            var type = CountlyFeedbackWidget.type;
            var eventKey;
            if (type === "nps") {
                if (widgetResult) {
                    if (!widgetResult.rating) {
                        this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Widget must contain rating property");
                        return;
                    }
                    widgetResult.rating = Math.round(widgetResult.rating);
                    if (widgetResult.rating > 10) {
                        this.#log(logLevelEnums.WARNING, "reportFeedbackWidgetManually, You have entered a rating higher than 10. Changing it back to 10 now.");
                        widgetResult.rating = 10;
                    }
                    else if (widgetResult.rating < 0) {
                        this.#log(logLevelEnums.WARNING, "reportFeedbackWidgetManually, You have entered a rating lower than 0. Changing it back to 0 now.");
                        widgetResult.rating = 0;
                    }
                    props = ["rating", "comment"];
                }
                eventKey = internalEventKeyEnums.NPS;
            }
            else if (type === "survey") {
                if (widgetResult) {
                    if (Object.keys(widgetResult).length < 1) {
                        this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Widget should have answers to be reported");
                        return;
                    }
                    props = Object.keys(widgetResult);
                }
                eventKey = internalEventKeyEnums.SURVEY;
            }
            else if (type === "rating") {
                if (widgetResult) {
                    if (!widgetResult.rating) {
                        this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Widget must contain rating property");
                        return;
                    }
                    widgetResult.rating = Math.round(widgetResult.rating);
                    if (widgetResult.rating > 5) {
                        this.#log(logLevelEnums.WARNING, "reportFeedbackWidgetManually, You have entered a rating higher than 5. Changing it back to 5 now.");
                        widgetResult.rating = 5;
                    }
                    else if (widgetResult.rating < 1) {
                        this.#log(logLevelEnums.WARNING, "reportFeedbackWidgetManually, You have entered a rating lower than 1. Changing it back to 1 now.");
                        widgetResult.rating = 1;
                    }
                    props = ["rating", "comment", "email", "contactMe"];
                }
                eventKey = internalEventKeyEnums.STAR_RATING;
            }
            else {
                this.#log(logLevelEnums.ERROR, "reportFeedbackWidgetManually, Widget has an unacceptable type");
                return;
            }

            // event template
            var event = {
                key: eventKey,
                count: 1,
                segmentation: {
                    widget_id: CountlyFeedbackWidget._id,
                    platform: this.platform,
                    app_version: this.metrics._app_version || this.app_version
                }
            };

            if (widgetResult === null) {
                event.segmentation.closed = 1;
            }
            else {
                // add response to the segmentation
                event.segmentation = addNewProperties(event.segmentation, widgetResult, props);
            }

            // add event
            this.#log(logLevelEnums.INFO, "reportFeedbackWidgetManually, Reporting " + type + ": ", event);
            this.#add_cly_events(event);
        };
        /**
        * Show specific widget popup by the widget id
        * @param {string} id - id value of related rating widget, you can get this value by click "Copy ID" button in row menu at "Feedback widgets" screen
        * 
        * @deprecated use 'feedback.showRating' in place of this call
        */
        show_feedback_popup = (id) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "show_feedback_popup, window object is not available. Not showing feedback popup.");
                return;
            }
            this.#log(logLevelEnums.WARNING, "show_feedback_popup, Deprecated function call! Use 'presentRatingWidgetWithID' in place of this call. Call will be redirected now!");
            presentRatingWidgetWithID(id);
        };
        /**
        * Show specific widget popup by the widget id
        * @param {string} id - id value of related rating widget, you can get this value by click "Copy ID" button in row menu at "Feedback widgets" screen
        * @deprecated use 'feedback.showRating' in place of this call
        */
        presentRatingWidgetWithID = (id) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "presentRatingWidgetWithID, window object is not available. Not showing rating widget popup.");
                return;
            }
            this.#log(logLevelEnums.INFO, "presentRatingWidgetWithID, Showing rating widget popup for the widget with ID: [ " + id + " ]");
            if (!this.check_consent(featureEnums.STAR_RATING)) {
                return;
            }
            if (this.#offlineMode) {
                this.#log(logLevelEnums.ERROR, "presentRatingWidgetWithID, Cannot show ratingWidget popup in offline mode");
            }
            else {
                this.#makeNetworkRequest("presentRatingWidgetWithID,", this.url + "/o/feedback/widget", { widget_id: id, av: this.app_version }, (err, params, responseText) => {
                    if (err) {
                        // error has been logged by the request function
                        return;
                    }
                    try {
                        // widget object
                        var currentWidget = JSON.parse(responseText);
                        this.#processWidget(currentWidget, false);
                    }
                    catch (JSONParseError) {
                        this.#log(logLevelEnums.ERROR, "presentRatingWidgetWithID, JSON parse failed: " + JSONParseError);
                    }
                    // JSON array can pass 
                }, true);
            }
        };

        /**
        * Prepare rating widgets according to the current options
        * @param {array=} enableWidgets - widget ids array
        * 
        * @deprecated use 'feedback.showRating' in place of this call
        */
        initialize_feedback_popups = (enableWidgets) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "initialize_feedback_popups, window object is not available. Not initializing feedback popups.");
                return;
            }
            this.#log(logLevelEnums.WARNING, "initialize_feedback_popups, Deprecated function call! Use 'initializeRatingWidgets' in place of this call. Call will be redirected now!");
            this.initializeRatingWidgets(enableWidgets);
        };
        /**
        * Prepare rating widgets according to the current options
        * @param {array=} enableWidgets - widget ids array
        * @deprecated use 'feedback.showRating' in place of this call
        */
        initializeRatingWidgets = (enableWidgets) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "initializeRatingWidgets, window object is not available. Not initializing rating widgets.");
                return;
            }
            this.#log(logLevelEnums.INFO, "initializeRatingWidgets, Initializing rating widget with provided widget IDs:[ " + enableWidgets + "]");
            if (!this.check_consent(featureEnums.STAR_RATING)) {
                return;
            }
            if (!enableWidgets) {
                enableWidgets = this.#getValueFromStorage("cly_fb_widgets");
            }

            // remove all old stickers before add new one
            var stickers = document.getElementsByClassName("countly-feedback-sticker");
            while (stickers.length > 0) {
                stickers[0].remove();
            }

            this.#makeNetworkRequest("initializeRatingWidgets,", this.url + "/o/feedback/multiple-widgets-by-id", { widgets: JSON.stringify(enableWidgets), av: this.app_version }, (err, params, responseText) => {
                if (err) {
                    // error has been logged by the request function
                    return;
                }
                try {
                    // widgets array
                    var widgets = JSON.parse(responseText);
                    for (var i = 0; i < widgets.length; i++) {
                        if (widgets[i].is_active === "true") {
                            var target_devices = widgets[i].target_devices;
                            var currentDevice = userAgentDeviceDetection();
                            // device match check
                            if (target_devices[currentDevice]) {
                                // is hide sticker option selected?
                                if (typeof widgets[i].hide_sticker === "string") {
                                    widgets[i].hide_sticker = widgets[i].hide_sticker === "true";
                                }
                                // is target_page option provided as "All"?
                                if (widgets[i].target_page === "all" && !widgets[i].hide_sticker) {
                                    this.#processWidget(widgets[i], true);
                                }
                                // is target_page option provided as "selected"?
                                else {
                                    var pages = widgets[i].target_pages;
                                    for (var k = 0; k < pages.length; k++) {
                                        var isWildcardMatched = pages[k].substr(0, pages[k].length - 1) === window.location.pathname.substr(0, pages[k].length - 1);
                                        var isFullPathMatched = pages[k] === window.location.pathname;
                                        var isContainAsterisk = pages[k].includes("*");
                                        if (((isContainAsterisk && isWildcardMatched) || isFullPathMatched) && !widgets[i].hide_sticker) {
                                            this.#processWidget(widgets[i], true);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                catch (JSONParseError) {
                    this.#log(logLevelEnums.ERROR, "initializeRatingWidgets, JSON parse error: " + JSONParseError);
                }
                // JSON array can pass
            }, true);
        };

        /**
        * Show rating widget popup by passed widget ids array
        * @param {object=} params - required - includes "popups" property as string array of widgets ("widgets" for old versions)
        * example params: {"popups":["5b21581b967c4850a7818617"]}
        * 
        * @deprecated use 'feedback.showRating' in place of this call
        * */
        enable_feedback = (params) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "enable_feedback, window object is not available. Not enabling feedback.");
                return;
            }
            this.#log(logLevelEnums.WARNING, "enable_feedback, Deprecated function call! Use 'enableRatingWidgets' in place of this call. Call will be redirected now!");
            this.enableRatingWidgets(params);
        };
        /**
        * Show rating widget popup by passed widget ids array
        * @param {object=} params - required - includes "popups" property as string array of widgets ("widgets" for old versions)
        * example params: {"popups":["5b21581b967c4850a7818617"]}
        * @deprecated use 'feedback.showRating' in place of this call
        * */
        enableRatingWidgets = (params) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "enableRatingWidgets, window object is not available. Not enabling rating widgets.");
                return;
            }
            this.#log(logLevelEnums.INFO, "enableRatingWidgets, Enabling rating widget with params:", params);
            if (!this.check_consent(featureEnums.STAR_RATING)) {
                return;
            }
            if (this.#offlineMode) {
                this.#log(logLevelEnums.ERROR, "enableRatingWidgets, Cannot enable rating widgets in offline mode");
            }
            else {
                this.#setValueInStorage("cly_fb_widgets", params.popups || params.widgets);
                // inject feedback styles
                loadCSS(this.url + "/star-rating/stylesheets/countly-feedback-web.css");
                // get enable widgets by app_key
                // define xhr object
                var enableWidgets = params.popups || params.widgets;

                if (enableWidgets.length > 0) {
                    document.body.insertAdjacentHTML("beforeend", "<div id=\"cfbg\"></div>");
                    this.initializeRatingWidgets(enableWidgets);
                }
                else {
                    this.#log(logLevelEnums.ERROR, "enableRatingWidgets, You should provide at least one widget id as param. Read documentation for more detail. https://resources.count.ly/plugins/feedback");
                }
            }
        };

        /**
         * Internal method to display a feedback widget of a specific type.
         * @param {String} widgetType - The type of widget ("nps", "survey", "rating").
         * @param {String} [nameIDorTag] - The name, id, or tag of the widget to display.
         */
        #showWidgetInternal = (widgetType, nameIDorTag) => {
            this.#log(logLevelEnums.INFO, `showWidget, Showing ${widgetType} widget, nameIDorTag:[${nameIDorTag}]`);
            this.get_available_feedback_widgets((feedbackWidgetArray, error) => {
                if (error) {
                    this.#log(logLevelEnums.ERROR, `showWidget, Error while getting feedback widgets list: ${error}`);
                    return;
                }
       
                // Find the first widget of the specified type, or match by name, id, or tag if provided
                let widget = feedbackWidgetArray.find(w => w.type === widgetType);
                if (nameIDorTag && typeof nameIDorTag === 'string') {
                    const matchedWidget = feedbackWidgetArray.find(w =>
                        w.type === widgetType &&
                        (w.name === nameIDorTag || w._id === nameIDorTag || w.tg.includes(nameIDorTag))
                    );
                    if (matchedWidget) {
                        widget = matchedWidget;
                        this.#log(logLevelEnums.VERBOSE, `showWidget, Found ${widgetType} widget by name, id, or tag: [${JSON.stringify(matchedWidget)}]`);
                    }
                }
       
                if (!widget) {
                    this.#log(logLevelEnums.ERROR, `showWidget, No ${widgetType} widget found.`);
                    return;
                }
                this.present_feedback_widget(widget, null, null, null);
            });
        };
    /**
  * Feedback interface with convenience methods for feedback widgets:
  * - showNPS([String nameIDorTag]) - shows an NPS widget by name, id or tag, or a random one if not provided
  * - showSurvey([String nameIDorTag]) - shows a Survey widget by name, id or tag, or a random one if not provided
  * - showRating([String nameIDorTag]) - shows a Rating widget by name, id or tag, or a random one if not provided
  */
    feedback = {
        /**
         * Displays the first available NPS widget or the one with the provided name, id, or tag.
         * @param {String} [nameIDorTag] - Name, id, or tag of the NPS widget to display.
         */
        showNPS: (nameIDorTag) => this.#showWidgetInternal("nps", nameIDorTag),

        /**
         * Displays the first available Survey widget or the one with the provided name, id, or tag.
         * @param {String} [nameIDorTag] - Name, id, or tag of the Survey widget to display.
         */
        showSurvey: (nameIDorTag) => this.#showWidgetInternal("survey", nameIDorTag),

        /**
         * Displays the first available Rating widget or the one with the provided name, id, or tag.
         * @param {String} [nameIDorTag] - Name, id, or tag of the Rating widget to display.
         */
        showRating: (nameIDorTag) => this.#showWidgetInternal("rating", nameIDorTag)
    };


        /**
        * This function retrieves all associated widget information (IDs, type, name etc in an array/list of objects) of your app
        * @param {Function} callback - Callback function with two parameters, 1st for returned list, 2nd for error
        * */
        get_available_feedback_widgets = (callback) => {
            this.#log(logLevelEnums.INFO, "get_available_feedback_widgets, Getting the feedback list, callback function is provided:[" + (!!callback) + "]");
            if (!this.check_consent(featureEnums.FEEDBACK)) {
                if (callback) {
                    callback(null, new Error("Consent for feedback not provided."));
                }
                return;
            }

            if (this.#offlineMode) {
                this.#log(logLevelEnums.ERROR, "get_available_feedback_widgets, Cannot enable feedback widgets in offline mode.");
                return;
            }

            var url = this.url + this.#readPath;
            var data = {
                method: featureEnums.FEEDBACK,
                device_id: this.device_id,
                app_key: this.app_key,
                av: this.app_version
            };

            this.#makeNetworkRequest("get_available_feedback_widgets,", url, data, (err, params, responseText) => {
                if (err) {
                    // error has been logged by the request function
                    if (callback) {
                        callback(null, err);
                    }
                    return;
                }

                try {
                    var response = JSON.parse(responseText);
                    var feedbacks = response.result || [];
                    if (callback) {
                        callback(feedbacks, null);
                    }
                }
                catch (error) {
                    this.#log(logLevelEnums.ERROR, "get_available_feedback_widgets, Error while parsing feedback widgets list: " + error);
                    if (callback) {
                        callback(null, error);
                    }
                }
                // expected response is JSON object
            }, false);
        };

        /**
        * Get feedback (nps, survey or rating) widget data, like questions, message etc.
        * @param {Object} CountlyFeedbackWidget - Widget object, retrieved from 'get_available_feedback_widgets'
        * @param {Function} callback - Callback function with two parameters, 1st for returned widget data, 2nd for error
        * */
        getFeedbackWidgetData = (CountlyFeedbackWidget, callback) => {
            if (!CountlyFeedbackWidget.type) {
                this.#log(logLevelEnums.ERROR, "getFeedbackWidgetData, Expected the provided widget object to have a type but got: [" + JSON.stringify(CountlyFeedbackWidget) + "], aborting.");
                return;
            }
            this.#log(logLevelEnums.INFO, "getFeedbackWidgetData, Retrieving data for: [" + JSON.stringify(CountlyFeedbackWidget) + "], callback function is provided:[" + (!!callback) + "]");
            if (!this.check_consent(featureEnums.FEEDBACK)) {
                if (callback) {
                    callback(null, new Error("Consent for feedback not provided."));
                }
                return;
            }

            if (this.#offlineMode) {
                this.#log(logLevelEnums.ERROR, "getFeedbackWidgetData, Cannot enable feedback widgets in offline mode.");
                return;
            }

            var url = this.url;
            var data = {
                widget_id: CountlyFeedbackWidget._id,
                shown: 1,
                sdk_version: this.#sdkVersion,
                sdk_name: this.#sdkName,
                platform: this.platform,
                app_version: this.app_version
            };

            if (CountlyFeedbackWidget.type === "nps") {
                url += "/o/surveys/nps/widget";
            }
            else if (CountlyFeedbackWidget.type === "survey") {
                url += "/o/surveys/survey/widget";
            }
            else if (CountlyFeedbackWidget.type === "rating") {
                url += "/o/surveys/rating/widget";
            }
            else {
                this.#log(logLevelEnums.ERROR, "getFeedbackWidgetData, Unknown type info: [" + CountlyFeedbackWidget.type + "]");
                return;
            }

            this.#makeNetworkRequest("getFeedbackWidgetData,", url, data, responseCallback, true);

            /**
             *  Server response would be evaluated here
             * @param {*} err - error object
             * @param {*} params - parameters
             * @param {*} responseText - server reponse text
             */
            var responseCallback = (err, params, responseText) => {
                if (err) {
                    // error has been logged by the request function
                    if (callback) {
                        callback(null, err);
                    }
                    return;
                }

                try {
                    var response = JSON.parse(responseText);
                    // return parsed response
                    if (callback) {
                        callback(response, null);
                    }
                }
                catch (error) {
                    this.#log(logLevelEnums.ERROR, "getFeedbackWidgetData, Error while parsing feedback widgets list: " + error);
                    if (callback) {
                        callback(null, error);
                    }
                }
            }
        };

        /**
        * Present the feedback widget in webview
        * @param {Object} presentableFeedback - Current presentable feedback
        * @param {String} [id] - DOM id to append the feedback widget (optional, in case not used pass undefined)
        * @param {String} [className] - Class name to append the feedback widget (optional, in case not used pass undefined)
        * @param {Object} [feedbackWidgetSegmentation] - Segmentation object to be passed to the feedback widget (optional)
        * */
        present_feedback_widget = (presentableFeedback, id, className, feedbackWidgetSegmentation) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "present_feedback_widget, window object is not available. Not presenting feedback widget.");
                return;
            }
            // TODO: feedbackWidgetSegmentation implementation only assumes we want to send segmentation data. Change it if we add more data to the custom object.
            this.#log(logLevelEnums.INFO, "present_feedback_widget, Presenting the feedback widget by appending to the element with ID: [ " + id + " ] and className: [ " + className + " ]");

            if (!this.check_consent(featureEnums.FEEDBACK)) {
                return;
            }

            if (!presentableFeedback
                || (typeof presentableFeedback !== "object")
                || Array.isArray(presentableFeedback)
            ) {
                this.#log(logLevelEnums.ERROR, "present_feedback_widget, Please provide at least one feedback widget object.");
                return;
            }

            this.#log(logLevelEnums.INFO, "present_feedback_widget, Adding segmentation to feedback widgets:[" + JSON.stringify(feedbackWidgetSegmentation) + "]");
            if (!feedbackWidgetSegmentation || typeof feedbackWidgetSegmentation !== "object" || Object.keys(feedbackWidgetSegmentation).length === 0) {
                this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Segmentation is not an object or empty");
                feedbackWidgetSegmentation = null;
            }

            try {
                var url = this.url;

                if (presentableFeedback.type === "nps") {
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Widget type: nps.");
                    url += "/feedback/nps";
                }
                else if (presentableFeedback.type === "survey") {
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Widget type: survey.");
                    url += "/feedback/survey";
                }
                else if (presentableFeedback.type === "rating") {
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Widget type: rating.");
                    url += "/feedback/rating";
                }
                else {
                    this.#log(logLevelEnums.ERROR, "present_feedback_widget, Feedback widget only accepts nps, rating and survey types.");
                    return;
                }

                var passedOrigin = window.origin || window.location.origin;
                var feedbackWidgetFamily;

                // set feedback widget family as ratings and load related style file when type is ratings
                if (presentableFeedback.type === "rating") {
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Loading css for rating widget.");
                    feedbackWidgetFamily = "ratings";
                    loadCSS(this.url + "/star-rating/stylesheets/countly-feedback-web.css");
                }
                // if it's not ratings, it means we need to name it as surveys and load related style file
                // (at least until we add new type in future)
                else {
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Loading css for survey or nps.");
                    loadCSS(this.url + "/surveys/stylesheets/countly-surveys.css");
                    feedbackWidgetFamily = "surveys";
                }

                url += "?widget_id=" + presentableFeedback._id;
                url += "&app_key=" + this.app_key;
                url += "&device_id=" + this.device_id;
                url += "&sdk_name=" + this.#sdkName;
                url += "&platform=" + this.platform;
                url += "&app_version=" + this.app_version;
                url += "&sdk_version=" + this.#sdkVersion;
                var customObjectToSendWithTheWidget = {};
                customObjectToSendWithTheWidget.tc = 1; // indicates SDK supports opening links from the widget in a new tab
                if (feedbackWidgetSegmentation) {
                    customObjectToSendWithTheWidget.sg = feedbackWidgetSegmentation;
                }
                url += "&custom=" + JSON.stringify(customObjectToSendWithTheWidget);
                // Origin is passed to the popup so that it passes it back in the postMessage event
                // Only web SDK passes origin and web
                url += "&origin=" + passedOrigin;
                url += "&widget_v=web";

                var iframe = document.createElement("iframe");
                iframe.src = url;
                iframe.name = "countly-" + feedbackWidgetFamily + "-iframe";
                iframe.id = "countly-" + feedbackWidgetFamily + "-iframe";

                var initiated = false;
                iframe.onload = () => {
                    // This is used as a fallback for browsers where postMessage API doesn't work.

                    if (initiated) {
                        // On iframe reset remove the iframe and the overlay.
                        document.getElementById("countly-" + feedbackWidgetFamily + "-wrapper-" + presentableFeedback._id).style.display = "none";
                        document.getElementById("csbg").style.display = "none";
                    }

                    // Setting initiated marks the first time initiation of the iframe.
                    // When initiated for the first time, do not hide the survey because you want
                    // the survey to be shown for the first time.
                    // Any subsequent onload means that the survey is being refreshed or reset.
                    // This time hide it as being done in the above check.
                    initiated = true;
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Loaded iframe.");
                };

                var overlay = document.getElementById("csbg");
                while (overlay) {
                    // Remove any existing overlays
                    overlay.remove();
                    overlay = document.getElementById("csbg");
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Removing past overlay.");
                }

                var wrapper = document.getElementsByClassName("countly-" + feedbackWidgetFamily + "-wrapper");
                for (var i = 0; i < wrapper.length; i++) {
                    // Remove any existing feedback wrappers
                    wrapper[i].remove();
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Removed a wrapper.");
                }

                wrapper = document.createElement("div");
                wrapper.className = "countly-" + feedbackWidgetFamily + "-wrapper";
                wrapper.id = "countly-" + feedbackWidgetFamily + "-wrapper-" + presentableFeedback._id;

                if (presentableFeedback.type === "survey") {
                    // Set popup position
                    wrapper.className = wrapper.className + " " + presentableFeedback.appearance.position;
                }

                var element = document.body;
                var found = false;

                if (id) {
                    if (document.getElementById(id)) {
                        element = document.getElementById(id);
                        found = true;
                    }
                    else {
                        this.#log(logLevelEnums.ERROR, "present_feedback_widget, Provided ID not found.");
                    }
                }

                if (!found) {
                    // If the id element is not found check if a class was provided
                    if (className) {
                        if (document.getElementsByClassName(className)[0]) {
                            element = document.getElementsByClassName(className)[0];
                        }
                        else {
                            this.#log(logLevelEnums.ERROR, "present_feedback_widget, Provided class not found.");
                        }
                    }
                }

                element.insertAdjacentHTML("beforeend", "<div id=\"csbg\"></div>");
                element.appendChild(wrapper);
                if (presentableFeedback.type === "rating") {
                    // create a overlay div and inject it to wrapper
                    var ratingsOverlay = document.createElement("div");
                    ratingsOverlay.className = "countly-ratings-overlay";
                    ratingsOverlay.id = "countly-ratings-overlay-" + presentableFeedback._id;
                    wrapper.appendChild(ratingsOverlay);
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, appended the rating overlay to wrapper");

                    // add an event listener for the overlay
                    // so if someone clicked on the overlay, we can close popup
                    add_event_listener(document.getElementById("countly-ratings-overlay-" + presentableFeedback._id), "click", () => {
                        document.getElementById("countly-ratings-wrapper-" + presentableFeedback._id).style.display = "none";
                    });
                }

                wrapper.appendChild(iframe);
                this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Appended the iframe");

                add_event_listener(window, "message", (e) => {
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Received message from widget with origin: [" + e.origin + "] and data: [" + e.data + "]");
                    var data = {};
                    try {
                        data = JSON.parse(e.data);
                    }
                    catch (ex) {
                        this.#log(logLevelEnums.ERROR, "present_feedback_widget, Error while parsing message body " + ex);
                    }

                    if (data.close !== true) { // to not mix with content we check against true value
                        this.#log(logLevelEnums.DEBUG, "present_feedback_widget, These are not the closing signals you are looking for");
                        return;
                    }

                    document.getElementById("countly-" + feedbackWidgetFamily + "-wrapper-" + presentableFeedback._id).style.display = "none";
                    document.getElementById("csbg").style.display = "none";
                    this.#log(logLevelEnums.DEBUG, "present_feedback_widget, Closed the widget");
                });
                /**
                 * Function to show survey popup
                 * @param  {Object} feedback - feedback object
                 */
                var showSurvey = (feedback) => {
                    document.getElementById("countly-surveys-wrapper-" + feedback._id).style.display = "block";
                    document.getElementById("csbg").style.display = "block";
                }

                /**
                 * Function to prepare rating sticker and feedback widget
                 * @param  {Object} feedback - feedback object
                 */
                var showRatingForFeedbackWidget = (feedback) => {
                    // remove old stickers if exists
                    var stickers = document.getElementsByClassName("countly-feedback-sticker");
                    while (stickers.length > 0) {
                        this.#log(logLevelEnums.VERBOSE, "present_feedback_widget, Removing old stickers");
                        stickers[0].remove();
                    }

                    // render sticker if hide sticker property isn't set
                    if (!feedback.appearance.hideS) {
                        this.#log(logLevelEnums.DEBUG, "present_feedback_widget, handling the sticker as it was not set to hidden");
                        // create sticker wrapper element
                        var sticker = document.createElement("div");
                        sticker.innerText = feedback.appearance.text;
                        sticker.style.color = ((feedback.appearance.text_color.length < 7) ? "#" + feedback.appearance.text_color : feedback.appearance.text_color);
                        sticker.style.backgroundColor = ((feedback.appearance.bg_color.length < 7) ? "#" + feedback.appearance.bg_color : feedback.appearance.bg_color);
                        sticker.className = "countly-feedback-sticker  " + feedback.appearance.position + "-" + feedback.appearance.size;
                        sticker.id = "countly-feedback-sticker-" + feedback._id;
                        document.body.appendChild(sticker);

                        // sticker event handler
                        add_event_listener(document.getElementById("countly-feedback-sticker-" + feedback._id), "click", () => {
                            document.getElementById("countly-ratings-wrapper-" + feedback._id).style.display = "flex";
                            document.getElementById("csbg").style.display = "block";
                        });
                    }

                    // feedback widget close event handler
                    // TODO: Check if this is still valid
                    add_event_listener(document.getElementById("countly-feedback-close-icon-" + feedback._id), "click", () => {
                        document.getElementById("countly-ratings-wrapper-" + feedback._id).style.display = "none";
                        document.getElementById("csbg").style.display = "none";
                    });
                }

                if (presentableFeedback.type === "survey") {
                    var surveyShown = false;

                    // Set popup show policy
                    switch (presentableFeedback.showPolicy) {
                        case "afterPageLoad":
                            if (document.readyState === "complete") {
                                if (!surveyShown) {
                                    surveyShown = true;
                                    showSurvey(presentableFeedback);
                                }
                            }
                            else {
                                add_event_listener(document, "readystatechange", (e) => {
                                    if (e.target.readyState === "complete") {
                                        if (!surveyShown) {
                                            surveyShown = true;
                                            showSurvey(presentableFeedback);
                                        }
                                    }
                                });
                            }

                            break;

                        case "afterConstantDelay":
                            setTimeout(() => {
                                if (!surveyShown) {
                                    surveyShown = true;
                                    showSurvey(presentableFeedback);
                                }
                            }, 10000);

                            break;

                        case "onAbandon":
                            if (document.readyState === "complete") {
                                add_event_listener(document, "mouseleave", () => {
                                    if (!surveyShown) {
                                        surveyShown = true;
                                        showSurvey(presentableFeedback);
                                    }
                                });
                            }
                            else {
                                add_event_listener(document, "readystatechange", (e) => {
                                    if (e.target.readyState === "complete") {
                                        add_event_listener(document, "mouseleave", () => {
                                            if (!surveyShown) {
                                                surveyShown = true;
                                                showSurvey(presentableFeedback);
                                            }
                                        });
                                    }
                                });
                            }

                            break;

                        case "onScrollHalfwayDown":
                            add_event_listener(window, "scroll", () => {
                                if (!surveyShown) {
                                    var scrollY = Math.max(window.scrollY, document.body.scrollTop, document.documentElement.scrollTop);
                                    var documentHeight = getDocHeight();
                                    if (scrollY >= (documentHeight / 2)) {
                                        surveyShown = true;
                                        showSurvey(presentableFeedback);
                                    }
                                }
                            });

                            break;

                        default:
                            if (!surveyShown) {
                                surveyShown = true;
                                showSurvey(presentableFeedback);
                            }
                    }
                }
                else if (presentableFeedback.type === "nps") {
                    document.getElementById("countly-" + feedbackWidgetFamily + "-wrapper-" + presentableFeedback._id).style.display = "block";
                    document.getElementById("csbg").style.display = "block";
                }
                else if (presentableFeedback.type === "rating") {
                    var ratingShown = false;

                    if (document.readyState === "complete") {
                        if (!ratingShown) {
                            ratingShown = true;
                            showRatingForFeedbackWidget(presentableFeedback);
                        }
                    }
                    else {
                        add_event_listener(document, "readystatechange", (e) => {
                            if (e.target.readyState === "complete") {
                                if (!ratingShown) {
                                    ratingShown = true;
                                    showRatingForFeedbackWidget(presentableFeedback);
                                }
                            }
                        });
                    }
                }
            }
            catch (e) {
                this.#log(logLevelEnums.ERROR, "present_feedback_widget, Something went wrong while presenting the widget: " + e);
            }


        };

        /**
         *  Record and report error, this is were tracked errors are modified and send to the request queue
         *  @param {Error} err - Error object
         *  @param {Boolean} nonfatal - nonfatal if true and false if fatal
         *  @param {Object} segments - custom crash segments
         */
        recordError = (err, nonfatal, segments) => {
            this.#log(logLevelEnums.INFO, "recordError, Recording error");
            if (this.check_consent(featureEnums.CRASHES) && err) {
                // crashSegments, if not null, was set while enabling error tracking
                segments = segments || this.#crashSegments;
                var error = "";
                if (typeof err === "object") {
                    if (typeof err.stack !== "undefined") {
                        error = err.stack;
                    }
                    else {
                        if (typeof err.name !== "undefined") {
                            error += err.name + ":";
                        }
                        if (typeof err.message !== "undefined") {
                            error += err.message + "\n";
                        }
                        if (typeof err.fileName !== "undefined") {
                            error += "in " + err.fileName + "\n";
                        }
                        if (typeof err.lineNumber !== "undefined") {
                            error += "on " + err.lineNumber;
                        }
                        if (typeof err.columnNumber !== "undefined") {
                            error += ":" + err.columnNumber;
                        }
                    }
                }
                else {
                    error = err + "";
                }
                // character limit check
                if (error.length > (this.maxStackTraceLineLength * this.maxStackTraceLinesPerThread)) {
                    this.#log(logLevelEnums.DEBUG, "record_error, Error stack is too long will be truncated");
                    // convert error into an array split from each newline 
                    var splittedError = error.split("\n");
                    // trim the array if it is too long
                    if (splittedError.length > this.maxStackTraceLinesPerThread) {
                        splittedError = splittedError.splice(0, this.maxStackTraceLinesPerThread);
                    }
                    // trim each line to a given limit
                    for (var i = 0, len = splittedError.length; i < len; i++) {
                        if (splittedError[i].length > this.maxStackTraceLineLength) {
                            splittedError[i] = splittedError[i].substring(0, this.maxStackTraceLineLength);
                        }
                    }
                    // turn modified array back into error string
                    error = splittedError.join("\n");
                }

                nonfatal = !!(nonfatal);
                var metrics = this.#getMetrics();
                var obj = { _resolution: metrics._resolution, _error: error, _app_version: metrics._app_version, _run: getTimestamp() - this.#startTime };

                obj._not_os_specific = true;
                obj._javascript = true;

                var battery = navigator.battery || navigator.webkitBattery || navigator.mozBattery || navigator.msBattery;
                if (battery) {
                    obj._bat = Math.floor(battery.level * 100);
                }

                if (typeof navigator.onLine !== "undefined") {
                    obj._online = !!(navigator.onLine);
                }

                if (isBrowser) {
                    obj._background = !(document.hasFocus());
                }

                if (this.#crashLogs.length > 0) {
                    obj._logs = this.#crashLogs.join("\n");
                }
                this.#crashLogs = [];

                obj._nonfatal = nonfatal;

                obj._view = this.getViewName();

                if (typeof segments !== "undefined") {
                    // truncate custom crash segment's key value pairs
                    segments = truncateObject(segments, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "record_error", this.#log);
                    obj._custom = segments;
                }

                try {
                    var canvas = document.createElement("canvas");
                    var gl = canvas.getContext("experimental-webgl");
                    obj._opengl = gl.getParameter(gl.VERSION);
                }
                catch (ex) {
                    this.#log(logLevelEnums.ERROR, "Could not get the experimental-webgl context: " + ex);
                }

                // send userAgent string with the crash object incase it gets removed by a gateway
                var req = {};
                req.crash = JSON.stringify(obj);
                req.metrics = JSON.stringify({ _ua: metrics._ua });

                this.#toRequestQueue(req);
            }
        };

        /**
         *  Check if user or visit should be ignored
         */
        #checkIgnore = () => {
            this.#log(logLevelEnums.INFO, "checkIgnore, Checking if user or visit should be ignored");
            if (this.ignore_prefetch && isBrowser && typeof document.visibilityState !== "undefined" && document.visibilityState === "prerender") {
                this.ignore_visitor = true;
                this.#log(logLevelEnums.DEBUG, "checkIgnore, Ignoring visit due to prerendering");
            }
            if (this.ignore_bots && userAgentSearchBotDetection()) {
                this.ignore_visitor = true;
                this.#log(logLevelEnums.DEBUG, "checkIgnore, Ignoring visit due to bot");
            }
        }

        content = {
            enterContentZone: () => {
                this.#enterContentZoneInternal();
            },
            exitContentZone: () => {
                if (!this.#inContentZone) {
                    this.#log(logLevelEnums.DEBUG, "content.exitContentZone, Not in content zone");
                    return;
                }
                this.#log(logLevelEnums.INFO, "content.exitContentZone, Exiting content zone");
                this.#inContentZone = false;
                if (this.#contentZoneTimer) {
                    clearInterval(this.#contentZoneTimer);
                    this.#log(logLevelEnums.DEBUG, "content.exitContentZone, content zone exited");
                }
            },
        };

        #enterContentZoneInternal = (forced) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "content.enterContentZone, window object is not available. Not entering content zone.");
                return;
            };
            if (this.#inContentZone && !forced) {
                this.#log(logLevelEnums.DEBUG, "content.enterContentZone, Already in content zone");
                return;
            }
            this.#log(logLevelEnums.INFO, "content.enterContentZone, Entering content zone");
            this.#inContentZone = true;
            if (!forced) {
                this.#sendContentRequest();
            }
            this.#contentZoneTimer = setInterval(() => {
                this.#sendContentRequest();
            }, this.#contentTimeInterval);
        };

        #prepareContentRequest = () => {
            this.#log(logLevelEnums.DEBUG, "prepareContentRequest, forming content request");
            const resInfo = this.#getResolution(true);
            var resToSend = {l : {}, p: {}};
            const lWidthPHeight = Math.max(resInfo.width, resInfo.height);
            const lHeightPWidth = Math.min(resInfo.width, resInfo.height);
            resToSend.l.w = lWidthPHeight;
            resToSend.l.h = lHeightPWidth;
            resToSend.p.w = lHeightPWidth;
            resToSend.p.h = lWidthPHeight;

            const local = navigator.language || navigator.browserLanguage || navigator.systemLanguage || navigator.userLanguage;
            const language = local.split('-')[0];
            var params = {
                method: "queue",
                la: language,
                resolution: JSON.stringify(resToSend),
                cly_ws: 1,
                cly_origin: window.location.origin,
            };

            this.#prepareRequest(params);
            return params;
        };

        #sendContentRequest = () => {
            this.#log(logLevelEnums.DEBUG, "sendContentRequest, sending content request");
            var params = this.#prepareContentRequest();
            this.#makeNetworkRequest("sendContentRequest,", this.url + this.#contentEndPoint, params, (e,param,resp) => {
                if (e) {
                    return;
                }
                this.#log(logLevelEnums.DEBUG, "sendContentRequest, received content: [" + resp + "]");
                this.#displayContent(resp);
                clearInterval(this.#contentZoneTimer); // prevent multiple content requests while one is on
                window.addEventListener('message', (event) => {
                    this.#interpretContentMessage(event);   
                });
            }, true);
        };

        #displayContent = (content) => {
            if (!content) {
                this.#log(logLevelEnums.DEBUG, "displayContent, no content to display");
                return;
            }
            this.#log(logLevelEnums.DEBUG, "displayContent, displaying content");
            var response = JSON.parse(content);

            var iframe = document.createElement("iframe");
            iframe.id = this.#contentIframeID;
            iframe.src = response.html;
            iframe.style.position = "absolute";
            var dimensionToUse = response.geo.p;
            const resInfo = this.#getResolution(true);
            if (resInfo.width >= resInfo.height) {
                dimensionToUse = response.geo.l;
            };
            iframe.style.left = dimensionToUse.x + "px";
            iframe.style.top = dimensionToUse.y + "px";
            iframe.style.width = dimensionToUse.w + "px";
            iframe.style.height = dimensionToUse.h + "px";
            iframe.style.border = "none";
            iframe.style.zIndex = "999999";
            document.body.appendChild(iframe);
        };

        #interpretContentMessage = (messageEvent) => {
            this.#log(logLevelEnums.DEBUG, "sendContentRequest, Received message from: [" + messageEvent.origin + "] with data: [" + JSON.stringify(messageEvent.data) + "]");
            if (messageEvent.origin !== this.url) {
                this.#log(logLevelEnums.ERROR, "sendContentRequest, Received message from invalid origin");
                return;
            }
            const {close, link, event} = messageEvent.data;

            if (event) {
                this.#log(logLevelEnums.DEBUG, "sendContentRequest, Received event: [" + event + "]");
                if (close === 1) {
                    this.#log(logLevelEnums.DEBUG, "sendContentRequest, Closing content frame for event: [" + event + "]");
                    this.#closeContentFrame();
                }
                if (!Array.isArray(event)) {
                    if (typeof event === "object") {
                        event = [event];
                    } else {
                        this.#log(logLevelEnums.ERROR, "sendContentRequest, Invalid event type: [" + typeof event + "]");
                        return;
                    }
                };
                // event is expected to be an array of events
                for (var i = 0; i < event.length; i++) {
                    this.#add_cly_events(event[i]);
                }
            }

            if (link) {
                if (close === 1) {
                    this.#log(logLevelEnums.DEBUG, "sendContentRequest, Closing content frame for link");
                    this.#closeContentFrame();
                }
                window.open(link, "_blank");
                this.#log(logLevelEnums.DEBUG, `sendContentRequest, Opened link in new tab: [${link}]`);
            }

            if (close === 1) {
                this.#closeContentFrame();
            }
        };
        
        #closeContentFrame = () => {
            const iframe = document.getElementById(this.#contentIframeID);
            if (iframe) {
                iframe.remove();
                this.#log(logLevelEnums.DEBUG, "sendContentRequest, removed iframe");
                if (this.#inContentZone) { // if user did not exit content zone, re-enter
                    this.#enterContentZoneInternal(true);
                }
            }
        };
        
        /**
         * Check and send the events to request queue if there are any, empty the event queue
         */
        #sendEventsForced = () => {
            if (this.#eventQueue.length > 0) {
                this.#log(logLevelEnums.DEBUG, "Flushing events");
                this.#toRequestQueue({ events: JSON.stringify(this.#eventQueue) });
                this.#eventQueue = [];
                this.#setValueInStorage("cly_event", this.#eventQueue);
            }
        }

        /**
         *  Prepare widget data for displaying
         *  @param {Object} currentWidget - widget object
         *  @param {Boolean} hasSticker - if widget has sticker
         */
        #processWidget = (currentWidget, hasSticker) => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "processWidget, window object is not available. Not processing widget.");
                return;
            }
            // prevent widget create process if widget exist with same id
            var isDuplicate = !!document.getElementById("countly-feedback-sticker-" + currentWidget._id);
            if (isDuplicate) {
                this.#log(logLevelEnums.ERROR, "Widget with same ID exists");
                return;
            }
            try {
                // create wrapper div
                var wrapper = document.createElement("div");
                wrapper.className = "countly-iframe-wrapper";
                wrapper.id = "countly-iframe-wrapper-" + currentWidget._id;
                // create close icon for iframe popup
                var closeIcon = document.createElement("span");
                closeIcon.className = "countly-feedback-close-icon";
                closeIcon.id = "countly-feedback-close-icon-" + currentWidget._id;
                closeIcon.innerText = "x";

                // create iframe
                var iframe = document.createElement("iframe");
                iframe.name = "countly-feedback-iframe";
                iframe.id = "countly-feedback-iframe";
                iframe.src = this.url + "/feedback?widget_id=" + currentWidget._id + "&app_key=" + this.app_key + "&device_id=" + this.device_id + "&sdk_version=" + this.#sdkVersion;
                // inject them to dom
                document.body.appendChild(wrapper);
                wrapper.appendChild(closeIcon);
                wrapper.appendChild(iframe);
                add_event_listener(document.getElementById("countly-feedback-close-icon-" + currentWidget._id), "click", () => {
                    document.getElementById("countly-iframe-wrapper-" + currentWidget._id).style.display = "none";
                    document.getElementById("cfbg").style.display = "none";
                });
                if (hasSticker) {
                    // create svg element
                    var svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svgIcon.id = "feedback-sticker-svg";
                    svgIcon.setAttribute("aria-hidden", "true");
                    svgIcon.setAttribute("data-prefix", "far");
                    svgIcon.setAttribute("data-icon", "grin");
                    svgIcon.setAttribute("class", "svg-inline--fa fa-grin fa-w-16");
                    svgIcon.setAttribute("role", "img");
                    svgIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                    svgIcon.setAttribute("viewBox", "0 0 496 512");
                    // create path for svg
                    var svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    svgPath.id = "smileyPathInStickerSvg";
                    svgPath.setAttribute("fill", "white");
                    svgPath.setAttribute("d", "M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm105.6-151.4c-25.9 8.3-64.4 13.1-105.6 13.1s-79.6-4.8-105.6-13.1c-9.9-3.1-19.4 5.4-17.7 15.3 7.9 47.1 71.3 80 123.3 80s115.3-32.9 123.3-80c1.6-9.8-7.7-18.4-17.7-15.3zM168 240c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32z");
                    // create sticker text wrapper
                    var stickerText = document.createElement("span");
                    stickerText.innerText = currentWidget.trigger_button_text;
                    // create sticker wrapper element
                    var sticker = document.createElement("div");
                    sticker.style.color = ((currentWidget.trigger_font_color.length < 7) ? "#" + currentWidget.trigger_font_color : currentWidget.trigger_font_color);
                    sticker.style.backgroundColor = ((currentWidget.trigger_bg_color.length < 7) ? "#" + currentWidget.trigger_bg_color : currentWidget.trigger_bg_color);
                    sticker.className = "countly-feedback-sticker  " + currentWidget.trigger_position + "-" + currentWidget.trigger_size;
                    sticker.id = "countly-feedback-sticker-" + currentWidget._id;
                    svgIcon.appendChild(svgPath);
                    sticker.appendChild(svgIcon);
                    sticker.appendChild(stickerText);
                    document.body.appendChild(sticker);
                    var smileySvg = document.getElementById("smileyPathInStickerSvg");
                    if (smileySvg) {
                        smileySvg.style.fill = ((currentWidget.trigger_font_color.length < 7) ? "#" + currentWidget.trigger_font_color : currentWidget.trigger_font_color);
                    }
                    add_event_listener(document.getElementById("countly-feedback-sticker-" + currentWidget._id), "click", () => {
                        document.getElementById("countly-iframe-wrapper-" + currentWidget._id).style.display = "block";
                        document.getElementById("cfbg").style.display = "block";
                    });
                }
                else {
                    document.getElementById("countly-iframe-wrapper-" + currentWidget._id).style.display = "block";
                    document.getElementById("cfbg").style.display = "block";
                }
            }
            catch (e) {
                this.#log(logLevelEnums.ERROR, "Somethings went wrong while element injecting process: " + e);
            }
        }

        /**
         *  Notify all waiting callbacks that script was loaded and instance created
         */
        #notifyLoaders = () => {
            // notify load waiters
            var i;
            if (typeof this.onload !== "undefined" && this.onload.length > 0) {
                for (i = 0; i < this.onload.length; i++) {
                    if (typeof this.onload[i] === "function") {
                        this.onload[i](this);
                    }
                }
                this.onload = [];
            }
        }

        /**
         *  Report duration of how long user was on this view
         *  @memberof Countly._internals
         */
        #reportViewDuration = () => {
            if (!this.#lastView) {
                this.#log(logLevelEnums.INFO, "reportViewDuration, No last view, will not report view duration");
                return;
            }
            this.#log(logLevelEnums.INFO, "reportViewDuration, Reporting view duration for: [" + this.#lastView + "]");
            var segments = {
                name: this.#lastView
            };

            // track pageview
            if (this.check_consent(featureEnums.VIEWS)) {
                this.#add_cly_events({
                    key: internalEventKeyEnums.VIEW,
                    dur: (this.#trackTime) ? getTimestamp() - this.#lastViewTime : this.#lastViewStoredDuration,
                    segmentation: segments
                }, this.#currentViewId);
                this.#lastView = null;
            }
        }

        /**
         *  Get last view that user visited
         *  @memberof Countly._internals
         *  @returns {String} view name
         */
        #getLastView = () => {
            this.#log(logLevelEnums.INFO, "getLastView, Getting last view: [" + this.#lastView + "]");
            return this.#lastView;
        }

        /**
         *  Extend session's cookie's time
         */
        #extendSession = () => {
            if (!this.#useSessionCookie) {
                this.#log(logLevelEnums.DEBUG, "Will not extend the session as session cookie is disabled");
                return;
            }
            this.#log(logLevelEnums.DEBUG, "Extending session");

            // if session expired, we should start a new one
            var expire = this.#getValueFromStorage("cly_session");
            if (!expire || parseInt(expire) <= getTimestamp()) {
                this.#sessionStarted = false;
                this.begin_session(!this.#autoExtend);
            }
            this.#setValueInStorage("cly_session", getTimestamp() + (this.#sessionCookieTimeout * 60));
        }

        /**
         *  Prepare request params by adding common properties to it
         *  @param {Object} request - request object
         */
        #prepareRequest = (request) => {
            request.app_key = this.app_key;
            request.device_id = this.device_id;
            request.sdk_name = this.#sdkName;
            request.sdk_version = this.#sdkVersion;
            request.t = this.#deviceIdType;
            request.av = this.app_version;

            var ua = this.#getUA();
            if (!request.metrics) { // if metrics not provided pass useragent with this event
                request.metrics = JSON.stringify({ _ua: ua });
            }
            else { // if metrics provided
                var currentMetrics = JSON.parse(request.metrics);
                if (!currentMetrics._ua) { // check if ua is present and if not add that
                    currentMetrics._ua = ua;
                    request.metrics = JSON.stringify(currentMetrics);
                }
            }

            if (this.check_consent(featureEnums.LOCATION)) {
                if (this.country_code) {
                    request.country_code = this.country_code;
                }

                if (this.city) {
                    request.city = this.city;
                }

                if (this.ip_address !== null) {
                    request.ip_address = this.ip_address;
                }
            }
            else {
                request.location = "";
            }

            request.timestamp = getMsTimestamp();

            var date = new Date();
            request.hour = date.getHours();
            request.dow = date.getDay();
        }

        /**
         *  Add request to request queue
         *  @memberof Countly._internals
         *  @param {Object} request - object with request parameters
         */
        #toRequestQueue = (request) => {
            if (this.ignore_visitor) {
                this.#log(logLevelEnums.WARNING, "User is opt_out will ignore the request: " + request);
                return;
            }

            if (!this.app_key || !this.device_id) {
                this.#log(logLevelEnums.ERROR, "app_key or device_id is missing ", this.app_key, this.device_id);
                return;
            }

            this.#prepareRequest(request);

            if (this.#requestQueue.length > this.#queueSize) {
                this.#requestQueue.shift();
            }

            this.#requestQueue.push(request);
            this.#setValueInStorage("cly_queue", this.#requestQueue, true);
        }

        /**
         *  Making request making and data processing loop
         *  @memberof Countly._internals
         *  @returns {void} void
         */
        #heartBeat = () => {
            this.#notifyLoaders();

            // ignore bots
            if (this.ignore_visitor) {
                this.#hasPulse = false;
                this.#log(logLevelEnums.WARNING, "User opt_out, no heartbeat");
                return;
            }

            this.#hasPulse = true;
            // process queue
            if (this.#global && typeof Countly.q !== "undefined" && Countly.q.length > 0) {
                this.#processAsyncQueue();
            }

            // extend session if needed
            if (this.#sessionStarted && this.#autoExtend && this.#trackTime) {
                var last = getTimestamp();
                if (last - this.#lastBeat > this.#sessionUpdate) {
                    this.session_duration(last - this.#lastBeat);
                    this.#lastBeat = last;
                    // save health check logging counters if there are any
                    if (this.hcErrorCount > 0) {
                        this.#setValueInStorage(healthCheckCounterEnum.errorCount, this.hcErrorCount);
                    }
                    if (this.hcWarningCount > 0) {
                        this.#setValueInStorage(healthCheckCounterEnum.warningCount, this.hcWarningCount);
                    }
                }
            }

            // process event queue
            if (this.#eventQueue.length > 0 && !this.test_mode_eq) {
                if (this.#eventQueue.length <= this.#maxEventBatch) {
                    this.#toRequestQueue({ events: JSON.stringify(this.#eventQueue) });
                    this.#eventQueue = [];
                }
                else {
                    var events = this.#eventQueue.splice(0, this.#maxEventBatch);
                    this.#toRequestQueue({ events: JSON.stringify(events) });
                }
                this.#setValueInStorage("cly_event", this.#eventQueue);
            }

            // process request queue with event queue
            if (!this.#offlineMode && this.#requestQueue.length > 0 && this.#readyToProcess && getTimestamp() > this.#failTimeout) {
                this.#readyToProcess = false;
                var params = this.#requestQueue[0];
                params.rr = this.#requestQueue.length; // added at 23.2.3. It would give the current length of the queue. That includes the current request.
                this.#log(logLevelEnums.DEBUG, "Processing request", params);
                this.#setValueInStorage("cly_queue", this.#requestQueue, true);
                if (!this.test_mode) {
                    this.#makeNetworkRequest("send_request_queue", this.url + this.#apiPath, params, (err, parameters) => {
                        if (err) {
                            // error has been logged by the request function
                            this.#failTimeout = getTimestamp() + this.#failTimeoutAmount;
                        }
                        else {
                            // remove first item from queue
                            this.#requestQueue.shift();
                        }
                        this.#setValueInStorage("cly_queue", this.#requestQueue, true);
                        this.#readyToProcess = true;
                        // expected response is only JSON object
                    }, false);
                }
            }

            setTimeout(() => {
            this.#heartBeat(); 
            }, this.#beatInterval);
        }

        /**
         * Returns generated requests for the instance for testing purposes
         * @returns {Array} - Returns generated requests
         */
        #getGeneratedRequests = () => {
            return this.#generatedRequests;
        };

        /**
         * Process queued calls
         * @memberof Countly._internals
         */
        #processAsyncQueue = () => {
            if (typeof Countly === "undefined" || typeof Countly.i === "undefined") {
                this.#log(logLevelEnums.DEBUG, "Countly is not finished initialization yet, will process the queue after initialization is done");
                return;
            }

            const q = Countly.q;
            Countly.q = [];
            for (let i = 0; i < q.length; i++) {
                let req = q[i];
                this.#log(logLevelEnums.DEBUG, "Processing queued calls:" + req);
                if (typeof req === "function") {
                    req();
                }
                else if (Array.isArray(req) && req.length > 0) {
                    var inst = this;
                    var arg = 0;
                    // check if it is meant for other tracker
                    try {
                        if (Countly.i[req[arg]]) {
                            inst = Countly.i[req[arg]];
                            arg++;
                        }
                    } catch (error) {
                        // possibly first init and no other instance
                        this.#log(logLevelEnums.DEBUG, "No instance found for the provided key while processing async queue");
                        Countly.q.push(req); // return it back to queue and continue to the next one
                        continue;
                    }
                    if (typeof inst[req[arg]] === "function") {
                        inst[req[arg]].apply(inst, req.slice(arg + 1));
                    }
                    else if (req[arg].indexOf("userData.") === 0) {
                        var userdata = req[arg].replace("userData.", "");
                        if (typeof inst.userData[userdata] === "function") {
                            inst.userData[userdata].apply(inst, req.slice(arg + 1));
                        }
                    }
                    else if (typeof Countly[req[arg]] === "function") {
                        Countly[req[arg]].apply(Countly, req.slice(arg + 1));
                    }
                }
            }
        }

        /**
         *  Get device ID, stored one, or generate new one
         *  @memberof Countly._internals
         *  @returns {String} device id
         */
        #getStoredIdOrGenerateId = () => {
            var storedDeviceId = this.#getValueFromStorage("cly_id");
            if (storedDeviceId) {
                this.#deviceIdType = this.#getValueFromStorage("cly_id_type");
                return storedDeviceId;
            }
            return generateUUID();
        }

        /**
         *  Check if value is in UUID format
         *  @memberof Countly._internals
         * @param {string} providedId -  Id to check
         *  @returns {Boolean} true if it is in UUID format
         */
        #isUUID = (providedId) => {
            return /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-4[0-9a-fA-F]{3}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/.test(providedId);
        }

        /**
         *  Get and return user agentAgent
         *  @memberof Countly._internals
         *  @returns {string} returns userAgent string
         */
        #getUA = () => {
            return this.metrics._ua || currentUserAgentString();
        }

        /**
         *  Get metrics of the browser or config object
         *  @memberof Countly._internals
         *  @returns {Object} Metrics object
         */
        #getMetrics = () => {
            var metrics = JSON.parse(JSON.stringify(this.metrics || {}));

            // getting app version
            metrics._app_version = metrics._app_version || this.app_version;
            metrics._ua = metrics._ua || currentUserAgentString();

            // getting resolution
            var resolution = this.#getResolution();
            if (resolution) {
                var formattedRes = "" + resolution.width + "x" + resolution.height;
                metrics._resolution = metrics._resolution || formattedRes;
            }

            // getting density ratio
            if (isBrowser && window.devicePixelRatio) {
                metrics._density = metrics._density || window.devicePixelRatio;
            }

            // getting locale
            var locale = navigator.language || navigator.browserLanguage || navigator.systemLanguage || navigator.userLanguage;
            if (typeof locale !== "undefined") {
                metrics._locale = metrics._locale || locale;
            }

            if (this.#isReferrerUsable()) {
                metrics._store = metrics._store || document.referrer;
            }

            this.#log(logLevelEnums.DEBUG, "Got metrics", metrics);
            return metrics;
        }

        /**
         * returns the resolution of the device
         * @param {bool} getViewPort - get viewport
         * @returns {object} resolution object: {width: 1920, height: 1080, orientation: 0}
         */
        #getResolution = (getViewPort) => {
            this.#log(logLevelEnums.DEBUG, "Getting the resolution of the device");
            if (!isBrowser || !screen) {
                this.#log(logLevelEnums.DEBUG, "No screen available");
                return null;
            };

            var width = (screen.width) ? parseInt(screen.width) : 0;
            var height = (screen.height) ? parseInt(screen.height) : 0;

            if (getViewPort) {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const layoutWidth = document.documentElement.clientWidth;
                const layoutHeight = document.documentElement.clientHeight;
                const visibleWidth = Math.min(viewportWidth, layoutWidth);
                const visibleHeight = Math.min(viewportHeight, layoutHeight);

                width = visibleWidth ? parseInt(visibleWidth) : width;
                height = visibleHeight ? parseInt(visibleHeight) : height;
            }

            if (width === 0 || height === 0) { 
                this.#log(logLevelEnums.DEBUG, "Screen width or height is non existent");
                return null;
            }
            var iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
            if (iOS && window.devicePixelRatio) {
                this.#log(logLevelEnums.VERBOSE, "Mobile Mac device detected, adjusting resolution");
                // ios provides dips, need to multiply
                width = Math.round(width * window.devicePixelRatio);
                height = Math.round(height * window.devicePixelRatio);
            }
            if (Math.abs(screen.orientation.angle) === 90) {
                this.#log(logLevelEnums.VERBOSE, "Screen is in landscape mode, adjusting resolution");
                var temp = width;
                width = height;
                height = temp;
            }
            return { width: width, height: height , orientation: screen.orientation.angle };
        };

        /**
         *  @memberof Countly._internals
         * document.referrer returns the full URL of the page the user was on before they came to your site.
         * If the user open your site from bookmarks or by typing the URL in the address bar, then document.referrer is an empty string.
         * Inside an iframe, document.referrer will initially be set to the same value as the href of the parent window's Window.location. 
         * 
         * @param {string} customReferrer - custom referrer for testing
         * @returns {boolean} true if document.referrer is not empty string, undefined, current host or in the ignore list.
         */
        #isReferrerUsable = (customReferrer) => {
            if (!isBrowser) {
                return false;
            }
            var referrer = customReferrer || document.referrer;
            var isReferrerLegit = false;

            // do not report referrer if it is empty string or undefined
            if (typeof referrer === "undefined" || referrer.length === 0) {
                this.#log(logLevelEnums.DEBUG, "Invalid referrer:[" + referrer + "], ignoring.");
            }
            else {
                // dissect the referrer (check urlParseRE's comments for more info on this process)
                var matches = urlParseRE.exec(referrer); // this can return null
                if (!matches) {
                    this.#log(logLevelEnums.DEBUG, "Referrer is corrupt:[" + referrer + "], ignoring.");
                }
                else if (!matches[11]) {
                    this.#log(logLevelEnums.DEBUG, "No path found in referrer:[" + referrer + "], ignoring.");
                }
                else if (matches[11] === window.location.hostname) {
                    this.#log(logLevelEnums.DEBUG, "Referrer is current host:[" + referrer + "], ignoring.");
                }
                else {
                    if (this.#ignoreReferrers && this.#ignoreReferrers.length) {
                        isReferrerLegit = true;
                        for (var k = 0; k < this.#ignoreReferrers.length; k++) {
                            if (referrer.indexOf(this.#ignoreReferrers[k]) >= 0) {
                                this.#log(logLevelEnums.DEBUG, "Referrer in ignore list:[" + referrer + "], ignoring.");
                                isReferrerLegit = false;
                                break;
                            }
                        }
                    }
                    else {
                        this.#log(logLevelEnums.DEBUG, "Valid referrer:[" + referrer + "]");
                        isReferrerLegit = true;
                    }
                }
            }

            return isReferrerLegit;
        }

        /**
         *  Logging stuff, works only when debug mode is true
         * @param {string} level - log level (error, warning, info, debug, verbose)
         * @param {string} message - any string message
         * @memberof Countly._internals
         */
        #log = (level, message, third) => {
            if (this.debug && typeof console !== "undefined") {
                // parse the arguments into a string if it is an object
                if (third && typeof third === "object") {
                    third = JSON.stringify(third);
                }
                // append app_key to the start of the message if it is not the first instance (for multi instancing)
                if (!this.#global) {
                    message = "[" + this.app_key + "] " + message;
                }
                // if the provided level is not a proper log level re-assign it as [DEBUG]
                if (!level) {
                    level = logLevelEnums.DEBUG;
                }
                // append level, message and args
                var extraArguments = "";
                if (third) {
                    extraArguments = " " + third;
                }
                // eslint-disable-next-line no-shadow
                var log = level + "[Countly] " + message + extraArguments;
                // decide on the console
                if (level === logLevelEnums.ERROR) {
                    // eslint-disable-next-line no-console
                    console.error(log);
                    this.#HealthCheck.incrementErrorCount();
                }
                else if (level === logLevelEnums.WARNING) {
                    // eslint-disable-next-line no-console
                    console.warn(log);
                    this.#HealthCheck.incrementWarningCount();
                }
                else if (level === logLevelEnums.INFO) {
                    // eslint-disable-next-line no-console
                    console.info(log);
                }
                else if (level === logLevelEnums.VERBOSE) {
                    // eslint-disable-next-line no-console
                    console.log(log);
                }
                // if none of the above must be [DEBUG]
                else {
                    // eslint-disable-next-line no-console
                    console.debug(log);
                }
            }
        }

        /**
         *  Decides to use which type of request method
         *  @memberof Countly._internals
         *  @param {String} functionName - Name of the function making the request for more detailed logging
         *  @param {String} url - URL where to make request
         *  @param {Object} params - key value object with URL params
         *  @param {Function} callback - callback when request finished or failed
         *  @param {Boolean} useBroadResponseValidator - if true that means the expected response is either a JSON object or a JSON array, if false only JSON 
         */
        #makeNetworkRequest = (functionName, url, params, callback, useBroadResponseValidator) => {
            this.#generatedRequests.push({ functionName: functionName, url: url, params: params});
            if (!isBrowser) {
                this.#sendFetchRequest(functionName, url, params, callback, useBroadResponseValidator);
            }
            else {
                this.#sendXmlHttpRequest(functionName, url, params, callback, useBroadResponseValidator);
            }
        }

        /**
         *  Making xml HTTP request
         *  @memberof Countly._internals
         *  @param {String} functionName - Name of the function making the request for more detailed logging
         *  @param {String} url - URL where to make request
         *  @param {Object} params - key value object with URL params
         *  @param {Function} callback - callback when request finished or failed
         *  @param {Boolean} useBroadResponseValidator - if true that means the expected response is either a JSON object or a JSON array, if false only JSON 
         */
        #sendXmlHttpRequest = (functionName, url, params, callback, useBroadResponseValidator) => {
            useBroadResponseValidator = useBroadResponseValidator || false;
            try {
                this.#log(logLevelEnums.DEBUG, "Sending XML HTTP request");
                var xhr = new XMLHttpRequest();
                params = params || {};
                prepareParams(params, this.salt).then(saltedData => {
                    var method = "POST";
                    if (this.force_post || saltedData.length >= 2000) {
                        method = "POST";
                    }
                    if (method === "GET") {
                        xhr.open("GET", url + "?" + saltedData, true);
                    }
                    else {
                        xhr.open("POST", url, true);
                        xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                    }
                    for (var header in this.headers) {
                        xhr.setRequestHeader(header, this.headers[header]);
                    }
                    // fallback on error
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState === 4) {
                            this.#log(logLevelEnums.DEBUG, functionName + " HTTP request completed with status code: [" + xhr.status + "] and response: [" + xhr.responseText + "]");
                            // response validation function will be selected to also accept JSON arrays if useBroadResponseValidator is true
                            var isResponseValidated;
                            if (useBroadResponseValidator) {
                                // JSON array/object both can pass
                                isResponseValidated = this.#isResponseValidBroad(xhr.status, xhr.responseText);
                            }
                            else {
                                // only JSON object can pass
                                isResponseValidated = this.#isResponseValid(xhr.status, xhr.responseText);
                            }
                            if (isResponseValidated) {
                                if (typeof callback === "function") {
                                    callback(false, params, xhr.responseText);
                                }
                            }
                            else {
                                this.#log(logLevelEnums.ERROR, functionName + " Invalid response from server");
                                if (functionName === "send_request_queue") {
                                    this.#HealthCheck.saveRequestCounters(xhr.status, xhr.responseText);
                                }
                                if (typeof callback === "function") {
                                    callback(true, params, xhr.status, xhr.responseText);
                                }
                            }
                        }
                    };
                    if (method === "GET") {
                        xhr.send();
                    }
                    else {
                        xhr.send(saltedData);
                    }
                });
            }
            catch (e) {
                // fallback
                this.#log(logLevelEnums.ERROR, functionName + " Something went wrong while making an XML HTTP request: " + e);
                if (typeof callback === "function") {
                    callback(true, params);
                }
            }
        }

        /**
         *  Make a fetch request
         *  @memberof Countly._internals
         *  @param {String} functionName - Name of the function making the request for more detailed logging
         *  @param {String} url - URL where to make request
         *  @param {Object} params - key value object with URL params
         *  @param {Function} callback - callback when request finished or failed
         *  @param {Boolean} useBroadResponseValidator - if true that means the expected response is either a JSON object or a JSON array, if false only JSON 
         */
        #sendFetchRequest = (functionName, url, params, callback, useBroadResponseValidator) => {
            useBroadResponseValidator = useBroadResponseValidator || false;
            var response;

            try {
                this.#log(logLevelEnums.DEBUG, "Sending Fetch request");

                // Prepare request options
                var method = "POST";
                var headers = { "Content-type": "application/x-www-form-urlencoded" };
                var body = null;

                params = params || {};
                prepareParams(params, this.salt).then(saltedData => {
                    if (this.force_post || saltedData.length >= 2000) {
                        method = "POST";
                        body = saltedData;
                    }
                    else {
                        url += "?" + saltedData;
                    }

                    // Add custom headers
                    for (var header in this.headers) {
                        headers[header] = this.headers[header];
                    }

                    // Make the fetch request
                    fetch(url, {
                        method: method,
                        headers: headers,
                        body: body,
                    }).then((res) => {
                        response = res;
                        return response.text();
                    }).then((data) => {
                        this.#log(logLevelEnums.DEBUG, functionName + " Fetch request completed wit status code: [" + response.status + "] and response: [" + data + "]");
                        var isResponseValidated;
                        if (useBroadResponseValidator) {
                            isResponseValidated = this.#isResponseValidBroad(response.status, data);
                        }
                        else {
                            isResponseValidated = this.#isResponseValid(response.status, data);
                        }

                        if (isResponseValidated) {
                            if (typeof callback === "function") {
                                callback(false, params, data);
                            }
                        }
                        else {
                            this.#log(logLevelEnums.ERROR, functionName + " Invalid response from server");
                            if (functionName === "send_request_queue") {
                                this.#HealthCheck.saveRequestCounters(response.status, data);
                            }
                            if (typeof callback === "function") {
                                callback(true, params, response.status, data);
                            }
                        }
                    }).catch((error) => {
                        this.#log(logLevelEnums.ERROR, functionName + " Failed Fetch request: " + error);
                        if (typeof callback === "function") {
                            callback(true, params);
                        }
                    });
                });
            }
            catch (e) {
                // fallback
                this.#log(logLevelEnums.ERROR, functionName + " Something went wrong with the Fetch request attempt: " + e);
                if (typeof callback === "function") {
                    callback(true, params);
                }
            }
        }

        /**
         * Check if the http response fits the bill of:
         * 1. The HTTP response code was successful (which is any 2xx code or code between 200 <= x < 300)
         * 2. The returned request is a JSON object
         * @memberof Countly._internals
         * @param {Number} statusCode - http incoming statusCode.
         * @param {String} str - response from server, ideally must be: {"result":"Success"} or should contain at least result field
         * @returns {Boolean} - returns true if response passes the tests 
         */
        #isResponseValid = (statusCode, str) => {
            // status code and response format check
            if (!(statusCode >= 200 && statusCode < 300)) {
                this.#log(logLevelEnums.ERROR, "Http response status code:[" + statusCode + "] is not within the expected range");
                return false;
            }

            // Try to parse JSON
            try {
                var parsedResponse = JSON.parse(str);

                // check if parsed response is a JSON object, if not the response is not valid
                if (Object.prototype.toString.call(parsedResponse) !== "[object Object]") {
                    this.#log(logLevelEnums.ERROR, "Http response is not JSON Object");
                    return false;
                }

                return !!(parsedResponse.result);
            }
            catch (e) {
                this.#log(logLevelEnums.ERROR, "Http response is not JSON: " + e);
                return false;
            }
        }

        /**
         * Check if the http response fits the bill of:
         * 1. The HTTP response code was successful (which is any 2xx code or code between 200 <= x < 300)
         * 2. The returned request is a JSON object or JSON Array
         * @memberof Countly._internals
         * @param {Number} statusCode - http incoming statusCode.
         * @param {String} str - response from server, ideally must be: {"result":"Success"} or should contain at least result field
         * @returns {Boolean} - returns true if response passes the tests 
         */
        #isResponseValidBroad = (statusCode, str) => {
            // status code and response format check
            if (!(statusCode >= 200 && statusCode < 300)) {
                this.#log(logLevelEnums.ERROR, "Http response status code:[" + statusCode + "] is not within the expected range");
                return false;
            }

            // Try to parse JSON
            try {
                var parsedResponse = JSON.parse(str);
                // check if parsed response is a JSON object or JSON array, if not it is not valid 
                if ((Object.prototype.toString.call(parsedResponse) !== "[object Object]") && (!Array.isArray(parsedResponse))) {
                    this.#log(logLevelEnums.ERROR, "Http response is not JSON Object nor JSON Array");
                    return false;
                }

                // request should be accepted even if does not have result field
                return true;
            }
            catch (e) {
                this.#log(logLevelEnums.ERROR, "Http response is not JSON: " + e);
                return false;
            }
        }

        /**
         *  Get max scroll position
         *  @memberof Countly._internals
         * 
         */
        #processScroll = () => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "processScroll, window object is not available. Not processing scroll.");
                return;
            }
            this.#scrollRegistryTopPosition = Math.max(this.#scrollRegistryTopPosition, window.scrollY, document.body.scrollTop, document.documentElement.scrollTop);
        }

        /**
         *  Process scroll data
         *  @memberof Countly._internals
         */
        #processScrollView = () => {
            if (!isBrowser) {
                this.#log(logLevelEnums.WARNING, "processScrollView, window object is not available. Not processing scroll view.");
                return;
            }
            if (this.#isScrollRegistryOpen) {
                this.#isScrollRegistryOpen = false;
                var height = getDocHeight();
                var width = getDocWidth();

                var viewportHeight = getViewportHeight();

                if (this.check_consent(featureEnums.SCROLLS)) {
                    var segments = {
                        type: "scroll",
                        y: this.#scrollRegistryTopPosition + viewportHeight,
                        width: width,
                        height: height,
                        view: this.getViewUrl()
                    };
                    // truncate new segment
                    segments = truncateObject(segments, this.maxKeyLength, this.maxValueSize, this.maxSegmentationValues, "processScrollView", this.#log);
                    if (this.track_domains) {
                        segments.domain = window.location.hostname;
                    }
                    this.#add_cly_events({
                        key: internalEventKeyEnums.ACTION,
                        segmentation: segments
                    });
                }
            }
        }

        /**
         *  Fetches the current device Id type
         *  @memberof Countly._internals
         *  @returns {String} token - auth token
         */
        #getInternalDeviceIdType = () => {
            return this.#deviceIdType;
        }

        /**
         *  Set auth token
         *  @memberof Countly._internals
         *  @param {String} token - auth token
         */
        #setToken = (token) => {
            this.#setValueInStorage("cly_token", token);
        }

        /**
         *  Get auth token
         *  @memberof Countly._internals
         *  @returns {String} auth token
         */
        #getToken = () => {
            var token = this.#getValueFromStorage("cly_token");
            this.#removeValueFromStorage("cly_token");
            return token;
        }

        /**
         *  Get event queue
         *  @memberof Countly._internals
         *  @returns {Array} event queue
         */
        #getEventQueue = () => {
            return this.#eventQueue;
        }

        /**
         *  Get request queue
         *  @memberof Countly._internals
         *  @returns {Array} request queue
         */
        #getRequestQueue = () => {
            return this.#requestQueue;
        }

        /**
        * Returns contents of a cookie
        * @param {String} cookieKey - The key, name or identifier for the cookie
        * @returns {Varies} stored value
        */
        #readCookie = (cookieKey) => {
            var cookieID = cookieKey + "=";
            // array of all cookies available
            var cookieArray = document.cookie.split(";");
            for (var i = 0, max = cookieArray.length; i < max; i++) {
                // cookie from the cookie array to be checked
                var cookie = cookieArray[i];
                // get rid of empty spaces at the beginning
                while (cookie.charAt(0) === " ") {
                    cookie = cookie.substring(1, cookie.length);
                }
                // return the cookie if it is the one we are looking for
                if (cookie.indexOf(cookieID) === 0) {
                    // just return the value part after '='
                    return cookie.substring(cookieID.length, cookie.length);
                }
            }
            return null;
        }

        /**
         *  Creates new cookie or removes cookie with negative expiration
         *  @param {String} cookieKey - The key or identifier for the storage
         *  @param {String} cookieVal - Contents to store
         *  @param {Number} exp - Expiration in days
         */
        #createCookie = (cookieKey, cookieVal, exp) => {
            var date = new Date();
            date.setTime(date.getTime() + (exp * 24 * 60 * 60 * 1000));
            // TODO: If we offer the developer the ability to manipulate the expiration date in the future, this part must be reworked
            var expires = "; expires=" + date.toGMTString();
            document.cookie = cookieKey + "=" + cookieVal + expires + "; path=/";
        }

        /**
         *  Storage function that acts as getter, can be used for fetching data from local storage or cookies
         *  @memberof Countly._internals
         *  @param {String} key - storage key
         *  @param {Boolean} useLocalStorage - if false, will fallback to cookie storage
         *  @param {Boolean} useRawKey - if true, raw key will be used without any prefix
         *  @returns {Varies} values stored for key
         */
        #getValueFromStorage = (key, useLocalStorage, useRawKey) => {
            // check if we should use storage at all. If in worker context but no storage is available, return early
            if (this.storage === "none" || (typeof this.storage !== "object" && !isBrowser)) {
                this.#log(logLevelEnums.DEBUG, "Storage is disabled. Value with key: [" + key + "] won't be retrieved");
                return;
            }

            // apply namespace or app_key
            if (!useRawKey) {
                key = this.app_key + "/" + key;
                if (this.namespace) {
                    key = stripTrailingSlash(this.namespace) + "/" + key;
                }
            }

            var data;
            // use dev provided storage if available
            if (typeof this.storage === "object" && typeof this.storage.getItem === "function") {
                data = this.storage.getItem(key);
                return key.endsWith("cly_id") ? data : this.deserialize(data);
            }

            // developer set values takes priority
            if (useLocalStorage === undefined) {
                useLocalStorage = this.#lsSupport;
            }

            // Get value
            if (useLocalStorage) { // Native support
                data = localStorage.getItem(key);
            }
            else if (this.storage !== "localstorage") { // Use cookie
                data = this.#readCookie(key);
            }

            // we return early without parsing if we are trying to get the device ID. This way we are keeping it as a string incase it was numerical.
            if (key.endsWith("cly_id")) {
                return data;
            }

            return this.deserialize(data);
        }

        /**
         *  Storage function that acts as setter, can be used for setting data into local storage or as cookies
         *  @memberof Countly._internals
         *  @param {String} key - storage key
         *  @param {Varies} value - value to set for key
         *  @param {Boolean} useLocalStorage - if false, will fallback to storing as cookies
         *  @param {Boolean} useRawKey - if true, raw key will be used without any prefix
        */
        #setValueInStorage = (key, value, useLocalStorage, useRawKey) => {
            // check if we should use storage options at all
            if (this.storage === "none" || (typeof this.storage !== "object" && !isBrowser)) {
                this.#log(logLevelEnums.DEBUG, "Storage is disabled. Value with key: " + key + " won't be stored");
                return;
            }

            // apply namespace
            if (!useRawKey) {
                key = this.app_key + "/" + key;
                if (this.namespace) {
                    key = stripTrailingSlash(this.namespace) + "/" + key;
                }
            }

            if (typeof value !== "undefined" && value !== null) {
                // use dev provided storage if available
                if (typeof this.storage === "object" && typeof this.storage.setItem === "function") {
                    this.storage.setItem(key, value);
                    return;
                }

                // developer set values takes priority
                if (useLocalStorage === undefined) {
                    useLocalStorage = this.#lsSupport;
                }

                value = this.serialize(value);
                // Set the store
                if (useLocalStorage) { // Native support
                    localStorage.setItem(key, value);
                }
                else if (this.storage !== "localstorage") { // Use Cookie
                    this.#createCookie(key, value, 30);
                }
            }
        }

        /**
         *  A function that can be used for removing data from local storage or cookies
         *  @memberof Countly._internals
         *  @param {String} key - storage key
         *  @param {Boolean} useLocalStorage - if false, will fallback to removing cookies
         *  @param {Boolean} useRawKey - if true, raw key will be used without any prefix
        */
        #removeValueFromStorage = (key, useLocalStorage, useRawKey) => {
            // check if we should use storage options at all
            if (this.storage === "none" || (typeof this.storage !== "object" && !isBrowser)) {
                this.#log(logLevelEnums.DEBUG, "Storage is disabled. Value with key: " + key + " won't be removed");
                return;
            }

            // apply namespace
            if (!useRawKey) {
                key = this.app_key + "/" + key;
                if (this.namespace) {
                    key = stripTrailingSlash(this.namespace) + "/" + key;
                }
            }

            // use dev provided storage if available
            if (typeof this.storage === "object" && typeof this.storage.removeItem === "function") {
                this.storage.removeItem(key);
                return;
            }

            // developer set values takes priority
            if (useLocalStorage === undefined) {
                useLocalStorage = this.#lsSupport;
            }

            if (useLocalStorage) { // Native support
                localStorage.removeItem(key);
            }
            else if (this.storage !== "localstorage") { // Use cookie
                this.#createCookie(key, "", -1);
            }
        }

        /**
         *  Migrate from old storage to new app_key prefixed storage
         */
        #migrate = () => {
            if (this.#getValueFromStorage(this.namespace + "cly_id", false, true)) {
                // old data exists, we should migrate it
                this.#setValueInStorage("cly_id", this.#getValueFromStorage(this.namespace + "cly_id", false, true));
                this.#setValueInStorage("cly_id_type", this.#getValueFromStorage(this.namespace + "cly_id_type", false, true));
                this.#setValueInStorage("cly_event", this.#getValueFromStorage(this.namespace + "cly_event", false, true));
                this.#setValueInStorage("cly_session", this.#getValueFromStorage(this.namespace + "cly_session", false, true));

                // filter out requests with correct app_key
                var requests = this.#getValueFromStorage(this.namespace + "cly_queue", false, true);
                if (Array.isArray(requests)) {
                    requests = requests.filter((req) => {
                        return req.app_key === this.app_key;
                    });
                    this.#setValueInStorage("cly_queue", requests);
                }
                if (this.#getValueFromStorage(this.namespace + "cly_cmp_id", false, true)) {
                    this.#setValueInStorage("cly_cmp_id", this.#getValueFromStorage(this.namespace + "cly_cmp_id", false, true));
                    this.#setValueInStorage("cly_cmp_uid", this.#getValueFromStorage(this.namespace + "cly_cmp_uid", false, true));
                }
                if (this.#getValueFromStorage(this.namespace + "cly_ignore", false, true)) {
                    this.#setValueInStorage("cly_ignore", this.#getValueFromStorage(this.namespace + "cly_ignore", false, true));
                }

                // now deleting old data, so we won't migrate again
                this.#removeValueFromStorage("cly_id", false, true);
                this.#removeValueFromStorage("cly_id_type", false, true);
                this.#removeValueFromStorage("cly_event", false, true);
                this.#removeValueFromStorage("cly_session", false, true);
                this.#removeValueFromStorage("cly_queue", false, true);
                this.#removeValueFromStorage("cly_cmp_id", false, true);
                this.#removeValueFromStorage("cly_cmp_uid", false, true);
                this.#removeValueFromStorage("cly_ignore", false, true);
            }
        }

        /**
         *  Apply modified storage changes
         *  @param {String} key - key of storage modified
         *  @param {Varies} newValue - new value for storage
         */
        #onStorageChange = (key, newValue) => {
            this.#log(logLevelEnums.DEBUG, "onStorageChange, Applying storage changes for key:", key);
            this.#log(logLevelEnums.DEBUG, "onStorageChange, Applying storage changes for value:", newValue);
            switch (key) {
                // queue of requests
                case "cly_queue":
                    this.#requestQueue = this.deserialize(newValue || "[]");
                    break;
                // queue of events
                case "cly_event":
                    this.#eventQueue = this.deserialize(newValue || "[]");
                    break;
                case "cly_remote_configs":
                    this.#remoteConfigs = this.deserialize(newValue || "{}");
                    break;
                case "cly_ignore":
                    this.ignore_visitor = this.deserialize(newValue);
                    break;
                case "cly_id":
                    this.device_id = newValue;
                    break;
                case "cly_id_type":
                    this.#deviceIdType = this.deserialize(newValue);
                    break;
                default:
                // do nothing
            }
        };

        /**
        *  Clear queued data for testing purposes
        *  @memberof Countly._internals
        */
        #clearQueue = () => {
            this.#requestQueue = [];
            this.#setValueInStorage("cly_queue", []);
            this.#eventQueue = [];
            this.#setValueInStorage("cly_event", []);
        };

        /**
         * For testing purposes only
         * @returns {Object} - returns the local queues
         */
        #getLocalQueues = () => {
            return {
                eventQ: this.#eventQueue,
                requestQ: this.#requestQueue
            };
        };

        /**
        * Expose internal methods to end user for usability
        * @namespace Countly._internals
        * @name Countly._internals
        */
        _internals = {
            store: this.#setValueInStorage,
            getDocWidth: getDocWidth,
            getDocHeight: getDocHeight,
            getViewportHeight: getViewportHeight,
            get_page_coord: get_page_coord,
            get_event_target: get_event_target,
            add_event_listener: add_event_listener,
            createNewObjectFromProperties: createNewObjectFromProperties,
            truncateObject: truncateObject,
            truncateSingleValue: truncateSingleValue,
            stripTrailingSlash: stripTrailingSlash,
            prepareParams: prepareParams,
            sendXmlHttpRequest: this.#sendXmlHttpRequest,
            isResponseValid: this.#isResponseValid,
            getInternalDeviceIdType: this.#getInternalDeviceIdType,
            getMsTimestamp: getMsTimestamp,
            getTimestamp: getTimestamp,
            isResponseValidBroad: this.#isResponseValidBroad,
            secureRandom: secureRandom,
            log: this.#log,
            checkIfLoggingIsOn: checkIfLoggingIsOn,
            getMetrics: this.#getMetrics,
            getUA: this.#getUA,
            prepareRequest: this.#prepareRequest,
            generateUUID: generateUUID,
            sendEventsForced: this.#sendEventsForced,
            isUUID: this.#isUUID,
            calculateChecksum: calculateChecksum,
            isReferrerUsable: this.#isReferrerUsable,
            getId: this.#getStoredIdOrGenerateId,
            heartBeat: this.#heartBeat,
            toRequestQueue: this.#toRequestQueue,
            reportViewDuration: this.#reportViewDuration,
            loadJS: loadJS,
            loadCSS: loadCSS,
            getLastView: this.#getLastView,
            setToken: this.#setToken,
            getToken: this.#getToken,
            showLoader: showLoader,
            hideLoader: hideLoader,
            setValueInStorage: this.#setValueInStorage,
            getValueFromStorage: this.#getValueFromStorage,
            removeValueFromStorage: this.#removeValueFromStorage,
            add_cly_events: this.#add_cly_events,
            processScrollView: this.#processScrollView,
            processScroll: this.#processScroll,
            currentUserAgentString: currentUserAgentString,
            currentUserAgentDataString: currentUserAgentDataString,
            userAgentDeviceDetection: userAgentDeviceDetection,
            userAgentSearchBotDetection: userAgentSearchBotDetection,
            getRequestQueue: this.#getRequestQueue,
            getEventQueue: this.#getEventQueue,
            sendFetchRequest: this.#sendFetchRequest,
            processAsyncQueue: this.#processAsyncQueue,
            makeNetworkRequest: this.#makeNetworkRequest,
            onStorageChange: this.#onStorageChange,
            clearQueue: this.#clearQueue,
            getLocalQueues: this.#getLocalQueues,
            testingGetRequests: this.#getGeneratedRequests,
        };

        /**
         * Health Check Interface:
         * {sendInstantHCRequest} Sends instant health check request
         * {resetAndSaveCounters} Resets and saves health check counters
         * {incrementErrorCount} Increments health check error count
         * {incrementWarningCount} Increments health check warning count
         * {resetCounters} Resets health check counters
         * {saveRequestCounters} Saves health check request counters
         */
        #HealthCheck = {
            sendInstantHCRequest: () => {
                if (this.#offlineMode) {
                    this.#log(logLevelEnums.DEBUG, "sendInstantHCRequest, Offline mode is active. Not sending health check request.");
                    this.#shouldSendHC = true;
                    return;
                }
                // truncate error message to 1000 characters
                var curbedMessage = truncateSingleValue(this.hcErrorMessage, 1000, "healthCheck", this.#log);
                // due to some server issues we pass empty string as is
                if (curbedMessage !== "") {
                    curbedMessage = JSON.stringify(curbedMessage);
                }
                // prepare hc object
                var hc = {
                    el: this.hcErrorCount,
                    wl: this.hcWarningCount,
                    sc: this.hcStatusCode,
                    em: curbedMessage
                };
                // prepare request
                var request = {
                    hc: JSON.stringify(hc),
                    metrics: JSON.stringify({ _app_version: this.app_version })
                };
                // add common request params
                this.#prepareRequest(request);
                // send request
                this.#makeNetworkRequest("[healthCheck]", this.url + this.#apiPath, request, (err) => {
                    // request maker already logs the error. No need to log it again here
                    if (!err) {
                        // reset and save health check counters if request was successful
                        this.#HealthCheck.resetAndSaveCounters();
                    }
                }, true);
            },
            resetAndSaveCounters: () => {
                this.#HealthCheck.resetCounters();
                this.#setValueInStorage(healthCheckCounterEnum.errorCount, this.hcErrorCount);
                this.#setValueInStorage(healthCheckCounterEnum.warningCount, this.hcWarningCount);
                this.#setValueInStorage(healthCheckCounterEnum.statusCode, this.hcStatusCode);
                this.#setValueInStorage(healthCheckCounterEnum.errorMessage, this.hcErrorMessage);
            },
            incrementErrorCount: () => { 
                this.hcErrorCount++;
            },
            incrementWarningCount: () => {
                this.hcWarningCount++;
            },
            resetCounters: () => {
                this.hcErrorCount = 0;
                this.hcWarningCount = 0;
                this.hcStatusCode = -1;
                this.hcErrorMessage = "";
            },
            saveRequestCounters: (status, responseText) => {
                this.hcStatusCode = status;
                this.hcErrorMessage = responseText;
                this.#setValueInStorage(healthCheckCounterEnum.statusCode, this.hcStatusCode);
                this.#setValueInStorage(healthCheckCounterEnum.errorMessage, this.hcErrorMessage);
            }
        };
}
export default CountlyClass;