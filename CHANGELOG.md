## NEXT RELEASE

* Added `disable_health_check` init option for turning off the health check request the SDK sends when it starts (default `false`).
* Added support for the drop old request time (`dort`) SDK behavior setting: queued requests older than the set number of hours are dropped instead of sent.

* Mitigated an issue where importing the SDK as an ES module (Vite 8 and other `"type": "module"` projects, Node.js, jsDelivr's `+esm`) or with `require()` gave a wrapper object instead of the SDK, so `Countly.init` was undefined. `Countly.default` keeps working.
* Mitigated an issue where an event or user property holding a value JSON cannot encode, such as a `BigInt` or an object that refers back to itself (a React click event holds the window), stopped sending for the rest of the page. A `BigInt` is now sent as a string, other such values are left out.
* Mitigated an issue where, with `require_consent`, `Countly.init` threw an error in browsers that refuse access to storage, as when the visitor blocks cookies.
* Mitigated an issue where every session started again on the same page, after a device ID change without merge or an expired session, made one window resize or screen rotation record one more orientation event.
* Mitigated an issue where calls pushed into `Countly.q` through a reference kept from before the SDK started, as Google Tag Manager's `createQueue` gives, were never run.
* Mitigated an issue where the health check counted errors and warnings only with `debug` on, and lost the ones logged on pages without automatic sessions. Its counters now restart when it is sent, even if it fails, and the legacy remote config API note is an info line, so it is not counted.
* Mitigated an issue where the back-off request age setting (`bom_ra`) never applied, so requests older than it still paused sending while the server was slow.
* Mitigated an issue where building a site with Parcel required the `buffer` package.
* Mitigated an issue where the health check reported the status code and response of a failed request only for queued requests such as events, not for others such as the health check, server configuration, remote config or feedback widget requests. A request that got no HTTP answer is not recorded.

## 26.8.0

* ! Minor Breaking Change ! Form tracking (`track_forms`) and form data collection (`collect_from_forms`) now leave out sensitive data:
  * password fields (also ones revealed as text), fields whose `autocomplete` marks a payment card or one-time code, and card numbers are never recorded
  * fields named or labelled like secrets, payment card, bank or identity data are read only with the new `cly_form_allow` class in `track_forms`, or with a `cly_user_{key}` class in `collect_from_forms`
  * `track_forms` skips values shaped like a social security number unless the field has the `cly_form_allow` class
  * `collect_from_forms` reads hidden fields only with a `cly_user_{key}` class, takes an email or phone number only from a field holding one, and no longer takes a field named like `number` as the phone (use the `cly_user_phone` class)
  * the `cly_user_ignore` class now also works on an element containing fields
* ! Minor Breaking Change ! Added `content` consent for content zone. When consent is required, content now needs the new `content` consent; the content zone waits until it is given.
* ! Minor Breaking Change ! `change_id` and `set_id` without merge now start a session for the new device ID only with `track_sessions`; with manual session calls, call `begin_session` for the new user yourself.
* ! Minor Breaking Change ! While a page is open and sending works, its unsent events and requests are now kept in the tab's sessionStorage instead of localStorage (events instead of a cookie with `storage: "cookie"`). Requests that cannot be sent for now, such as in offline mode, and those of a page being left still wait in localStorage. This does not apply with `storage: "none"` or a custom storage object.

* Added `track_form_values` init option for turning off the field values in the events of `track_forms` (default `true`).
* Added web push notification support (requires a Countly server with web push support):
  * `push` consent feature for gating push notifications behind user consent
  * `enable_push_notifications` method for asking the visitor's permission and subscribing them to push notifications
  * `disable_push_notifications` method for unsubscribing the visitor from push notifications
  * `set_push_notification_listener` method and `push_notification_listener` init option for getting notified when a notification is received, clicked or closed
  * `record_push_action` method for recording a notification click manually
  * `push_vapid_public_key` init option for providing your application's VAPID public key (required)
  * `push_service_worker_path` init option for providing the path of the service worker file (default `/countly_sw.js`)
  * `push_service_worker_scope` init option for registering the service worker under a different scope (default `countly-push/` next to the service worker file)
  * `push_service_worker_registration` init option for providing your own service worker registration that imports `countly_sw.js`, or the promise `register()` returns for it
  * `push_auto_register` init option for turning off the silent registration of visitors who already allowed notifications (default `true`)
  * `push_subscribe_timeout` init option for setting how long `enable_push_notifications` waits for the browser, in milliseconds (default `30000`)
  * `countly_sw.js` service worker file, to be served from your site or imported into your own service worker
  * `opt_out` also unsubscribes the visitor from push notifications; after `opt_in`, call `enable_push_notifications` to subscribe them again
* Added support for server-initiated connection tests, which report which Countly endpoints the browser can reach (requires a Countly server with connection test support).
* Added support for server-requested SDK log gathering, which uploads the SDK's own log lines for the devices the server asks for (requires a Countly server with SDK log gathering support).
* Added `content.setGlobalContentSegmentation` method and `global_content_segmentation` init option for adding a segmentation to every content and feedback widget event, apart from the rating popups of `presentRatingWidgetWithID`, `initializeRatingWidgets` and `enableRatingWidgets`. Keys the server reads on these events, such as `rating`, `closed` or `campaign_id`, are left out.
* Added passing the site's light or dark theme (the `color-scheme` the page declares, otherwise the visitor's browser setting) to content and feedback widgets; content uses it when dark mode is enabled for it in the content builder:
  * `content.setTheme` method and `content_theme` init option for setting the theme instead: `"dark"`, `"light"`, `false` for none, or `null` to follow the site (default `null`)
* Added TypeScript definitions for `attempt_to_send_stored_requests`, `check_any_consent`, `opt_in`, `opt_out`, `recordError`, `recordRatingWidgetWithID` and `track_view`.

* Mitigated an issue where content could open links that run code on the site, such as `javascript:` links, and a page opened from content could redirect the site's tab. Content now opens only web, relative, contact (such as `mailto:` or `tel:`) and `scheme://` app links.
* Mitigated an issue where, with `debug` enabled, methods such as `add_event` or `user_details` threw an error when given an object that cannot be turned into JSON.
* Mitigated an issue where the deprecated `show_feedback_popup` method threw an error instead of showing the widget.
* Mitigated an issue where withdrawing a consent with `remove_consent` was not reported to the server until another consent was given.
* Mitigated an issue where event and segmentation filters of the server configuration could effect the internal events.
* Mitigated an issue where content and feedback widgets on iPhones and iPads were laid out for a screen two to three times its size.
* Mitigated an issue where `add_log` froze the page when the breadcrumb limit (`max_breadcrumb_count` or the server configuration) was 0.
* Mitigated an issue where a `device_id` given as `null` or an empty string left the SDK without a device ID, so nothing was sent.
* Mitigated an issue where a device ID (`cly_device_id`), campaign or UTM value given in the page URL was not percent-decoded or was cut at an `=`, so for example `john%40mail.com` was recorded instead of `john@mail.com`.
* Mitigated an issue where a call in the `Countly.q` queue that threw an error stopped the SDK for the rest of the page.
* Mitigated an issue where sending did not resume on the same page after networking was switched back on in the server configuration.
* Mitigated an issue where a request that could not be made, for example because of an invalid custom header, was never treated as failed, so the callbacks waiting for it were not called and queued requests were not tried again for the rest of the page.
* Mitigated an issue where, with `storage: "cookie"`, unsent requests were lost on every page change.
* Mitigated an issue where, with `storage: "cookie"`, an event key or segmentation value containing `;` could break event recording on the next page.
* Mitigated an issue where an NPS score of 0 reported with `reportFeedbackWidgetManually` was dropped.
* Mitigated an issue where a device ID, app version or segmentation holding characters such as `+`, `&` or `#` reached feedback widgets altered, so answers could be stored for another user.
* Mitigated an issue where `uploadUserProfilePicture` stored the picture for a different user when the device ID held characters such as `@`.
* Mitigated an issue where `uploadUserProfilePicture` uploaded the picture without the `users` consent when consent was required.
* Mitigated an issue where a callback, such as the one of `get_available_feedback_widgets`, could be called twice when its request timed out.
* Mitigated an issue where the remote config callback was not called when fetching failed. It now gets an error and the stored values.
* Mitigated an issue where requests recorded in offline mode were sent with the temporary device ID instead of the real one when a later page, in the same tab or another one, started with a real device ID.
* Mitigated an issue where, with `namespace`, `storage: "cookie"` or a custom `storage` object, the server configuration saved on an earlier page was not applied when the next page started, and with `storage: "none"` it was still saved in localStorage.
* Mitigated an issue where, with `track_sessions`, time the page spent in the background, out of focus or inactive was counted in the session when the page was closed in that state.
* Mitigated an issue where, with `track_sessions`, a view that started while the page was in the background was credited with the previous view's duration.
* Mitigated an issue where `exitContentZone` called in the first seconds after init or right after `refreshContentZone` was undone shortly after.
* Mitigated an issue where `exitContentZone` left the content on screen, or content that arrived after it was still shown. Content, journey content included, now waits for the next `enterContentZone`.
* Mitigated an issue where content messages were handled once for every content shown before on the page, so a click could open a link or record an event several times.
* Mitigated an issue where journey content could stop being requested for the rest of the page after a journey event was sent with the regular event requests.
* Mitigated an issue where a call queued in `Countly.q` for the main instance could run on another instance, for example during that instance's `user_details` call.
* Mitigated an issue where a visitor ignored at init (`ignore_visitor`, an earlier `opt_out` or a detected bot) still sent the health check and remote config, feedback widget or content requests with "undefined" as the device ID, which created such a user on the server. Their callbacks now get an error.
* Mitigated an issue where `set_id` merged a device ID given in the page URL (`cly_device_id`) into the new one, instead of changing it without merge as for any device ID set by the developer.
* Mitigated an issue where, when no session was running, user profile changes not saved yet at a `change_id` without merge, such as those made with `userData.set`, were saved for the new device ID instead of the previous one.
* Mitigated an issue where `change_id` without merge kept the content zone entered and the previous user's content on screen. Call `content.enterContentZone` again to show content to the new user.
* Mitigated an issue where `change_id` without merge sent the duration of the page's last view for the new device ID instead of the previous one.
* Mitigated an issue where a content message carrying a single event instead of a list threw an error, so the event was not recorded.
* Mitigated an issue where, after a device ID change with merge, the health check and the server configuration, remote config, A/B testing, feedback widget and content requests could reach the server under the new device ID before the merge request. The server then combined two users instead of moving the history to the new device ID, which lost some profile totals, and remote config could return the values of a new, empty user.
* Mitigated an issue where, with `storage: "cookie"`, the health check did not report the errors, warnings and failed requests counted on earlier pages.
* Mitigated an issue where, with `storage: "cookie"`, the site's other open tabs kept using the previous device ID after a device ID change until they were reloaded.
* Mitigated an issue where, with several tabs of a site open, events and other requests could be sent more than once or lost.
* Mitigated an issue where, with several tabs of a site open, events one tab recorded right before a device ID change without merge or a profile change in another tab could be sent for the new device ID or stored with the new profile.
* Mitigated an issue where namespaces sharing an app key took over each other's device ID and queued data while open in several tabs.
* Mitigated an issue where, on a page using the quick async loader, calling methods such as `add_consent`, `opt_out` or `track_view` before the SDK loaded threw an error. Replace the loader snippet on your pages to get the fix.

## 26.1.3

* Added support for Feedback Widgets and Content working with certain proxy configurations.

## 26.1.2

* Delayed remote config refresh after merged device ID changes to reduce request ordering races.

## 26.1.1

* Improved device metric detection capabilities.

## 26.1.0

* Added support for SBS flags:
  * Event whitelisting / blacklisting
  * Segmentation whitelisting / blacklisting (global and per-event)
  * User property whitelisting / blacklisting
  * Journey trigger events
* Added support for Feedback Widget resizing logic (will need server update to benefit.)

* Improved testing consistency of queuing system
* Mitigated an issue where an unintended URL was opened when closing a feedback widget after a content block was closed.

## 25.4.4

* Improved user property recording order with respect to sessions and events.

## 25.4.3

* Added filtering capability to `content` interface through `enterContentZone(contentFilterCallback)`.

## 25.4.2

* Mitigated an issue where manual feedback reporting could have failed
* Mitigated a possible issue with request timeouts in IE11
* Non window contexts also now uses POST requests by default
* Added a new method `uploadUserProfilePicture` for uploading user profile images to server

## 25.4.1

* Added automatic backoff mechanism which delays sending requests if server seems busy
* Added `disable_sdk_behavior_settings_updates` init method for disabling Server Configuration sync requests
* Added `disable_backoff_mechanism` init method for disabling backoff mechanism
* Added timezone support for server

## 25.4.0

* ! Minor Breaking Change ! SDK now has Server Configuration feature and it is enabled by default. Changes made on SDK Manager > SDK Configuration on your server will affect SDK behavior directly.

* Mitigated an issue about orientation detection in Safari

* Improved init time Content Zone logic
* Improved error handler to include script loading issues
* Improved the wrapper of Feedback Widgets

* Added `refreshContentZone` method to Content interface for refreshing Content Zone requests
* Added `behavior_settings` init time method for providing server configuration during first initialization
* Added `content_whitelist` init time method that lets you whitelist your other domains for displaying Content

* `max_logs` config option value will not be used anymore (use `max_breadcrumb_count` instead)

## 25.1.0

* Mitigated an issue where content resizing did not work in certain orientations.
* Reduced log verbosity.
* Improved orientation reporting precision.
* Added a new init time config option for filtering crashes:
  * `crash_filter_callback`

## 24.11.4

* Mitigated an issue where `content` and `feedback` interfaces would not work with async multi instances.

## 24.11.3

* Added support for content resizing (Experimental!)
* Mitigated an issue where device ID type was assigned wrongly when SDK was generating an ID after stored device ID was cleared.
* Mitigated an issue where device ID type of initially generated requests were not correctly reassigned after offline mode.

## 24.11.2

* Added a new init method to set the interval of Content Zone's timer (Experimental!):
  * `content_zone_timer_interval` to set the timer interval in `seconds`
* Mitigated an issue about Content's positioning (Experimental!)

## 24.11.1

* Deprecated `initializeRatingWidgets` method, use `feedback.showRating` instead.
* Deprecated `enableRatingWidgets` method, use `feedback.showRating` instead.
* Added an interface `content` for Content feature methods:
  * `enterContentZone`, to start Content checks (Experimental!)
  * `exitContentZone`, to stop Content checks (Experimental!)

## 24.11.0

* Mitigated an issue where SDK could try to send old stored offline mode data during init if `clear_stored_id` was true
* Mitigated an issue where the SDK could stayed on offline mode after the first init with `offline_mode` set to true
* Mitigated an issue where old Rating widget stickers were not cleared when a new one was presented

* Improved view tracking logic
* Default request method is now set to "POST"
* Healtchecks won't be sent in offline mode anymore
* Added a new interface 'feedback' which includes convenience methods to show feedback widgets:
  * showNPS([String nameIDorTag]) - for displaying the first available NPS widget or one with the given name, Tag or ID value
  * showSurvey([String nameIDorTag]) - for displaying the first available Survey widget or one with the given name, Tag or ID value
  * showRating([String nameIDorTag]) - for displaying the first available Rating widget or one with the given name, Tag or ID value

## 24.4.1

* Added a new method `set_id(newDeviceId)` for managing device id changes according to the device ID Type.

## 24.4.0

! Minor breaking change ! For implementations using `salt` the browser compatibility is tied to SubtleCrypto's `digest` method support

* Added the `salt` init config flag to add checksums to requests (for secure contexts only)
* Added support for Feedback Widgets' terms and conditions

## 23.12.6

* Mitigated an issue where error tracking could prevent SDK initialization in async mode

## 23.12.5

* Mitigated an issue where the SDK was not emptying the async queue explicity when closing a browser

## 23.12.4

* Enhanced userAgentData detection for bot filtering

## 23.12.3

* Added bot detection for workers
* Added the ability to clear stored device IDs in the workers
* Mitigated an issue where utm naming could have been affected if 'searchQuery' did not return '?'

## 23.12.2

* Added Google Lighthouse to bot detection

## 23.12.1

* Added methods for bridged SDK usage

## 23.12.0

* Modularized the Web SDK
