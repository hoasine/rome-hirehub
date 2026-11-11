// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Test-only ERC-20 used by the HireHub engagement suite.
contract MockToken {
    string public constant name = "HireHub Test USD";
    string public constant symbol = "hUSD";
    uint8 public constant decimals = 6;
    uint256 public feeBps;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setFeeBps(uint256 nextFeeBps) external {
        feeBps = nextFeeBps;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 available = allowance[from][msg.sender];
        require(available >= amount, "allowance");
        allowance[from][msg.sender] = available - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "balance");
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        emit Transfer(from, to, amount - fee);
    }
}
