'use strict';

angular.module('owm.finance.vouchers', [])

.controller('VouchersController', function ($window, $q, $state, $scope, appConfig, alertService, voucherService,
  paymentService, bookingService, me) {

  var cachedBookings = {};

  $scope.busy = true;
  $scope.requiredValue = null;
  $scope.voucherOptions = [25,50,100,250,500];
  $scope.showVoucherOptions = false;
  $scope.redemptionPending = {}; /* by booking id */

  alertService.load($scope);
  getRequiredValue().then(getBookings).finally(function () {
    alertService.loaded($scope);
    $scope.busy = false;
  });

  $scope.toggleVoucherOptions = function (toggle) {
    $scope.showVoucherOptions = toggle;
  };

  $scope.buyVoucher = function (value) {
    if (!value || value < 0) { return; }

    alertService.load($scope);
    voucherService.createVoucher({ person: me.id, value: value })
    .then(function (voucher) {
      return paymentService.payVoucher({ voucher: voucher.id });
    })
    .then(function (data) {
      if (!data.url) {
        throw new Error('Er is een fout opgetreden');
      }
      /* redirect to payment url */
      redirect(data.url);
    })
    .catch(function (err) {
      alertService.addError(err);
    })
    .finally(function () {
      alertService.loaded($scope);
    });
  };

  $scope.toggleRedemption = function (booking) {
    alertService.closeAll();
    alertService.load($scope);

    /* checkbox is already checked, so new value is now: */
    var newValue = booking.riskReduction;

    $scope.redemptionPending[booking.id] = true;
    bookingService.alter({
      booking: booking.id,
      newProps: {
        riskReduction: newValue
      }
    })
    .then(function () {
      /* recalculate amounts */
      return getRequiredValue();
    })
    .then(function (requiredValue) {
      /* get bookings from cache */
      return getBookings(requiredValue);
    })
    .then(function () {
      booking.riskReduction = newValue;
    })
    .catch(function (err) {
      /* revert */
      booking.riskReduction = !!!booking.riskReduction;
      alertService.addError(err);
    })
    .finally(function () {
      alertService.loaded($scope);
      $scope.redemptionPending[booking.id] = false;
    });
  };

  function getRequiredValue () {
    return voucherService.calculateRequiredCredit({
      person: me.id
    }).then(function (value) {
      $scope.requiredValue = value;
      return value;
    })
    .catch(function (err) {
      alertService.addError(err);
    });
  }

  /**
   * Extend the requiredValue object's bookings
   * Use cache, no need to reload, e.g. after toggling redemption
   */
  function getBookings (requiredValue) {
    if (!requiredValue.bookings || !requiredValue.bookings.length) { return true; }
    var results = [];

    requiredValue.bookings.forEach(function (booking) {
      results.push(cachedBookings[booking.id] ||
        bookingService.get({
          booking: booking.id
        }).then(function (_booking) {
          cachedBookings[_booking.id] = _booking;

          angular.extend(booking, _booking);
        })
      );
    });
    return $q.all(results).catch(function (err) {
      alertService.addError(err);
    });
  }

  function redirect (url) {
    var redirectTo = appConfig.appUrl + $state.href('owm.finance.vouchers');
    $window.location.href = url + '?redirectTo=' + encodeURIComponent(redirectTo);
  }

});
