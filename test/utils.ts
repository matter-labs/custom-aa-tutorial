import { Wallet } from "zksync-web3";
import * as ethers from "ethers";

export function logCyan(message: string) {
  console.log("\x1b[36m%s\x1b[0m", "          > " + message);
}

export async function sendFunds(wallet: Wallet, multisigAddress: string, sendAmount: ethers.ethers.BigNumber) {
  await (
    await wallet.sendTransaction({
      to: multisigAddress,
      // You can increase the amount of ETH sent to the multisig
      value: sendAmount,
    })
  ).wait();
}