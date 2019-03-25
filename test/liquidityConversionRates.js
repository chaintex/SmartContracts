let LiquidityConversionRates = artifacts.require("./LiquidityConversionRates.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Reserve = artifacts.require("./Reserve");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let ethAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

//balances
let expectedReserveBalanceWei = 0;
let reserveTokenBalance = 0;

//permission groups
let admin;
let alerter;
let operator;
let network;

//users
let user1
let user2

//contracts
let convRatesInst;
let reserveInst;
let liqConvRatesInst;
let token
let tokenAdd

//block data
let currentBlock;

//general calculation related consts
const e = new BigNumber("2.7182818284590452353602874713527");
const expectedDiffInPct = new BigNumber(0.01);

// default values
const precision = new BigNumber(10).pow(18);
const formulaPrecisionBits = 40;
const formulaPrecision = new BigNumber(2).pow(formulaPrecisionBits)
const tokenDecimals = 18
const tokenPrecision = new BigNumber(10).pow(tokenDecimals)

const testing = "bbo";

/****** for BBO init: *******/
// for BBO we decided on a fixed pmin, pmax (0.5,2) and r (0.01).
// than we deposited the exact e0 and t0 to support it.
// so minPmin and maxPmax are exactly same as pMin and pMax
/***************************/

/****** for Midas init: *******/
// for midas we first decided on a fixed pmin (0.5) and fixed e0, t0 (100, 1M).
// than calculated r to support it (0.01 * (69.315/100))).
// so min pmin is exactly as pmin.
// pmax is now bigger, but we set pmax as 2.
/***************************/

let r, p0, e0, t0, feePercent, maxCapBuyInEth, maxCapSellInEth, pMinRatio, pMaxRatio;

if (testing == "bbo") {
    r = 0.01
    p0 = 0.00002146
    e0 = 69.315
    t0 = 2329916.12
    feePercent = 0.25
    maxCapBuyInEth = 3
    maxCapSellInEth = 3
    pMinRatio = 0.5
    pMaxRatio = 2.0
} else if (testing == "midas") {
    r = 0.0069315
    p0 = 0.0001 // 1m tokens = 100 eth
    e0 = 100.0 //69.315
    t0 = 1000000.0 //1m TOKENS
    feePercent = 0.25
    maxCapBuyInEth = 10
    maxCapSellInEth = 10
    pMinRatio = 0.5
    pMaxRatio = 2.0
}

// determine theoretical minimal pMIn, maximal pMax according to r, p0, e0, t0.
// this is done just to make sure pMmin and pMax are in the range.
const minPmin = new BigNumber(p0).div((Helper.exp(e, new BigNumber(r).mul(e0))))
const maxPmax = new BigNumber((p0 / (1 - r * p0 * t0)).toString())
const pMin = p0 * pMinRatio
const pMax = p0 * pMaxRatio

/*
console.log("pMin: " + pMin.toString())
console.log("pMax: " + pMax.toString())
console.log("minPmin: " + minPmin.toString())
console.log("maxPmax: " + maxPmax.toString())
console.log("pMinRatio: " + pMinRatio.toString())
console.log("pMaxRatio: " + pMaxRatio.toString())
*/

// default values in contract common units
const feeInBps = feePercent * 100
const eInFp = new BigNumber(e0).mul(formulaPrecision).round();
const rInFp = new BigNumber(r).mul(formulaPrecision).round();
const pMinInFp = new BigNumber(pMin).mul(formulaPrecision).round();
const maxCapBuyInWei = new BigNumber(maxCapBuyInEth).mul(precision).round();
const maxCapSellInWei = new BigNumber(maxCapSellInEth).mul(precision).round();
const maxBuyRateInPrecision = (new BigNumber(1).div(pMin)).mul(precision).round();
const minBuyRateInPrecision = (new BigNumber(1).div(pMax)).mul(precision).round();
const maxSellRateInPrecision = new BigNumber(pMax).mul(precision).round();
const minSellRateInPrecision = new BigNumber(pMin).mul(precision).round();

function pOfE(r, pMin, curE) {
    return Helper.exp(e, new BigNumber(r).mul(curE)).mul(pMin);
}

function buyPriceForZeroQuant(r, pMin, curE) {
    let pOfERes = pOfE(r, pMin, curE);
    let buyPrice = new BigNumber(1).div(pOfERes);
    let buyPriceAfterFeesReduction = buyPrice.mul((100-feePercent)/100)
    return buyPriceAfterFeesReduction;
}

function sellPriceForZeroQuant(r, pMin, curE) {
    let sellPrice = pOfE(r, pMin, curE);
    let sellPriceAfterFeeReduction = sellPrice.mul((100-feePercent)/100)
    return sellPriceAfterFeeReduction;
}

function calcDeltaT(r, pMin, deltaE, curE) {
    let esubRDeltaE = Helper.exp(e, new BigNumber(-r).mul(deltaE))
    let esub1 = esubRDeltaE.sub(1)
    let rP = new BigNumber(r).mul(pOfE(r, pMin, curE))
    return esub1.div(rP)
}

function calcDeltaE(r, pMin, deltaT, curE) {
    let rPdeltaT = new BigNumber(r).mul(pOfE(r, pMin, curE)).mul(deltaT)
    let onePlusRPdeltaT = new BigNumber(1).plus(rPdeltaT)
    let lnOnePlusrPdeltaT = Helper.ln(onePlusRPdeltaT)
    return lnOnePlusrPdeltaT.mul(-1).div(r)
}

function priceForDeltaE(feePercent, r, pMin, deltaE, curE) {
    let deltaT = calcDeltaT(r, pMin, deltaE, curE).abs();
    let factor = (100-feePercent)/100
    let deltaTAfterReducedFee = deltaT.mul(factor.toString())
    return new BigNumber(deltaTAfterReducedFee).div(deltaE);
}

function priceForDeltaT(feePercent, r, pMin, qtyBeforeReduce, curE) {
    let deltaTAfterReducingFee = qtyBeforeReduce * (100 - feePercent) / 100;
    let deltaE = calcDeltaE(r, pMin, deltaTAfterReducingFee, curE).abs();
    return deltaE.div(qtyBeforeReduce);
}

function tForCurPWithoutFees(r, curSellPrice) {
    let oneOverPmax = new BigNumber(1).div(pMax);
    let oneOverCurSellPrice = new BigNumber(1).div(curSellPrice);
    let oneOverR = new BigNumber(1).div(r);
    let t = oneOverR.mul(oneOverCurSellPrice.sub(oneOverPmax));
    return t;
}

function eForCurPWithoutFees(r, curSellPrice) {
    return (Helper.ln(curSellPrice/pMin)/r).toString()
}

async function sellRateForZeroQuantInPrecision(eInEth) {
    let eFp = eInEth.mul(formulaPrecision);
    let rateInPrecision = await liqConvRatesInst.sellRateZeroQuantity(eFp)
    return rateInPrecision;
}

async function buyRateForZeroQuantInPrecision(eInEth) {
    let eFp = eInEth.mul(formulaPrecision);
    let rateInPrecision = await liqConvRatesInst.buyRateZeroQuantity(eFp)
    return rateInPrecision;
}

async function getExpectedTWithoutFees(curE) {
    let rateFor0 = pOfE(r, pMin, curE);
    return tForCurPWithoutFees(r, rateFor0.valueOf());
}

async function getBalances() {
    let balances = {}
    balances["EInWei"] = await Helper.getBalancePromise(reserveInst.address);
    balances["EInEth"] = new BigNumber(balances["EInWei"]).div(precision)
    balances["TInTwei"] = await token.balanceOf(reserveInst.address);
    balances["TInTokens"] = new BigNumber(balances["TInTwei"]).div(tokenPrecision)
    balances["User1Twei"] = await token.balanceOf(user1);
    balances["collectedFeesInTwei"] = await liqConvRatesInst.collectedFeesInTwei()
    balances["collectedFeesInTokens"] = new BigNumber(balances["collectedFeesInTwei"]).div(tokenPrecision);
    balances["networkTwei"] = await token.balanceOf(network);
    balances["networkTokens"] = new BigNumber(balances["networkTwei"]).div(tokenPrecision);
    return balances;
}


contract('LiquidityConversionRates', function(accounts) {
    const deltaE = 0.1
    const deltaEInFp = new BigNumber(deltaE).mul(formulaPrecision).round();
    const deltaT = 2000
    const deltaTInFp = new BigNumber(deltaT).mul(formulaPrecision).round();

    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })

    it("should init LiquidityConversionRates Inst and setting of reserve address", async function () {
        token = await TestToken.new("test", "tst", tokenDecimals);
        liqConvRatesInst = await LiquidityConversionRates.new(admin, token.address);
        liqConvRatesInst.setReserveAddress(reserveAddress)
    });

    it("should test abs.", async function () {
        let input = new BigNumber(10).pow(18).mul(7);
        let output = new BigNumber(10).pow(18).mul(7);
        let result = await liqConvRatesInst.abs(input);
        assert.equal(result.valueOf(), output.valueOf(), "bad result");

        input = new BigNumber(10).pow(18).mul(-5);
        output = new BigNumber(10).pow(18).mul(5);
        result = await liqConvRatesInst.abs(input);
        assert.equal(result.valueOf(), output.valueOf(), "bad result");

        input = new BigNumber(10).pow(18).mul(0);
        output = new BigNumber(10).pow(18).mul(0);
        result = await liqConvRatesInst.abs(input);
        assert.equal(result.valueOf(), output.valueOf(), "bad result");
    });

    it("should set liquidity params", async function () {

        console.log("rInFp: " + rInFp.toString())
        console.log("pMinInFp: " + pMinInFp.toString())
        console.log("formulaPrecisionBits: " + formulaPrecisionBits.toString())
        console.log("maxCapBuyInWei: " + maxCapBuyInWei.toString())
        console.log("maxCapSellInWei: " + maxCapSellInWei.toString())
        console.log("feeInBps: " + feeInBps.toString())
        console.log("maxSellRateInPrecision: " + maxSellRateInPrecision.toString())
        console.log("minSellRateInPrecision: " + minSellRateInPrecision.toString())

        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision)
    });

    it("should test calculation of collected fee for buy case.", async function () {
        await liqConvRatesInst.resetCollectedFees()

        let input = 1458 * formulaPrecision
        let expectedValueBeforeReducingFee = input / ((100 - feePercent)/100)
        let expectedResult = (feePercent / 100) * expectedValueBeforeReducingFee

        await liqConvRatesInst.recordImbalance(token.address, input, 0, 0, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of collected fee for sell case.", async function () {
        await liqConvRatesInst.resetCollectedFees()
        let input = -1458 * formulaPrecision
        let expectedResult = (-input) * (feePercent / 100)

        await liqConvRatesInst.recordImbalance(token.address, input, 0, 0, {from: reserveAddress})
        result = await liqConvRatesInst.collectedFeesInTwei()
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test reducing fees from amount.", async function () {
        let input = 5763 * formulaPrecision;
        let expectedResult =  input * (100 - feePercent) / 100;
        let result =  await liqConvRatesInst.valueAfterReducingFee(input);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test converting from wei to formula formulaPrecision.", async function () {
        let input = new BigNumber(7).mul(precision)
        let expectedResult = input.mul(formulaPrecision).div(precision)
        let result =  await liqConvRatesInst.fromWeiToFp(input);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test converting from token wei to formula formulaPrecision.", async function () {
        let input = new BigNumber(10).pow(tokenDecimals).mul(17);
        let expectedResult = input.mul(formulaPrecision).div(tokenPrecision)
        let result =  await liqConvRatesInst.fromTweiToFp(input);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of buy rate for zero quantity.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRateZeroQuantity(eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of sell rate for zero quantity.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.sellRateZeroQuantity(eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of deltaT.", async function () {
        let expectedResult = calcDeltaT(r, pMin, deltaE, e0).abs().mul(formulaPrecision).valueOf()
        let result =  await liqConvRatesInst.deltaTFunc(rInFp, pMinInFp, eInFp, deltaEInFp, formulaPrecision);
        console.log("deltaT result: " + result);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of buy rate for non zero quantity.", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRate(eInFp, deltaEInFp)
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of deltaE.", async function () {
        let expectedResult = calcDeltaE(r, pMin, deltaT, e0).abs().mul(formulaPrecision).valueOf()
        let result =  await liqConvRatesInst.deltaEFunc(rInFp, pMinInFp, eInFp, deltaTInFp, formulaPrecision, formulaPrecisionBits);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test calculation of sell rate for non zero quantity.", async function () {
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let deltaTAfterReducingFeeInFp = new BigNumber(deltaTInFp).mul((100 - feePercent) / 100).round();
        let result =  await liqConvRatesInst.sellRate(eInFp, deltaTInFp, deltaTAfterReducingFeeInFp);
        result = result[0]
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test recording of imbalance.", async function () {
        let buyAmountInTwei = (new BigNumber(10).pow(tokenDecimals).mul(deltaT));
        console.log("Buy amount in twei: " + buyAmountInTwei);

        let expectedValueBeforeReducingFee = new BigNumber(buyAmountInTwei.mul(3).div((100 - feePercent)/100)); // TODO - this calc is a duplication, move to general place...
        console.log("Recording imbalance: " + expectedValueBeforeReducingFee);
        let expectedResult = expectedValueBeforeReducingFee.mul(feePercent / 100);
        console.log("Recording imbalance: " + expectedResult.toString(16));
        console.log("Recording imbalance: " + buyAmountInTwei.toString(16));
        console.log("Recording imbalance: " + (new BigNumber(buyAmountInTwei.mul(2))).toString(16));

        await liqConvRatesInst.recordImbalance(token.address, '0x' + buyAmountInTwei.toString(16), 3000, 3000, {from: reserveAddress});
        await liqConvRatesInst.recordImbalance(token.address, '0x' + (new BigNumber(buyAmountInTwei.mul(2))).toString(16), 3000, 3000, {from: reserveAddress});
        let result = await liqConvRatesInst.collectedFeesInTwei();

        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test resetting of imbalance not by admin.", async function () {
        try {
            await liqConvRatesInst.resetCollectedFees({from:operator})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
        let afterReset = await liqConvRatesInst.collectedFeesInTwei();
        assert.notEqual(afterReset, 0, "bad result");

    });

    it("should test resetting of imbalance.", async function () {
        let beforeReset = await liqConvRatesInst.collectedFeesInTwei();
        assert.notEqual(beforeReset, 0, "bad result");

        await liqConvRatesInst.resetCollectedFees()
        let result = await liqConvRatesInst.collectedFeesInTwei()
        let expectedResult = 0
        assert.equal(result, expectedResult, "bad result");
    });

    it("should test getrate for buy=true and qtyInSrcWei = non_0.", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let qtyInSrcWei = new BigNumber(deltaE).mul(precision).round();
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=true and qtyInSrcWei = 0.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 0
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=true and qtyInSrcWei very small.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 10 // this is assumed to be rounded to 0 by fromTweiToFp.
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
        assert(result.valueOf != 0)
    });

    it("should test getrate for buy=false and qtyInSrcWei = non_0.", async function () {
        let qtyInSrcWei = new BigNumber(deltaT).mul(tokenPrecision);
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,'0x' + qtyInSrcWei.toString(16),eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=false and qtyInSrcWei = 0.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 0
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
    });

    it("should test getrate for buy=false and qtyInSrcWei very small.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let qtyInSrcWei = 10 // this is assumed to be rounded to 0 by fromTweiToFp.
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
        assert(result.valueOf != 0)
    });

    it("should test set liquidity params not as admin.", async function () {
        //try once to see it's working
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: admin})

        currentFeeInBps = 10001
        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision, {from: operator})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test set liquidity params with illegal fee in BPS configuration.", async function () {
        //try once to see it's working
        let currentFeeInBps = feeInBps
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, currentFeeInBps, maxSellRateInPrecision, minSellRateInPrecision)

        currentFeeInBps = 10001
        try {
            await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, currentFeeInBps, maxSellRateInPrecision, minSellRateInPrecision)
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test get rate with invalid token.", async function () {
        let otherToken = await TestToken.new("otherToken", "oth", tokenDecimals);
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        let qtyInSrcWei = new BigNumber(deltaE).mul(precision).round();
        let result =  await liqConvRatesInst.getRateWithE(otherToken.address,true,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");
    });

    it("should test max sell rate smaller then expected rate and min sell rate larger then expected rate .", async function () {
        let qtyInSrcWei = new BigNumber(deltaT).mul(tokenPrecision);
        let deltaTAfterReducingFee = deltaT * (100 - feePercent) / 100; //reduce fee, as done in getRateWithE
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaTAfterReducingFee, e0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,'0x' + qtyInSrcWei.toString(16),eInFp);
        let gotResult = result
        console.log("Result: " + result);

        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
        assert.notEqual(result, 0, "bad result");

        let currentMaxSellRateInPrecision = gotResult - 100;
        console.log("Current max sell: " + currentMaxSellRateInPrecision);
        let currentMinSellRateInPrecision= minSellRateInPrecision
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, currentMaxSellRateInPrecision, currentMinSellRateInPrecision)
        console.log("Pass lol");
        result =  await liqConvRatesInst.getRateWithE(token.address,false,'0x'+qtyInSrcWei.toString(16),eInFp);
        console.log("Result: " + result);
        assert.equal(result, 0, "bad result");

        currentMaxSellRateInPrecision = maxSellRateInPrecision
        currentMinSellRateInPrecision = gotResult + 100
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, currentMaxSellRateInPrecision, currentMinSellRateInPrecision)
        result =  await liqConvRatesInst.getRateWithE(token.address,false,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");

        //return things to normal
        await liqConvRatesInst.setLiquidityParams(rInFp, pMinInFp, formulaPrecisionBits, maxCapBuyInWei, maxCapSellInWei, feeInBps, maxSellRateInPrecision, minSellRateInPrecision)
    });

    it("should test exceeding max cap buy", async function () {
        let qtyInSrcWei = new BigNumber(maxCapBuyInEth + 0.2).mul(precision).round();
        let result =  await liqConvRatesInst.getRateWithE(token.address,true,qtyInSrcWei,eInFp);
        assert.equal(result, 0, "bad result");
    });

    it("should test exceeding max cap sell", async function () {
        let sellQtyInTokens = (maxCapSellInEth / p0) * (1.1);
        let sellQtyInTwi = new BigNumber(sellQtyInTokens.toString()).mul(tokenPrecision).round();
        let result =  await liqConvRatesInst.getRateWithE(token.address,false,'0x' + sellQtyInTwi.toString(16),eInFp);
        assert.equal(result.valueOf(), 0, "bad result");
    });

    it("should test get rate with E", async function () {
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision)
        let qtyInSrcWei = new BigNumber(deltaE).mul(precision).round();
        console.log("expectedResult: " + expectedResult);
        let result =  await liqConvRatesInst.getRateWithE(token.address, true, '0x' + qtyInSrcWei.toString(16), eInFp);
        console.log("Result: " + result);
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct);
    });

    it("should test recording of imbalance from non reserve address.", async function () {
        let buyAmountInTwei = new BigNumber(10).pow(tokenDecimals).mul(deltaT).round();
        let expectedValueBeforeReducingFee = buyAmountInTwei.mul(3) / ((100 - feePercent)/100) // TODO - this calc is a duplication, move to general place...
        let expectedResult = new BigNumber(((feePercent / 100) * expectedValueBeforeReducingFee).toString()).round();
        try {
            await liqConvRatesInst.recordImbalance(token.address, '0x' + buyAmountInTwei.toString(16), 3000, 3000, {from: operator})
            assert(false, "expected to throw error in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });
});


contract('kyberReserve for Liquidity', function(accounts) {
    it("should init globals. init ConversionRates Inst, token, set liquidity params .", async function () {
        // set account addresses
        admin = accounts[0];
        network = accounts[2];
        user1 = accounts[4];
        user2 = accounts[5];

        currentBlock = await Helper.getCurrentBlock();

        token = await TestToken.new("test", "tst", 18);
        tokenAdd = token.address;

        liquidityConvRatesInst = await LiquidityConversionRates.new(admin, token.address);
        await liquidityConvRatesInst.setLiquidityParams(
                rInFp,
                pMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei,
                maxCapSellInWei,
                feeInBps,
                maxSellRateInPrecision,
                minSellRateInPrecision
            )
    });

    it("should init reserve and set all reserve data including balances", async function () {
        reserveInst = await Reserve.new(network, liquidityConvRatesInst.address, admin);
        await reserveInst.setContracts(network, liquidityConvRatesInst.address, '0x0000000000000000000000000000000000000000');

        await liquidityConvRatesInst.setReserveAddress(reserveInst.address);

        //set reserve balance.
        let reserveEtherInit = (new BigNumber(10).pow(18)).mul(e0).round();
        await Helper.sendEtherWithPromise(accounts[9], reserveInst.address, '0x' + reserveEtherInit.toString(16));

        let balance = await Helper.getBalancePromise(reserveInst.address);
        expectedReserveBalanceWei = balance.valueOf();
        console.log("Balance: " + balance.valueOf());
        console.log("Reserve ether init: " + reserveEtherInit);

        assert.equal(balance.valueOf(), reserveEtherInit, "wrong ether balance");

        await reserveInst.approveWithdrawAddress(token.address,accounts[0],true);

        //transfer tokens to reserve.
        let amount = (new BigNumber(10).pow(tokenDecimals)).mul(t0).round();
        await token.transfer(reserveInst.address, '0x' + amount.toString(16));
        balance = await token.balanceOf(reserveInst.address);
        console.log("Balance: " + balance.valueOf());
        console.log("Amount: " + amount.valueOf());
        assert.equal(amount.valueOf(), balance.valueOf());

        reserveTokenBalance = amount;
    });

    it("should test getConversionRate of buy rate for zero quantity.", async function () {
        let expectedResult = buyPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let amountWei = 0
        let result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);
        console.log("getConversionRate Zero Qty - Expceted result: " + expectedResult);
        console.log("getConversionRate Zero Qty - Actual result: " + result);
        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("should test getConversionRate of sell rate for zero quantity.", async function () {
        let expectedResult = sellPriceForZeroQuant(r, pMin, e0).mul(precision).valueOf()
        let amountWei = 0;
        let result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);
        console.log("getConversionRate Zero Qty - Expceted result: " + expectedResult);
        console.log("getConversionRate Zero Qty - Actual result: " + result);
        Helper.assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should test getConversionRate of buy rate for non zero quantity.", async function () {
        let deltaE = 2.7
        let expectedResult = priceForDeltaE(feePercent, r, pMin, deltaE, e0).mul(precision).valueOf()
        console.log("getConversionRate Zero Qty - Expceted result: " + expectedResult);
        let amountWei = new BigNumber(10).pow(18).mul(deltaE).round()
        let result = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);
        console.log("getConversionRate Zero Qty - Actual result: " + result);
        Helper.assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should test getConversionRate of sell rate for non zero quantity.", async function () {
        let deltaT = 120.0
        let expectedResult = priceForDeltaT(feePercent, r, pMin, deltaT, e0).mul(precision).valueOf()
        console.log("getConversionRate Zero Qty - Expceted result: " + expectedResult);
        let amountWei = new BigNumber(10).pow(tokenDecimals).mul(deltaT).round();
        let result = await reserveInst.getConversionRate(token.address, ethAddress, amountWei, currentBlock);
        console.log("getConversionRate Zero Qty - Actual result: " + result);
        Helper.assertAbsDiff(expectedResult, result, expectedDiffInPct);
    });

    it("should perform a series of buys and check: correct balances change, rates and fees as expected.", async function () {
        let prevBuyRate = 0;
        let amountEth, amountWei;
        let buyRate, expectedRate;
        let expectedUser1TweiAmount;
        let tradeActualTweiAmount;
        let expectedReserveTokenBalance;
        let expectedCollectedFeesDiff, collectedFeesInTokensDiff;
        let balancesBefore, balancesAfter;
        let iterations = 0;

        while (true) {
            iterations++;
            balancesBefore = await getBalances();
            amountEth = (!prevBuyRate) ? 2.9 : 2.9
            amountWei = new BigNumber(amountEth).mul(precision).round();

            // get expected and actual rate
            expectedRate = priceForDeltaE(feePercent, r, pMin, amountEth, balancesBefore["EInEth"]).mul(precision)
            buyRate = await reserveInst.getConversionRate(ethAddress, token.address, amountWei, currentBlock);

            // make sure buys are only ended when we are around 1/Pmax
            if (buyRate == 0) {
                let rateFor0 = await buyRateForZeroQuantInPrecision((balancesBefore["EInEth"]));
                let expectedMinRate = (new BigNumber(1).div(pMax)).mul(precision).round();
                let thresholdPriceexpectedDiffInPct = new BigNumber(10.0);
                Helper.assertAbsDiff(rateFor0, expectedMinRate, thresholdPriceexpectedDiffInPct);
            }

            // expect to eventually get 0 rate when tokens are depleted or rate is lower than min buy rate.
            if (buyRate == 0) {
                let expectedDestQty = calcDeltaT(r, pMin, amountEth, balancesBefore["EInEth"])
                assert(
                    (expectedDestQty < balancesBefore["TInTokens"]) ||
                    (new BigNumber(expectedRate).lt(minBuyRateInPrecision)).round(),
                    "got 0 rate without justification "
                )
                break;
            }
            Helper.assertAbsDiff(buyRate, expectedRate, expectedDiffInPct);

            // make sure prices (tokens/eth) are getting lower as tokens are depleted.
            if (!prevBuyRate) {
                prevBuyRate = buyRate;
            } else {
                assert(buyRate.lt(prevBuyRate));
                prevBuyRate = buyRate;
            }

            //perform trade
            await reserveInst.trade(ethAddress, amountWei, token.address, user1, buyRate, true, {from:network, value:amountWei});
            balancesAfter = await getBalances();

            // check reserve eth balance after the trade (got more eth) is as expected.
            expectedReserveBalanceWei = balancesBefore["EInWei"].add(amountWei);
            assert.equal(balancesAfter["EInWei"].valueOf(), expectedReserveBalanceWei.valueOf(), "bad reserve balance wei");

            // check token balance on user1 after the trade (got more tokens) is as expected.
            tradeExpectedTweiAmount = expectedRate.mul(amountWei).div(precision)
            expectedUser1TweiAmount = balancesBefore["User1Twei"].plus(tradeExpectedTweiAmount);
            Helper.assertAbsDiff(balancesAfter["User1Twei"], expectedUser1TweiAmount, expectedDiffInPct);

            // check reserve token balance after the trade (lost some tokens) is as expected.
            tradeActualTweiAmount = buyRate.mul(amountWei).div(precision)
            expectedReserveTokenBalance = balancesBefore["TInTwei"].sub(tradeActualTweiAmount);
            Helper.assertAbsDiff(balancesAfter["TInTwei"], expectedReserveTokenBalance, expectedDiffInPct);

            // check collected fees for this trade is as expected
            expectedCollectedFeesDiff = tradeActualTweiAmount.mul(feePercent / 100).div(tokenPrecision * ((100 - feePercent)/100));
            collectedFeesInTokensDiff = balancesAfter["collectedFeesInTokens"].sub(balancesBefore["collectedFeesInTokens"])
            Helper.assertAbsDiff(expectedCollectedFeesDiff, collectedFeesInTokensDiff, expectedDiffInPct);

            /* removed following test since now we allow putting bigger T0 than needed for calcs.
            // check amount of extra tokens is at least as collected fees
            if (feePercent != 0) {
                expectedTWithoutFees = await getExpectedTWithoutFees(balancesAfter["EInEth"]);
                expectedFeesAccordingToTheory = balancesAfter["TInTokens"].sub(expectedTWithoutFees);
                Helper.assertAbsDiff(balancesAfter["collectedFeesInTokens"], expectedFeesAccordingToTheory, expectedDiffInPct);
            };
            */
        };

        // make sure at least a few iterations were done
        assert(iterations > 3, "not enough iterations, bad run");
    });

    it("should perform a series of sells and check: correct balances change, rates and fees as expected.", async function () {
        let prevSellRate = 0;
        let iterations = 0;
        let amountTokens, amountTwei, amountTokensAfterFees;
        let expectedRate, expectedDestQty, sellRate;
        let balancesBefore, balancesAfter;

        //no need to transfer initial balance to user
        //in the full scenario. user approves network which collects the tokens and approves reserve
        //which collects tokens from network.
        //so here transfer tokens to network and approve allowance from network to reserve.
        let tx4InTwei = new BigNumber(t0).mul(4).mul(tokenPrecision).round();
        await token.transfer(network, tx4InTwei);

        while (true) {
            iterations++;
            balancesBefore = await getBalances();
            amountTokens = (!prevSellRate) ? 50000 : 50000
            amountTwei = new BigNumber(amountTokens).mul(tokenPrecision).round();
            amountTokensAfterFees = amountTokens * (100 - feePercent) / 100;

            // calculate expected qunatity
            expectedDestQty = calcDeltaE(r, pMin, amountTokensAfterFees, balancesBefore["EInEth"]) ;
            tradeExpectedWeiAmount = new BigNumber(expectedDestQty).mul(precision).abs().round();

            // get expected and actual rate
            expectedRate = priceForDeltaT(feePercent, r, pMin, amountTokens, balancesBefore["EInEth"]).mul(precision).valueOf();
            sellRate = await reserveInst.getConversionRate(token.address, ethAddress, '0x' + amountTwei.toString(16), currentBlock);

            // make sure sells are only ended when we are around Pmin
            if (sellRate == 0) {
                let rateFor0 = await sellRateForZeroQuantInPrecision(balancesBefore["EInEth"]);
                let expectedMinRate = new BigNumber(pMin).mul(precision).round();
                let thresholdPriceexpectedDiffInPct = new BigNumber(10.0);
                Helper.assertAbsDiff(rateFor0, expectedMinRate, thresholdPriceexpectedDiffInPct);
            }

            // expect to eventually get 0 rate eth is depleted or rate is less than min sell rate.
            if (sellRate == 0) {
                assert(
                    (expectedDestQty < balancesBefore["EInEth"]) ||
                    (new BigNumber(expectedRate).lt(minSellRateInPrecision)).round(),
                    "got 0 rate without justification "
                )
                break;
            }
            Helper.assertAbsDiff(sellRate, expectedRate, expectedDiffInPct);

            // make sure prices (the/token) are getting lower as ether is depleted.
            if (!prevSellRate) {
                prevSellRate = sellRate;
            } else {
                assert(sellRate.lt(prevSellRate));
                prevSellRate = sellRate;
            }

            //pre trade step, approve allowance from user to network.
            await token.approve(reserveInst.address, '0x' + amountTwei.toString(16), {from: network});
            await reserveInst.trade(token.address, '0x' + amountTwei.toString(16), ethAddress, user2, '0x' + sellRate.toString(16), true, {from:network});
            balancesAfter = await getBalances();

            // check reserve eth balance after the trade (reserve lost some eth) is as expected.
            expectedReserveBalanceWei = balancesBefore["EInWei"].sub(tradeExpectedWeiAmount);
            Helper.assertAbsDiff(balancesAfter["EInWei"], expectedReserveBalanceWei, expectedDiffInPct);

            //check token balance on network after the trade (lost some tokens) is as expected.
            expectedTweiAmount = balancesBefore["networkTwei"].sub(amountTwei);
            Helper.assertAbsDiff(balancesAfter["networkTwei"], expectedTweiAmount, expectedDiffInPct);

            //check reserve token balance after the trade (got some tokens) is as expected.
            expectedReserveTokenBalance = balancesBefore["TInTwei"].plus(amountTwei);
            Helper.assertAbsDiff(balancesAfter["TInTwei"], expectedReserveTokenBalance, expectedDiffInPct);

            // check collected fees for this trade is as expected
            expectedCollectedFeesDiff = amountTwei.mul(feePercent / 100).div(tokenPrecision);
            collectedFeesInTokensDiff = balancesAfter["collectedFeesInTokens"].sub(balancesBefore["collectedFeesInTokens"])
            Helper.assertAbsDiff(expectedCollectedFeesDiff, collectedFeesInTokensDiff, expectedDiffInPct);

            /* removed following test since now we allow putting bigger T0 than needed for calcs.
            // check amount of extra tokens is at least as collected fees
            if (feePercent != 0) {
                expectedTWithoutFees = await getExpectedTWithoutFees(balancesAfter["EInEth"]);
                expectedFeesAccordingToTheory = balancesAfter["TInTokens"].sub(expectedTWithoutFees);
                Helper.assertAbsDiff(balancesAfter["collectedFeesInTokens"], expectedFeesAccordingToTheory, expectedDiffInPct);
            };
            */
        };

        // make sure at least a few iterations were done
        assert(iterations > 3, "not enough iterations, bad run");
    });

    it("should check setting liquidity params again with new p0 and adjusting pmin and pmax to existing balances.", async function () {
        // assume price moved to 7/8 of current p0
        let newP0 = p0 * (7/8)
        let sameE0 = e0
        let sameT0 = t0

        // calculate new pmin and pmax to match the current price with existing inventory
        let newPmin = new BigNumber(newP0).div((Helper.exp(e, new BigNumber(r).mul(sameE0)))).round();
        let newpMax = new BigNumber((newP0 / (1 - r * newP0 * sameT0)).toString()).round();

        // set new params in contract units
        let newEInFp = new BigNumber(sameE0).mul(formulaPrecision).round();
        let newPMinInFp = new BigNumber(newPmin).mul(formulaPrecision).round();
        let newMaxSellRateInPrecision = new BigNumber(newpMax).mul(precision).round();
        let newMinSellRateInPrecision = new BigNumber(newPmin).mul(precision).round();

        // set liquidity params again.
        await liqConvRatesInst.setLiquidityParams(
                rInFp,
                newPMinInFp,
                formulaPrecisionBits,
                maxCapBuyInWei,
                maxCapSellInWei,
                feeInBps,
                newMaxSellRateInPrecision,
                newMinSellRateInPrecision)

        // check price is as expected
        let deltaE = 1.2
        let deltaEInFp = new BigNumber(deltaE).mul(formulaPrecision).round();

        let expectedResult = priceForDeltaE(feePercent, r, newPmin, deltaE, sameE0).mul(precision).valueOf()
        let result =  await liqConvRatesInst.buyRate(newEInFp, deltaEInFp)
        Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)

        // make sure collected fees are not zeroed
        let collectedFees = await liqConvRatesInst.collectedFeesInTwei()
        assert.notEqual(collectedFees, 0, "bad result");

    });

    it("should check getting prices for random values.", async function () {

        // changing values for this test
        let formulaPrecisionBitsOptions = {"standard": 40}
        let tokenDecimalsOptions = {"standard": 18, "like_dgx": 9, "like_btc:": 8, "small": 4}
        let rOptions = {"standard": 0.01,
                        "small_r": 0.001,
                        "large_r": 0.1}
        let pOptions = {"standard": 0.00023,
                        "low_value":0.0000067,
                        "high_price_comparing_to_eth": 0.2}
        let deltaEOptions = {"standard": 0.1, "small": 1/100000, "large": 10.0}

        for (let [key, randFormulaPrecisionBits] of Object.entries(formulaPrecisionBitsOptions)) {
            for (let [key, randTokenDecimals] of Object.entries(tokenDecimalsOptions)) {
                for (let [key, randR] of Object.entries(rOptions)) {
                    for (let [key, randP0] of Object.entries(pOptions)) {
                        for (let [key, randDeltaE] of Object.entries(deltaEOptions)) {

                            let randE0 = 69.315
                            let randT0 = 2329916.12
                            let randFormulaPrecision = new BigNumber(2).pow(randFormulaPrecisionBits)
                            let randMaxCapBuyInEth = 11.0
                            let randMaxCapSellInEth = 11.0
                            let randFeePercent = feePercent

                            let randPmin = new BigNumber(randP0).div((Helper.exp(e, new BigNumber(randR).mul(randE0)))).round();
                            let randPmax = new BigNumber((randP0 / (1 - randR * randP0 * randT0)).toString()).round();

                            let randDeltaEInFp = new BigNumber(randDeltaE).mul(formulaPrecision).round();
                            let randEInFp = new BigNumber(randE0).mul(randFormulaPrecision).round();
                            let randRInFp = new BigNumber(randR).mul(randFormulaPrecision).round();
                            let randPminInFp = new BigNumber(randPmin).mul(randFormulaPrecision).round();
                            let randMaxCapBuyInWei = new BigNumber(randMaxCapBuyInEth).mul(precision).round();
                            let randMaxCapSellInWei = new BigNumber(randMaxCapSellInEth).mul(precision).round();
                            let randFeeInBps = randFeePercent * 100
                            let randMaxSellRateInPrecision = new BigNumber(randPmax).mul(precision).round();
                            let randMinSellRateInPrecision = new BigNumber(randPmin).mul(precision).round();

                            let randToken = await TestToken.new("test", "tst", randTokenDecimals);
                            liqConvRatesInst = await LiquidityConversionRates.new(admin, randToken.address);
                            liqConvRatesInst.setReserveAddress(reserveAddress)

                            await liqConvRatesInst.setLiquidityParams(
                                    randRInFp,
                                    randPminInFp,
                                    randFormulaPrecisionBits,
                                    randMaxCapBuyInWei,
                                    randMaxCapSellInWei,
                                    randFeeInBps,
                                    randMaxSellRateInPrecision,
                                    randMinSellRateInPrecision)

                            let randQtyInSrcWei = new BigNumber(randDeltaE).mul(precision).round();

                            let result = await liqConvRatesInst.getRateWithE(
                                    randToken.address,
                                    true,
                                    randQtyInSrcWei,
                                    randEInFp);

                            let expectedResult = priceForDeltaE(
                                    randFeePercent,
                                    randR,
                                    randPmin,
                                    randDeltaE,
                                    randE0).mul(precision).valueOf()
                            Helper.assertAbsDiff(result, expectedResult, expectedDiffInPct)
                        }
                    }
                }
            }
        }
    });
});
