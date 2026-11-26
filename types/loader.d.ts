/// <reference path="./countly-sdk-web.d.ts" />
import Countly from "countly-sdk-web";

/**
 * The SDK's functions, before the SDK itself loads: calls wait as they do before init, and init loads the SDK, which
 * then takes this object over. Lets a page leave the SDK out of its first download.
 */
export default Countly;
