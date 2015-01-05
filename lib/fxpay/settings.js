(function() {
  'use strict';

  var exports = window.fxpay.utils.namespace('fxpay.settings');
  var pkgInfo = {"version": "0.0.5"};  // this is updated by `grunt bump`

  var defaultSettings = {

    // Public settings.
    //
    // Disallow receipts belonging to other apps.
    allowAnyAppReceipt: false,
    apiUrlBase: 'https://marketplace.firefox.com',
    apiVersionPrefix: '/api/v1',
    // When truthy, this will override the API object's default.
    apiTimeoutMs: null,
    // When true, work with fake products and test receipts.
    fakeProducts: false,
    // This object is used for all logging.
    log: window.console || {
      // Shim in a minimal set of the console API.
      debug: function() {},
      error: function() {},
      info: function() {},
      log: function() {},
      warn: function() {},
    },
    // Only these receipt check services are allowed.
    receiptCheckSites: [
      'https://receiptcheck.marketplace.firefox.com',
      'https://marketplace.firefox.com'
    ],

    // Private settings.
    //
    // This will be the App object returned from mozApps.getSelf().
    // On platforms that do not implement mozApps it will be null.
    appSelf: null,
    // Boolean flag to tell if we have addReceipt() or not.
    hasAddReceipt: null,
    // Map of JWT types to payment provider URLs.
    payProviderUrls: {
      'mozilla/payments/pay/v1':
          'https://marketplace.firefox.com/mozpay/?req={jwt}'
    },
    // Reference window so tests can swap it out with a stub.
    window: window,
    // Relative API URL that accepts a product ID and returns a JWT.
    prepareJwtApiUrl: '/webpay/inapp/prepare/',
    onerror: function(err) {
      throw err;
    },
    oninit: function() {
      exports.log.info('fxpay version:', exports.libVersion);
      exports.log.info('initialization ran successfully');
    },
    onrestore: function(error, info) {
      if (error) {
        exports.log.error('error while restoring product:', info.productId,
                          'message:', error);
      } else {
        exports.log.info('product', info.productId,
                         'was restored from receipt');
      }
    },
    // A record of the initialization error, if there was one.
    initError: 'NOT_INITIALIZED',
    localStorage: window.localStorage || null,
    localStorageKey: 'fxpayReceipts',
    mozPay: navigator.mozPay || null,
    mozApps: navigator.mozApps || null,
    libVersion: pkgInfo.version,
  };

  exports.configure = function settings_configure(newSettings, opt) {
    opt = opt || {};
    if (opt.reset) {
      for (var def in defaultSettings) {
        exports[def] = defaultSettings[def];
      }
    }
    for (var k in newSettings) {
      if (typeof exports[k] === 'undefined') {
        exports.log.error('configure() received an unknown setting:', k);
        return exports.onerror('INCORRECT_USAGE');
      }
      exports[k] = newSettings[k];
    }
    return exports;
  };

})(window.fxpay.settings);