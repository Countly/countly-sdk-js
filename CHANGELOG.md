## XX.XX.XX

* Added web push notification support. Give the SDK the new `push` consent and call `enable_push_notifications` once from a user gesture, passing the VAPID public key from your application settings; from then on it keeps the subscription token in sync and records notification clicks on its own. `disable_push_notifications` is remembered across page loads, so the automatic registration never undoes it; only another explicit `enable_push_notifications` subscribes again.

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
