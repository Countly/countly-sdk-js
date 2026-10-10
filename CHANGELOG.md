## NEXT RELEASE

* ! Minor Breaking Change ! When consent is required, Content now needs the new `content` consent. `enterContentZone` called before the consent is given takes effect once it is given, and removing the consent closes the content zone.
* ! Minor Breaking Change ! Event and segmentation filters of the server configuration now apply only to custom events.
* ! Minor Breaking Change ! Form tracking (`track_forms`) and form data collection (`collect_from_forms`) now leave out sensitive data:
  * password fields (also revealed ones), payment card fields, one-time code fields and card numbers are never read
  * fields named like secrets, bank or identity data are read only with the new `cly_form_allow` class in `track_forms`, or with a `cly_user_{key}` class in `collect_from_forms`
  * `track_forms` skips values shaped like a social security number unless the field has the `cly_form_allow` class
  * `collect_from_forms` reads hidden fields only with a `cly_user_{key}` class, and takes a phone number or an email only from a field holding one
  * the `cly_user_ignore` class now also works on an element containing fields
* ! Minor Breaking Change ! `change_id` without merge now starts a session for the new device ID only with `track_sessions`. With manual session calls, begin the new user's session yourself; it now always starts a new session instead of continuing the previous user's.

* Added `track_form_values` init option for turning off the field values in the events of `track_forms` (default `true`).
* Added web push notification support (requires a Countly server with web push support):
  * `push` consent feature for gating push notifications behind user consent
  * `enable_push_notifications` method for asking the visitor's permission and subscribing them to push notifications
  * `disable_push_notifications` method for unsubscribing the visitor from push notifications
  * `set_push_notification_listener` method and `push_notification_listener` init option for getting notified when a notification is received, clicked or closed
  * `record_push_action` method for recording a notification click manually
  * `push_vapid_public_key` init option for providing your application's VAPID public key
  * `push_service_worker_path` init option for providing the path of the service worker file (default `/countly_sw.js`)
  * `push_service_worker_scope` init option for registering the service worker under a different scope (default `countly-push/` next to the service worker file)
  * `push_service_worker_registration` init option for providing your own service worker registration that imports `countly_sw.js`
  * `push_auto_register` init option for turning off the automatic push registration on page load (default `true`)
  * `push_subscribe_timeout` init option for setting how long `enable_push_notifications` waits for the browser, in milliseconds (default `30000`)
  * `countly_sw.js` service worker (`lib/countly_sw.js`), to be served from your site's root or imported into your own service worker
* Added support for server initiated connection tests. When the server asks for one, the SDK probes the endpoints it depends on and reports which of them are reachable.
* Added support for server requested SDK log gathering. When it is requested for a device, the SDK gathers its own internal log lines and uploads them in batches.

* Mitigated an issue where a log line carrying an object that could not be serialized would throw while `debug` was enabled.
* Mitigated an issue where withdrawing a consent was not reported to the server.
* Mitigated an issue where content could open links that run code, such as `javascript:` links, and the opened page could control the page that opened it.
* Mitigated an issue where content on iPhones and iPads was laid out for a screen two to three times its size.
* Mitigated an issue where adding a breadcrumb froze the page when the server configuration set the breadcrumb limit to 0.
* Mitigated an issue where a `device_id` given as `null` or an empty string left the SDK without a device ID, so nothing was sent.
* Mitigated an issue where a device ID (`cly_device_id`) or UTM tag given in the page URL was not percent-decoded, so `john%40mail.com` was recorded instead of `john@mail.com`.
* Mitigated an issue where a call in the `Countly.q` queue that threw an error stopped the SDK for the rest of the page.
* Mitigated an issue where the deprecated `show_feedback_popup` method threw an error instead of showing the widget.
* Mitigated an issue where sending did not resume on the same page after networking was switched back on in the server configuration.
* Mitigated an issue where a request that could not be made, for example because of an invalid custom header, stopped all sending for the rest of the page without an error.
* Mitigated an issue where unsent requests were lost on every page change with cookie storage.
* Mitigated an issue where an event value containing `;` could break event recording on the next page with cookie storage.
* Mitigated an issue where an NPS score of 0 reported with `reportFeedbackWidgetManually` was dropped.
* Mitigated an issue where feedback widgets got a device ID, app version or segmentation holding characters such as `+`, `&` or `#` altered, so answers could be stored for another user.
* Mitigated an issue where a profile picture uploaded for a device ID holding special characters was stored on a separate user.
* Mitigated an issue where `uploadUserProfilePicture` uploaded the picture without the `users` consent when consent was required.
* Mitigated an issue where a callback, such as the one of `get_available_feedback_widgets`, could be called twice when its request timed out.
* Mitigated an issue where the remote config callback was not called when fetching failed. It now gets an error and the stored values.
* Mitigated an issue where requests recorded while the SDK used a temporary device ID were sent with that temporary ID when a later page started with a real device ID.
* Mitigated an issue where the saved server configuration was read and written outside the given `namespace` and storage, and was stored even with `storage: "none"`.
* Mitigated an issue where time the page spent in the background was counted in the session when the page was closed in the background.
* Mitigated an issue where a view that started while the page was in the background was given the duration of the previous view.
* Mitigated an issue where leaving the content zone during its first seconds or right after a refresh was undone shortly after.
* Mitigated an issue where `exitContentZone` left the content on screen.
* Mitigated an issue where content messages were handled once for every content shown before on the page, so a click could open a link or record an event several times.
* Mitigated an issue where journey content could stop being requested for the rest of the page after a journey event was sent by the regular sending.
* Mitigated an issue where a call queued in `Countly.q` for the main instance could run on another instance, when that instance worked through the queue first, for example during its `user_details` call.
* Mitigated an issue where a visitor ignored at init (`ignore_visitor` or a detected bot) still sent the health check, remote config and feedback widget requests with "undefined" as the device ID, which created such a user on the server. Their callbacks now get an error.
* Mitigated an issue where `set_id` merged a device ID given in the page URL (`cly_device_id`) into the new one, instead of changing it without merge as for any device ID set by the developer.
* Mitigated an issue where user profile changes not saved yet when `change_id` was called without merge, such as those made with `userData.set`, were saved for the new device ID instead of the previous one.
* Mitigated an issue where `change_id` without merge kept the content zone entered and the previous user's content on screen.
* Mitigated an issue where a content message carrying a single event instead of a list threw an error, so the event was not recorded.
* Mitigated an issue where the SDK behavior settings were not fetched again after a device ID change, so the settings for the new device ID applied only from the next page.
* Mitigated an issue where, after `change_id` with merge, remote config could be fetched before the merge request was sent, returning the values of a new, empty user.
* Mitigated an issue where, with `storage: "cookie"`, the health check did not report the errors and warnings counted on earlier pages.
* Mitigated an issue where feedback widget links carried "undefined" as the platform when the SDK did not know it.

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
