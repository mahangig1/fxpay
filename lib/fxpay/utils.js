/**
 * Utils module.
 * @module utils
 */

define([
  'exports',
  'errors',
  'settings'
], function(exports, errors, settings) {

  'use strict';

 /**
  * Populates an object with defaults if the key is not yet defined.
  * Similar to _.defaults except this takes only a single defaults object.
  * @param {object} object - the object to populate defaults on
  * @param {object} defaults - the defaults to use
  * @returns {object}
  */
  exports.defaults = function(object, defaults) {
    object = object || {};
    Object.keys(defaults).forEach(function(key) {
      if (typeof object[key] === 'undefined') {
        object[key] = defaults[key];
      }
    });
    return object;
  };

 /**
  * Gets the app origin
  * @returns {string}
  */
  exports.getSelfOrigin = function(settingsObj) {
    settingsObj = settingsObj || settings;

    if (settingsObj.appSelf) {
      // Check the manifest-declared origin (not the auto-generated one).
      var hasDeclaredOrigin = !!settingsObj.appSelf.manifest.origin;

      if (settingsObj.appSelf.manifest.type === 'web' || !hasDeclaredOrigin) {
        // This package does not have a reliable origin so
        // here we look for its marketplace hosted package URL
        // to derive a marketplace-specific origin.
        var pat = new RegExp(
          '^https?://(?:marketplace|mp\\.dev).*/app/([^/]+)/manifest\\.webapp$'
        );
        var match = pat.exec(settingsObj.appSelf.manifestURL);
        if (!match) {
          throw new errors.InvalidAppOrigin(
            'Cannot derive marketplace GUID from "' +
            settingsObj.appSelf.manifestURL +
            '". The package must be installed from the Firefox Marketplace ' +
            'or define an origin. For local testing, use fake products.'
          );
        }
        // Create an origin out of the marketplace GUID.
        var marketplaceOrigin = 'marketplace:' + match[1];
        settingsObj.log.info('derived marketplace origin as', marketplaceOrigin,
                             'from URL', settingsObj.appSelf.manifestURL);
        return marketplaceOrigin;
      }

      // Trust the declared origin from a privileged/certified app.
      return settingsObj.appSelf.origin;

    } else {
      // Get the origin from a non-app website.
      var win = settingsObj.window;
      if (win.location.origin) {
        return win.location.origin;
      } else {
        return win.location.protocol + '//' + win.location.hostname;
      }
    }
  };

 /**
  * Gets the the origin of the URL provided.
  * @param {string} url - the URL to introspect the origin from
  * @returns {string}
  */
  exports.getUrlOrigin = function(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.origin || (a.protocol + '//' + a.host);
  };

 /**
  * Gets the center coordinates for a passed width and height.
  * Uses centering calcs that work on multiple monitors (bug 1122683).
  * @param {number} w - width
  * @param {number} h - height
  * @returns {list}
  */
  exports.getCenteredCoordinates = function(w, h) {
    var x = window.screenX +
      Math.max(0, Math.floor((window.innerWidth - w) / 2));
    var y = window.screenY +
      Math.max(0, Math.floor((window.innerHeight - h) / 2));
    return [x, y];
  };

 /**
  * Re-center an existing window.
  * @param {object} winRef - A reference to an existing window
  * @param {number} [w] - width
  * @param {number} [h] - height
  * @returns {undefined}
  */
  exports.reCenterWindow = function(winRef, w, h) {
    w = w || settings.winWidth;
    h = h || settings.winHeight;
    var xy = exports.getCenteredCoordinates(w, h);
    try {
      // Allow for the chrome as resizeTo args are the external
      // window dimensions not the internal ones.
      w = w + (winRef.outerWidth - winRef.innerWidth);
      h = h + (winRef.outerHeight - winRef.innerHeight);
      settings.log.log('width: ', w, 'height:', h);
      winRef.resizeTo(w, h);
      winRef.moveTo(xy[0], xy[1]);
    } catch(e) {
      settings.log.log("We don't have permission to resize this window");
    }
  };

 /**
  * Open a window
  * @param {object} [options] - the settings object
  * @param {string} [options.url] - the window url
  * @param {string} [options.title] - the window title
  * @param {number} [options.w] - the window width
  * @param {number} [options.h] - the window height
  * @returns {object} windowRef - a window reference.
  */
  exports.openWindow = function(options) {
    var defaults = {
      url: '',
      title: 'FxPay',
      w: settings.winWidth,
      h: settings.winHeight,
    };

    options = exports.defaults(options, defaults);
    var xy = exports.getCenteredCoordinates(options.w, options.h);

    var winOptString = 'toolbar=no,location=yes,directories=no,' +
      'menubar=no,scrollbars=yes,resizable=no,copyhistory=no,' +
      'width=' + options.w + ',height=' + options.h +
      ',top=' + xy[1] + ',left=' + xy[0];

    var windowRef = settings.window.open(options.url, options.title,
                                         winOptString);
    if (!windowRef) {
      settings.log.error('window.open() failed. URL:', options.url);
    }
    return windowRef;
  };

 /**
  * Get the App object returned from [`mozApps.getSelf()`](http://goo.gl/x4BDqs)
  * @param {module:utils~getAppSelfCallback} callback - the callback function.
  * @returns {undefined}
  */
  exports.getAppSelf = function getAppSelf(callback) {
    function storeAppSelf(appSelf) {
      if (appSelf === null) {
        throw new Error('cannot store a null appSelf');
      }
      settings.appSelf = appSelf;
      return appSelf;
    }

    if (settings.appSelf !== null) {
      // This means getAppSelf() has already run successfully so let's
      // return the value immediately.
      return callback(null, settings.appSelf);
    }

    if (!settings.mozApps) {
      settings.log.info(
          'web platform does not define mozApps, cannot get appSelf');
      return callback(null, storeAppSelf(false));
    }
    var appRequest = settings.mozApps.getSelf();

    appRequest.onsuccess = function() {
      var appSelf = this.result;
      // In the case where we're in a Firefox that supports mozApps but
      // we're not running as an app, this could be falsey.
      settings.log.info('got appSelf from mozApps.getSelf():', appSelf);
      callback(null, storeAppSelf(appSelf || false));
    };

    appRequest.onerror = function() {
      var errCode = this.error.name;
      settings.log.error('mozApps.getSelf() returned an error', errCode);
      // We're not caching an appSelf result here.
      // This allows nested functions to report errors better.
      callback(errors.InvalidApp('invalid application: ' + errCode,
                                 {code: errCode}), settings.appSelf);
    };
  };

 /**
  * The callback called by {@link module:utils.getAppSelf }
  * @callback module:utils~getAppSelfCallback
  * @param {object} error - an error object. Will be null if no error.
  * @param {object} appSelf - the [appSelf object](http://goo.gl/HilsmA)
  */


 /**
  * Log a deprecation message with some extra info.
  * @param {string} msg - log message
  * @param {string} versionDeprecated - the version when deprecated
  * @returns {undefined}
  */
  exports.logDeprecation = function(msg, versionDeprecated) {
    settings.log.warn(
        msg + '. This was deprecated in ' + versionDeprecated + '. ' +
        'More info: https://github.com/mozilla/fxpay/releases/tag/' +
        versionDeprecated);
  };

 /**
  * Take an object of key value pairs and serialize it into a url-encoded
  * query string.
  * @example
  * // returns foo=bar&baz=zup
  * utils.serialize({"foo": "bar", "baz": "zup"});
  * @param {object} obj - object to serialize
  * @returns {string}
  */
  exports.serialize = function serialize(obj) {
    var str = [];
    for (var p in obj){
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    }
    return str.join("&");
  };

});
