define([
  'errors',
  'fxpay',
  'helper',
  'settings'
], function(errors, fxpay, helper, settings) {

  describe('fxpay.purchase() on B2G', function () {
    var mozPay;

    beforeEach(function() {
      helper.setUp();
      mozPay = sinon.spy(helper.mozPayStub);
      fxpay.configure({
        appSelf: helper.appSelf,
        mozPay: mozPay,
      });
    });

    afterEach(function() {
      helper.tearDown();
      mozPay.reset();
      helper.receiptAdd.reset();
    });

    it('should send a JWT to mozPay', function (done) {
      var webpayJWT = '<base64 JWT>';
      var cfg = {
        apiUrlBase: 'https://not-the-real-marketplace',
        apiVersionPrefix: '/api/v1',
        adapter: null,
      };
      fxpay.configure(cfg);

      fxpay.purchase(helper.apiProduct.guid).then(function(productInfo) {
        assert.ok(mozPay.called);
        assert.ok(mozPay.calledWith([webpayJWT]), mozPay.firstCall);
        assert.equal(productInfo.productId, helper.apiProduct.guid);
        done();
      }).catch(done);

      helper.resolvePurchase({productData: {webpayJWT: webpayJWT},
                              mozPay: mozPay});
    });

    it('should support the old callback interface', function (done) {

      fxpay.purchase(helper.apiProduct.guid, function(error, productInfo) {
        if (!error) {
          assert.ok(mozPay.called);
          assert.equal(productInfo.productId, helper.apiProduct.guid);
        }
        done(error);
      });

      helper.resolvePurchase({mozPay: mozPay});
    });

    it('should timeout polling the transaction', function (done) {
      var productId = 'some-guid';

      fxpay.purchase(productId, {
        maxTries: 2,
        pollIntervalMs: 1
      }).then(function() {
        done(Error('unexpected success'));
      }).catch(function(err) {
        assert.instanceOf(err, errors.PurchaseTimeout);
        assert.equal(err.productInfo.productId, productId);
        done();
      }).catch(done);

      helper.resolvePurchase({
        mozPay: mozPay,
        transData: helper.transactionData({status: 'incomplete'}),
        enableTransPolling: true,
      });
    });

    it('should call back with mozPay error', function (done) {
      var productId = 'some-guid';

      fxpay.purchase(productId).then(function() {
        done(Error('unexpected success'));
      }).catch(function(err) {
        assert.instanceOf(err, errors.PayPlatformError);
        assert.equal(err.code, 'DIALOG_CLOSED_BY_USER');
        assert.equal(err.productInfo.productId, productId);
        done();
      }).catch(done);

      helper.resolvePurchase({
        mozPay: mozPay,
        mozPayResolver: function(domRequest) {
          domRequest.error = {name: 'DIALOG_CLOSED_BY_USER'};
          domRequest.onerror();
        },
      });
    });

    it('should support old callback interface for errors', function (done) {

      fxpay.purchase(helper.apiProduct.guid, function(err, productInfo) {
        assert.instanceOf(err, errors.PayPlatformError);
        assert.equal(productInfo.productId, helper.apiProduct.guid);
        done();
      });

      helper.resolvePurchase({
        mozPay: mozPay,
        mozPayResolver: function(domRequest) {
          domRequest.error = {name: 'DIALOG_CLOSED_BY_USER'};
          domRequest.onerror();
        },
      });
    });

    it('should report invalid transaction state', function (done) {

      fxpay.purchase(helper.apiProduct.guid).then(function() {
        done(Error('unexpected success'));
      }).catch(function(err) {
        assert.instanceOf(err, errors.ConfigurationError);
        done();
      }).catch(done);

      helper.resolvePurchase({
        mozPay: mozPay,
        transData: helper.transactionData(
          {status: 'THIS_IS_NOT_A_VALID_STATE'}),
      });
    });

    it('should add receipt to device with addReceipt', function (done) {
      var receipt = '<receipt>';

      fxpay.purchase(helper.apiProduct.guid).then(function(productInfo) {
        assert.equal(helper.receiptAdd._receipt, receipt);
        assert.equal(productInfo.productId, helper.apiProduct.guid);
        done();
      }).catch(done);

      helper.resolvePurchase({receipt: receipt, mozPay: mozPay});
    });

    it('should call back with complete product info', function (done) {

      fxpay.purchase(helper.apiProduct.guid).then(function(info) {
        assert.equal(info.productId, helper.apiProduct.guid);
        assert.equal(info.name, helper.apiProduct.name);
        assert.equal(info.smallImageUrl, helper.apiProduct.logo_url);
        done();
      }).catch(done);

      helper.resolvePurchase({mozPay: mozPay});
    });

    it('should fetch stub products when using fake products', function (done) {
      fxpay.configure({fakeProducts: true});

      fxpay.purchase(helper.apiProduct.guid).then(function(info) {
        assert.equal(info.productId, helper.apiProduct.guid);
        assert.equal(info.name, helper.apiProduct.name);
        assert.equal(info.smallImageUrl, helper.apiProduct.logo_url);
        done();
      }).catch(done);

      helper.resolvePurchase({
        fetchProductsPattern: new RegExp('.*\/stub-in-app-products\/.*'),
        mozPay: mozPay
      });
    });

    it('should add receipt to device with localStorage', function (done) {
      var receipt = '<receipt>';

      setUpLocStorAddReceipt();

      // Without addReceipt(), receipt should go in localStorage.

      fxpay.purchase(helper.apiProduct.guid).then(function(productInfo) {
        assert.equal(
          JSON.parse(
            window.localStorage.getItem(settings.localStorageKey))[0],
          receipt);
        assert.equal(productInfo.productId, helper.apiProduct.guid);
        done();
      }).catch(done);

      helper.resolvePurchase({receipt: receipt, mozPay: mozPay});
    });

    it('should error when no storage mechanisms exist', function(done) {
      var receipt = '<receipt>';
      delete helper.appSelf.addReceipt;  // older FxOSs do not have this.

      fxpay.configure({
        localStorage: null,  // no fallback.
      });

      fxpay.purchase(helper.apiProduct.guid).then(function() {
        done(Error('unexpected success'));
      }).catch(function(error) {
        assert.instanceOf(error, errors.PayPlatformUnavailable);
        done();
      }).catch(done);

      helper.resolvePurchase({receipt: receipt, mozPay: mozPay});
    });

    it('should not add dupes to localStorage', function (done) {
      var receipt = '<receipt>';

      setUpLocStorAddReceipt();

      // Set up an already stored receipt.
      window.localStorage.setItem(settings.localStorageKey,
                                  JSON.stringify([receipt]));

      fxpay.purchase(helper.apiProduct.guid).then(function(productInfo) {
        var addedReceipts = JSON.parse(
          window.localStorage.getItem(settings.localStorageKey));

        // Make sure a new receipt wasn't added.
        assert.equal(addedReceipts.length, 1);

        assert.equal(productInfo.productId, helper.apiProduct.guid);
        done();
      }).catch(done);

      helper.resolvePurchase({receipt: receipt, mozPay: mozPay});
    });

    it('should pass through receipt errors', function (done) {

      fxpay.purchase(helper.apiProduct.guid).then(function() {
        done(Error('unexpected success'));
      }).catch(function(err) {
        assert.instanceOf(err, errors.AddReceiptError);
        assert.equal(err.code, 'ADD_RECEIPT_ERROR');
        assert.equal(err.productInfo.productId, helper.apiProduct.guid);
        done();
      }).catch(done);

      helper.resolvePurchase({
        mozPay: mozPay,
        addReceiptResolver: function(domRequest) {
          domRequest.error = {name: 'ADD_RECEIPT_ERROR'};
          domRequest.onerror();
        },
      });
    });


    function setUpLocStorAddReceipt() {
      // Set up a purchase where mozApps does not support addReceipt().
      delete helper.appSelf.addReceipt;

      helper.appSelf.onsuccess();
    }

  });
});
