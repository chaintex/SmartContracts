let MockUtils = artifacts.require("./mockContracts/MockUtils.sol")

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

let ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
let PRECISION = new BigNumber(10).pow(18);
const MAX_QTY = new BigNumber(10).pow(28);
const MAX_RATE = new BigNumber(10).pow(24);
const MAX_DECIMAL_DIFF = 18;

let utils;

contract('utils', function(accounts) {
    it("should init utils and tokens.", async function () {
        utils = await MockUtils.new();
    });

    it("check dest qty calculation.", async function () {
        let srcQty = 100;
        let rate = PRECISION.div(2); //1 to 2. in PRECISION units

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        let expectedDestQty = calcDestQty(srcQty, rate, srcDecimal, dstDecimal);

        let reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty.valueOf(), reportedDstQty.valueOf(), "unexpected dst qty");

        //check when dest decimals < src decimals
        srcQty = 100000000000;
        srcDecimal = 20;
        dstDecimal = 10;

        expectedDestQty = srcQty * rate / (PRECISION * 10 ** (srcDecimal - dstDecimal));
        reportedDstQty = await utils.mockCalcDstQty(srcQty, srcDecimal, dstDecimal, rate);

        assert.equal(expectedDestQty, reportedDstQty.valueOf(), "unexpected dst qty");
    });

    it("check dest qty calculation for high quantities.", async function () {
        let srcQty = new BigNumber(MAX_QTY);
        let rate = PRECISION.div(2).floor();

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        //should work with max Qty
        let expectedDestQty = calcDestQty(srcQty, rate, srcDecimal, dstDecimal);
        expectedDestQty = new BigNumber(expectedDestQty);
        // console.log("Expected dest qty: " + expectedDestQty.valueOf());

        let reportedDstQty = await utils.mockCalcDstQty('0x' + srcQty.toString(16), srcDecimal, dstDecimal, rate);
        reportedDstQty = new BigNumber(reportedDstQty);

        // console.log("Reported dest qty: " + reportedDstQty.valueOf());
        assert.equal(expectedDestQty.valueOf(), reportedDstQty.valueOf(), "unexpected dst qty");

        //should revert
        srcQty = MAX_QTY.add(1);
        try {
            reportedDstQty = await utils.mockCalcDstQty('0x' + srcQty.toString(16), srcDecimal, dstDecimal, rate);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check dest qty calculation for high quantities.", async function () {
        let srcQty = new BigNumber(MAX_QTY.div(2).floor());
        let rate = new BigNumber(MAX_RATE);

        //first check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 20;

        //should work with max Qty
        let expectedDestQty = calcDestQty(srcQty, rate, srcDecimal, dstDecimal);
        expectedDestQty = new BigNumber(expectedDestQty);
        // console.log("Expected dest qty: " + expectedDestQty.valueOf());

        let reportedDstQty = await utils.mockCalcDstQty('0x' + srcQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
        reportedDstQty = new BigNumber(reportedDstQty);
        // console.log("reported dest qty: " + reportedDstQty.valueOf());

        assert.equal(expectedDestQty.valueOf(), reportedDstQty.valueOf(), "unexpected dst qty");

        //should revert
        rate = MAX_RATE.add(1);
        try {
            reportedDstQty = await utils.mockCalcDstQty('0x' + srcQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check src qty calculation.", async function () {
        let dstQty = new BigNumber(100000);
        let rate = new BigNumber(PRECISION.mul(5)); //2 to 1. in PRECISION units

        //check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        let reportedSrcQty = await utils.mockCalcSrcQty('0x' + dstQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));

        assert.equal(expectedSrcQty.valueOf(), reportedSrcQty.valueOf(), "unexpected src qty");

        //check when dest decimals < src decimals
        srcDecimal = 12;
        dstDecimal = 10;

        expectedSrcQty = (((PRECISION / rate)* dstQty * (10**(srcDecimal - dstDecimal))));
        reportedSrcQty = await utils.mockCalcSrcQty('0x' + dstQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
        assert.equal(expectedSrcQty, reportedSrcQty, "unexpected src qty");
    });

    it("check src qty calculation with high qty.", async function () {
        let dstQty = new BigNumber(MAX_QTY);
        let rate = new BigNumber(PRECISION.mul(3)); //2 to 1. in PRECISION units

        //check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        expectedSrcQty = new BigNumber(expectedSrcQty);
        // console.log("Expected Src Qty: " + expectedSrcQty.valueOf());
        let reportedSrcQty = await utils.mockCalcSrcQty('0x' + dstQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
        reportedSrcQty = new BigNumber(reportedSrcQty);
        // console.log("Reported src qty: " + reportedSrcQty.valueOf());
        assert.equal(expectedSrcQty.valueOf(), reportedSrcQty.valueOf(), "unexpected src qty");

        //here should revert
        dstQty = MAX_QTY.add(1);

        try {
            reportedSrcQty = await utils.mockCalcSrcQty('0x' + dstQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("check src qty calculation with high rate.", async function () {
        let dstQty = MAX_QTY.div(2).floor();
        let rate = MAX_RATE;

        //check when dest decimals > src decimals
        let srcDecimal = 10;
        let dstDecimal = 16;

        let expectedSrcQty = calcSrcQty(dstQty, srcDecimal, dstDecimal, rate);
        // console.log("Expected src qty: " + expectedSrcQty.valueOf());
        let reportedSrcQty = await utils.mockCalcSrcQty('0x' + dstQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
        // console.log("Reported src qty: " + reportedSrcQty.valueOf());

        //here should revert
        rate = MAX_RATE.add(1);

        try {
            reportedSrcQty = await utils.mockCalcSrcQty('0x' + dstQty.toString(16), srcDecimal, dstDecimal, '0x' + rate.toString(16));
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should check when decimals diff > 18 calc reverted.", async function () {
        try {
            await utils.mockCalcDstQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcDstQty(30, 30, 10, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcSrcQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should check when decimals diff > 18 calc reverted.", async function () {
        try {
            await utils.mockCalcDstQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcDstQty(30, 30, 10, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcSrcQty(30, 10, 30, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            await utils.mockCalcSrcQty(30, 30, 10, 1500);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});

function calcDestQty (srcQty, rate, srcDecimal, dstDecimal) {
    let result;
    if (dstDecimal >= srcDecimal) {
        result = ((((new BigNumber(srcQty)).mul(rate).mul((new BigNumber(10)).pow(dstDecimal - srcDecimal))).div(PRECISION)));
    } else {
        result = ((new BigNumber(srcQty)).mul(rate).div(PRECISION.mul((new BigNumber(10)).pow(srcDecimal - dstDecimal))));
    }
    return result.floor();
}

function calcSrcQty(dstQty, srcDecimals, dstDecimals, rate) {
    //source quantity is rounded up. to avoid dest quantity being too low.
    let numerator;
    let denominator;
    if (srcDecimals >= dstDecimals) {
        numerator = PRECISION.mul(dstQty).mul((new BigNumber(10)).pow(srcDecimals - dstDecimals));
        denominator = new BigNumber(rate);
    } else {
        numerator = PRECISION.mul(dstQty);
        denominator = (new BigNumber(rate)).mul((new BigNumber(10)).pow(dstDecimals - srcDecimals));
    }
//    console.log("numerator: " + numerator.valueOf() + " denominator: " + denominator.valueOf())
    return (((numerator.add(denominator).sub(1)).div(denominator)).floor()); //avoid rounding down errors
}
