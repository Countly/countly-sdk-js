
// Feature ENUMS
var featureEnums = {
    SESSIONS: "sessions",
    EVENTS: "events",
    VIEWS: "views",
    SCROLLS: "scrolls",
    CLICKS: "clicks",
    FORMS: "forms",
    CRASHES: "crashes",
    ATTRIBUTION: "attribution",
    USERS: "users",
    STAR_RATING: "star-rating",
    LOCATION: "location",
    APM: "apm",
    FEEDBACK: "feedback",
    REMOTE_CONFIG: "remote-config",
};

/**
 * At the current moment there are following internal events and their respective required consent:
    [CLY]_nps - "feedback" consent
    [CLY]_survey - "feedback" consent
    [CLY]_star_rating - "star_rating" consent
    [CLY]_view - "views" consent
    [CLY]_orientation - "users" consent
    [CLY]_push_action - "push" consent
    [CLY]_action - "clicks" or "scroll" consent
 */
var internalEventKeyEnums = {
    NPS: "[CLY]_nps",
    SURVEY: "[CLY]_survey",
    STAR_RATING: "[CLY]_star_rating",
    VIEW: "[CLY]_view",
    ORIENTATION: "[CLY]_orientation",
    ACTION: "[CLY]_action",
};

var internalEventKeyEnumsArray = Object.values(internalEventKeyEnums);
/**
 * 
 *log level Enums:
 *Error - this is a issues that needs attention right now.
 *Warning - this is something that is potentially a issue. Maybe a deprecated usage of something, maybe consent is enabled but consent is not given.
 *Info - All publicly exposed functions should log a call at this level to indicate that they were called. These calls should include the function name.
 *Debug - this should contain logs from the internal workings of the SDK and it's important calls. This should include things like the SDK configuration options, success or fail of the current network request, "request queue is full" and the oldest request get's dropped, etc.
 *Verbose - this should give a even deeper look into the SDK's inner working and should contain things that are more noisy and happen often.
 */
var logLevelEnums = {
    ERROR: "[ERROR] ",
    WARNING: "[WARNING] ",
    INFO: "[INFO] ",
    DEBUG: "[DEBUG] ",
    VERBOSE: "[VERBOSE] ",
};
/**
 * 
 *device ID type:
 *0 - device ID was set by the developer during init
 *1 - device ID was auto generated by Countly
 *2 - device ID was temporarily given by Countly
 *3 - device ID was provided from location.search
 */
var DeviceIdTypeInternalEnums = {
    DEVELOPER_SUPPLIED: 0,
    SDK_GENERATED: 1,
    TEMPORARY_ID: 2,
    URL_PROVIDED: 3,
};
/**
 * to be used as a default value for certain configuration key values
 */
var configurationDefaultValues = {
    BEAT_INTERVAL: 500,
    QUEUE_SIZE: 1000,
    FAIL_TIMEOUT_AMOUNT: 60,
    INACTIVITY_TIME: 20,
    SESSION_UPDATE: 60,
    MAX_EVENT_BATCH: 100,
    SESSION_COOKIE_TIMEOUT: 30,
    MAX_KEY_LENGTH: 128,
    MAX_VALUE_SIZE: 256,
    MAX_SEGMENTATION_VALUES: 100,
    MAX_BREADCRUMB_COUNT: 100,
    MAX_STACKTRACE_LINES_PER_THREAD: 30,
    MAX_STACKTRACE_LINE_LENGTH: 200,
};

/**
 * BoomerangJS and countly
 */
var CDN = {
    BOOMERANG_SRC: "https://cdn.jsdelivr.net/npm/countly-sdk-web@latest/plugin/boomerang/boomerang.min.js",
    CLY_BOOMERANG_SRC: "https://cdn.jsdelivr.net/npm/countly-sdk-web@latest/plugin/boomerang/countly_boomerang.js",
};

/**
 * Health check counters' local storage keys
 */
var healthCheckCounterEnum = Object.freeze({
    errorCount: "cly_hc_error_count",
    warningCount: "cly_hc_warning_count",
    statusCode: "cly_hc_status_code",
    errorMessage: "cly_hc_error_message",
});

var SDK_VERSION = "23.12.3";
var SDK_NAME = "javascript_native_web";

// Using this on document.referrer would return an array with 15 elements in it. The 12th element (array[11]) would be the path we are looking for. Others would be things like password and such (use https://regex101.com/ to check more)
var urlParseRE = /^(((([^:\/#\?]+:)?(?:(\/\/)((?:(([^:@\/#\?]+)(?:\:([^:@\/#\?]+))?)@)?(([^:\/#\?\]\[]+|\[[^\/\]@#?]+\])(?:\:([0-9]+))?))?)?)?((\/?(?:[^\/\?#]+\/+)*)([^\?#]*)))?(\?[^#]+)?)(#.*)?/;

export { CDN, DeviceIdTypeInternalEnums, SDK_NAME, SDK_VERSION, configurationDefaultValues, featureEnums, healthCheckCounterEnum, internalEventKeyEnums, internalEventKeyEnumsArray, logLevelEnums, urlParseRE };