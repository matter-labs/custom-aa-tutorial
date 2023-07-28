import { HardhatUserConfig } from "hardhat/config";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";

import "@matterlabs/hardhat-zksync-verify";

const zkSyncTestnet =
  process.env.NODE_ENV == "test"
    ? {
        url: "http://localhost:3050",
        ethNetwork: "http://localhost:8545",
        zksync: true,
      }
    : {
        url: "https://zksync2-testnet.zksync.dev",
        ethNetwork: "goerli",
        zksync: true,
      };

console.log("zkSyncTestnet", zkSyncTestnet);

const config: HardhatUserConfig = {
  zksolc: {
    version: "latest", // Uses latest available in https://github.com/matter-labs/zksolc-bin/
    settings: {
      isSystem: true, // make sure to include this line
    },
  },
  defaultNetwork: "zkSyncTestnet",
  networks: {
    hardhat: {
      // @ts-ignore
      zksync: true,
    },
    zkSyncTestnet,
  },
  solidity: {
    version: "0.8.17",
  },
};

export default config;