import Countly from "../Countly.js";

const STORAGE = {};
Countly.init({
    app_key: "YOUR_APP_KEY",
    url: "https://your.domain.count.ly",
    debug: true,
    storage: {
        getItem: (key) => {
            return STORAGE[key];
        },
        setItem: (key, value) => {
            STORAGE[key] = value;
        },
        removeItem: (key) => {
            delete STORAGE[key];
        }
    }
});

onmessage = function (e) {
    console.log(`Worker: Message received from main script:[${JSON.stringify(e.data)}]`);
    const data = e.data.data; const type = e.data.type;
    if (type === "event") {
        Countly.add_event(data);
    } else if (type === "view") {
        Countly.track_pageview(data);
    } else if (type === "session") {
        if (data === "begin_session") {
            Countly.begin_session();
            return;
        }
        Countly.end_session(null, true);   
    }
}