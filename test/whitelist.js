let WhiteList = artifacts.require("./WhiteList.sol");

let admin;
let operator;
let user1;
let user2;

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

let whiteListInst;
let sgdToTomoRateInWei;
let defaultUserCapSgd = 1000;
let oneSgdToTomo = 1;

contract('WhiteList', function(accounts) {
    it("should init globals.", async function () {
        admin = accounts[0];
        operator = accounts[8];
        user1 = accounts[3];
        user2 = accounts[4];

        sgdToTomoRateInWei = (((new BigNumber(10)).pow(18)).mul(oneSgdToTomo));
        whiteListInst = await WhiteList.new(admin);
        await whiteListInst.addOperator(operator, {from: admin});
        await whiteListInst.setSgdToEthRate(sgdToTomoRateInWei, {from : operator});

        // set defaultUserCapSgd SGD cap for category 0 which is the default for all users.
        await whiteListInst.setCategoryCap(0, defaultUserCapSgd, {from : operator});
    });

    it("should verify the default cap for non set user.", async function () {
        let userCap = await whiteListInst.getUserCapInWei(user1);
        userCap = new BigNumber(userCap);
        let expectedUserCapWei = sgdToTomoRateInWei.mul(defaultUserCapSgd);
        assert.equal(userCap.toNumber(), expectedUserCapWei.toNumber(), "unexpected user cap");
    });

    it("should verify the cap for user with unique category.", async function () {
        await whiteListInst.setCategoryCap(17, 2000, {from : operator});
        await whiteListInst.setUserCategory(user2, 17, {from : operator});
        userCap = await whiteListInst.getUserCapInWei(user2);
        userCap = new BigNumber(userCap);
        let expectedUserCapWei = sgdToTomoRateInWei.mul(2000);
        assert.equal(userCap.toNumber(), expectedUserCapWei.toNumber(), "unexpected user cap");
    });

    it("should verify the cap for user with uninit category is 0.", async function () {
        await whiteListInst.setUserCategory(user2, 25, {from : operator});
        userCap = await whiteListInst.getUserCapInWei(user2);
        assert.equal(userCap, 0, "unexpected user cap");
    });

    it("should test when sgdtoWei not init, cap is always 0.", async function () {
        let whiteListInst2 = await WhiteList.new(admin);
        await whiteListInst2.addOperator(operator, {from: admin});
        //tests unset user
        userCap = await whiteListInst.getUserCapInWei(user2);
        assert.equal(0, userCap, "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setCategoryCap(17, 2000, {from : operator});
        await whiteListInst2.setUserCategory(user2, 17, {from : operator});
        userCap = await whiteListInst2.getUserCapInWei(user2);
        assert.equal(0, userCap, "unexpected user cap");
    });

    it("should test when no category is init, cap is always 0.", async function () {
        let whiteListInst2 = await WhiteList.new(admin);
        await whiteListInst2.addOperator(operator, {from: admin});

        //tests unset user
        userCap = await whiteListInst2.getUserCapInWei(user2);
        assert.equal(0, userCap, "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setUserCategory(user2, 17, {from : operator});
        userCap = await whiteListInst2.getUserCapInWei(user2);
        assert.equal(0, userCap, "unexpected user cap");
    });

    it("should test can't init this contract with empty addresses (address 0).", async function () {
        let list;

        try {
            list = await WhiteList.new('0x0000000000000000000000000000000000000000');
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        list = await WhiteList.new(admin);
    });
});
