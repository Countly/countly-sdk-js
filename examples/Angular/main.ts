import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

import Countly from 'countly-sdk-web';

window.Countly = Countly;

const COUNTLY_SERVER_KEY = "https://your.server.ly";
const COUNTLY_APP_KEY = "YOUR_APP_KEY";

if(COUNTLY_APP_KEY === "YOUR_APP_KEY" || COUNTLY_SERVER_KEY === "https://your.server.ly"){
  console.warn("Please do not use default set of app key and server url")
}
// initializing countly with params
Countly.init({
  app_key: COUNTLY_APP_KEY,
  url: COUNTLY_SERVER_KEY, //your server goes here
  debug: true
});
Countly.track_sessions();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

