const Liquidity = artifacts.require("./LiquidityFormula.sol");

const Helper = require("./helper.js");
const BigNumber = require('bignumber.js');

const e = new BigNumber('2.7182818284590452353602874713527');
const expectedDiffInPct = new BigNumber(1/100);

let liquidityContract;

contract('LiquidityFormula', function(accounts) {
    it("deploy liquidity contract", async function () {
        liquidityContract = await Liquidity.new();
    });

    it("check checkMultOverflow", async function () {
        const big = new BigNumber(2).pow(128);
        const bigNum = "0x" + big.toString(16);
        const small = new BigNumber(2).pow(100);
        const smallNum = "0x" + small.toString(16);

        let overflow;
        overflow = await liquidityContract.checkMultOverflow(bigNum,bigNum);
        assert( overflow, "big * big should overflow");

        overflow = await liquidityContract.checkMultOverflow(smallNum,bigNum);
        assert( !overflow, "big * small should not overflow");

        overflow = await liquidityContract.checkMultOverflow(0, bigNum);
        assert( !overflow, "0 * big should not overflow");

        overflow = await liquidityContract.checkMultOverflow(bigNum, 0);
        assert( !overflow, "big * 0 should not overflow");
    });

    it("check exp with fixed input", async function () {
        const precisionBits = 20;
        const precision = new BigNumber(2).pow(precisionBits);
        const q = new BigNumber(precision.mul(precision).round());
        const p = new BigNumber(new BigNumber('121').mul(q.div(2**3)).round());

        const expectedResult = Helper.exp(e,new BigNumber(p).div(q)).mul(precision);
        // console.log("EXP: Expected Result: " + expectedResult);
        const result = await liquidityContract.exp(p,q,precision);
        // console.log("EXP: Actual Result: " + result);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check ln with fixed input", async function () {
        const precisionBits = 20;
        const precision = new BigNumber(2).pow(precisionBits);
        const q = new BigNumber(precision.mul(precision).round());
        const p = new BigNumber(new BigNumber('1245651').mul(q.div(2**3)).round());

        const expectedResult = Helper.ln(new BigNumber(p).div(q)).mul(precision);
        // console.log("Ln: Expected Result: " + expectedResult);
        const result = await liquidityContract.ln(p,q,precisionBits);
        // console.log("Ln: Actual Result: " + result);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check P(E) with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BigNumber(2).pow(precisionBits);
        const E = new BigNumber('45.2352');
        const r = new BigNumber('0.02');
        const Pmin = new BigNumber('0.0123');

        // P(E) = Pmin * e^(rE)
        const expectedResult = Helper.exp(e,r.mul(E)).mul(Pmin).mul(precision);
        // console.log("P(E): Expected Result: " + expectedResult);
        const result = await liquidityContract.pE(new BigNumber(r.mul(precision).round()),
                                                  new BigNumber(Pmin.mul(precision).round()),
                                                  new BigNumber(E.mul(precision).round()),
                                                  precision);
        // console.log("P(E): Actual Result: " + result);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);
    });

    it("check deltaT with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BigNumber(2).pow(precisionBits);
        const E = new BigNumber('69.3147180559');
        const deltaE = new BigNumber('10');
        const r = new BigNumber('0.01');
        const Pmin = new BigNumber('0.000025');


        const pe = Helper.exp(e,r.mul(E)).mul(Pmin).mul(precision);
        const pdelta = (Helper.exp(e,r.mul(deltaE).mul(-1)).sub(1)).mul(precision);
        // console.log("DeltaT: pe " + pe);
        // console.log("DeltaT: pdelta " + pdelta);

        const expectedResult = pdelta.div(pe.mul(r)).mul(precision).mul(-1);
        // console.log("DeltaT: Expected Result: " + expectedResult);
        const result = await liquidityContract.deltaTFunc(new BigNumber(r.mul(precision).round()),
                                                          new BigNumber(Pmin.mul(precision).round()),
                                                          new BigNumber(E.mul(precision).round()),
                                                          deltaE.mul(precision),
                                                          precision);
        // console.log("DeltaT: Actual Result: " + result);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);

        /* Helper.assertAbsDiff(expectedResult2,result2,expectedDiffInPct) */
    });

    it("check deltaE with fixed input", async function () {
        const precisionBits = 30;
        const precision = new BigNumber(2).pow(precisionBits);
        const E = new BigNumber('69.3147180559');
        const deltaT = new BigNumber('10.123').mul(10000);
        const r = new BigNumber('0.01');
        const Pmin = new BigNumber('0.000025');


        const pe = Helper.exp(e,r.mul(E)).mul(Pmin);
        const lnPart = Helper.ln((r.mul(deltaT).mul(pe)).add(1));
        const expectedResult = (lnPart.div(r)).mul(precision);
        // console.log("DetalE: Expected Result: " + expectedResult);
        const result = await liquidityContract.deltaEFunc(new BigNumber(r.mul(precision).round()),
                                                          new BigNumber(Pmin.mul(precision).round()),
                                                          new BigNumber(E.mul(precision).round()),
                                                          deltaT.mul(precision),
                                                          precision,
                                                          precisionBits);
        // console.log("DeltaE: Actual Result: " + result);

        Helper.assertAbsDiff(expectedResult,result,expectedDiffInPct);

        /* Helper.assertAbsDiff(expectedResult2,result2,expectedDiffInPct; */
    });


});
