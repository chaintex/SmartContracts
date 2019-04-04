const FeeSharing = artifacts.require("FeeSharing.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');
const truffleAssert = require('truffle-assertions');

//global variables
//////////////////
const precisionUnits = (new BigNumber(10).pow(18));
const max_rate = (precisionUnits.mul(10 ** 6)).valueOf(); //internal parameter in Utils.sol
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const gasPrice = (new BigNumber(10).pow(9).mul(50));
let negligibleRateDiff = 11;

//permission groups
let admin;
let operator;
let alerter;
let commission1;
let commission2;

let commission1Percent = 30;
let commission2Percent = 50;

let network;
let feeSharing;


contract('FeeSharing', function(accounts) {
    it("should init globals. init FeeSharing Inst", async function () {
        // set account addresses
        admin = accounts[0];
        network = accounts[1];
        commission1 = accounts[2];
        commission2 = accounts[3];

        feeSharing = await FeeSharing.new(admin, network);
    });
    it("should test can not init or set with zero address", async function () {
      let tempFeeSharing;
      try {
        tempFeeSharing = await FeeSharing.new(admin, zeroAddress);
        assert.equal(false, "Throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }

      try {
        tempFeeSharing = await FeeSharing.new(zeroAddress, network);
        assert.equal(false, "Throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }

      try {
        tempFeeSharing = await FeeSharing.new(zeroAddress, zeroAddress);
        assert.equal(false, "Throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }

      tempFeeSharing = await FeeSharing.new(admin, network);

      // try {
      //   tempFeeSharing.setNetworkContract(zeroAddress);
      //   assert.equal(false, "Throw was expected in line above");
      // } catch (e) {
      //   assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      // }

      tempFeeSharing.setNetworkContract(network);

      const networkRecorded = await tempFeeSharing.network();
      assert.equal(networkRecorded, network, "Network is not set properly");
    });

    it("Should test default fee is 0 and can set new fee for commission wallet", async function() {
      console.log("Get fee sharing fee in bps");
      var feeInBps = await feeSharing.walletFeesInBps(commission1);
      // console.log("Fee: " + feeInBps.valueOf());
      assert.equal(feeInBps.valueOf(0), 0, "Fee is not set default to zero");
      feeInBps = await feeSharing.walletFeesInBps(commission2);
      assert.equal(feeInBps.valueOf(0), 0, "Fee is not set default to zero");
      await feeSharing.setWalletFees(commission1, commission1Percent);
      await feeSharing.setWalletFees(commission2, commission2Percent);

      feeInBps = await feeSharing.walletFeesInBps(commission1);
      assert.equal(feeInBps.valueOf(), commission1Percent, "Fee is not set correctly");
      feeInBps = await feeSharing.walletFeesInBps(commission2);
      assert.equal(feeInBps.valueOf(), commission2Percent, "Fee is not set correctly");
    });

    it("Should test can not set wallet with fee more than 100%", async function() {
      try {
        await feeSharing.setWalletFees(commission1, 10000);
        assert.equal(false, "Throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }
    });

    it("Should test correct record and balance for not set wallet", async function() {
      console.log("Getting balance before");
      const balanceBefore = await Helper.getBalancePromise(feeSharing.address);
      // console.log("Balance before: " + balanceBefore);
      await feeSharing.handleFees(network, {from: network, value: 3000});
      const balanceAfter = await Helper.getBalancePromise(feeSharing.address);
      // console.log("Balance before: " + balanceBefore.valueOf());
      // console.log("Balance after: " + balanceAfter.valueOf());
      assert.equal((new BigNumber(balanceBefore).plus(3000)).valueOf(), (new BigNumber(balanceAfter)).valueOf(), "Balance is not changed correctly");

      const feeToPay = await feeSharing.walletFeesToPay(network);
      // console.log("Fee to pay: " + feeToPay);
      assert.equal(feeToPay.valueOf(0), 0, "wallet fee to pay is not set correct");
    });

    it("Should test correct record and balance for commission wallet 1", async function() {
      const balanceBefore = await Helper.getBalancePromise(feeSharing.address);
      await feeSharing.handleFees(commission1, {from: network, value: 30000});
      const balanceAfter = await Helper.getBalancePromise(feeSharing.address);
      // console.log("Balance before: " + balanceBefore.valueOf());
      // console.log("Balance after: " + balanceAfter.valueOf());
      assert.equal((new BigNumber(balanceBefore).plus(30000)).valueOf(), (new BigNumber(balanceAfter)).valueOf(), "Balance is not changed correctly");

      const feeToPay = await feeSharing.walletFeesToPay(commission1);
      const expectedFeeToPay = 30000 * commission1Percent / 10000;
      // console.log("Fee to pay: " + feeToPay);
      assert.equal(feeToPay.valueOf(), expectedFeeToPay, "wallet fee to pay is not set correct");
    });

    it("Should test correct record and balance for commission wallet 2", async function() {
      const balanceBefore = await Helper.getBalancePromise(feeSharing.address);
      await feeSharing.handleFees(commission2, {from: network, value: 30000});
      const balanceAfter = await Helper.getBalancePromise(feeSharing.address);
      // console.log("Balance before: " + balanceBefore.valueOf());
      // console.log("Balance after: " + balanceAfter.valueOf());
      assert.equal((new BigNumber(balanceBefore).plus(30000)).valueOf(), (new BigNumber(balanceAfter)).valueOf(), "Balance is not changed correctly");

      const feeToPay = await feeSharing.walletFeesToPay(commission2);
      // console.log("Fee to pay: " + feeToPay);
      const expectedFeeToPay = 30000 * commission2Percent / 10000;
      // console.log("Expected fee to pay: " + expectedFeeToPay);
      assert.equal(feeToPay.valueOf(), expectedFeeToPay, "wallet fee to pay is not set correct");
    });

    it("Should test correct send fee to commission wallet and reset fee to pay", async function() {
      const balanceBefore = await Helper.getBalancePromise(commission1);
      var feeToPay = await feeSharing.walletFeesToPay(commission1);
      await feeSharing.sendFeeToWallet(commission1);
      const balanceAfter = await Helper.getBalancePromise(commission1);
      // console.log("Balance before: " + balanceBefore.valueOf());
      // console.log("Balance after: " + balanceAfter.valueOf());
      // console.log("Fee to pay: " + feeToPay.valueOf());
      assert.equal((new BigNumber(balanceBefore).plus(feeToPay)).valueOf(), (new BigNumber(balanceAfter)).valueOf(), "Fee is not sent to wallet");

      feeToPay = await feeSharing.walletFeesToPay(commission1);
      assert.equal(feeToPay.valueOf(0), 0, "Fee to pay is not reset correctly");
    });

    it("Should test can not send fee to commission wallet if it doest not have any fee", async function() {
      const feeToPay = await feeSharing.walletFeesToPay(commission1);
      // console.log("Fee to pay: " + feeToPay.valueOf());
      assert.equal(feeToPay.valueOf(0), 0, "Fee for commission wallet 1 should be 0");
      try {
        await feeSharing.sendFeeToWallet(commission1);
        assert.equal(false, "Throw was expected in line above");
      } catch (e) {
        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
      }
      await feeSharing.sendFeeToWallet(commission2);
    });
});
