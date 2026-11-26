// The SDK bundle as a module, for the web copy of loader.html: its loader imports countly-sdk-web, and this loads
// lib/countly.js the way a page does and gives the Countly it sets up
await new Promise(function (resolve, reject) {
    var script = document.createElement("script");
    script.src = "../../lib/countly.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
});

export default window.Countly;
