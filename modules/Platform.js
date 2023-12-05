const isBrowser = typeof window !== "undefined";
let Countly = isBrowser ? window.Countly || {} : {};
export { isBrowser, Countly };