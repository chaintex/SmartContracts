pragma solidity 0.4.25;


import "./TRC20Interface.sol";
import "./PermissionGroups.sol";


/**
 * @title Contracts that should be able to recover tokens or tomos
 */
contract Withdrawable is PermissionGroups {

    event TokenWithdraw(TRC20 token, uint amount, address sendTo);

    /**
     * @dev Withdraw all TRC20 compatible tokens
     * @param token TRC20 The address of the token contract
     */
    function withdrawToken(TRC20 token, uint amount, address sendTo) external onlyAdmin {
        require(token.transfer(sendTo, amount));
        emit TokenWithdraw(token, amount, sendTo);
    }

    event TomoWithdraw(uint amount, address sendTo);

    /**
     * @dev Withdraw Tomos
     */
    function withdrawTomo(uint amount, address sendTo) external onlyAdmin {
        sendTo.transfer(amount);
        emit TomoWithdraw(amount, sendTo);
    }
}
