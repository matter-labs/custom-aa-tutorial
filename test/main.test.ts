import { expect } from "chai";
import * as ethers from "ethers";
import { utils, Wallet, Provider, Contract, EIP712Signer, types } from "zksync-web3";
import * as hre from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { ZkSyncArtifact } from "@matterlabs/hardhat-zksync-deploy/dist/types";
import { logCyan, sendFunds } from "./utils";

const RICH_WALLET_PK = "0x3eb15da85647edd9a1159a4a13b9e7c56877c4eb33f614546d4db06a51868b1c";

describe("Tests for Factory Multisig AA", function () {
  const DEFAULT_ADDRESS = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
  let aaFactoryAddress = DEFAULT_ADDRESS;
  let multisigAddress = DEFAULT_ADDRESS;
  let provider: Provider;
  let wallet: Wallet;
  let deployer: Deployer;
  let factoryArtifact: ZkSyncArtifact;
  let multisigArtifact: ZkSyncArtifact;
  let msOwner1: Wallet;
  let msOwner2: Wallet;

  before(async function () {
    provider = Provider.getDefaultProvider();
    wallet = new Wallet(RICH_WALLET_PK, provider);
    deployer = new Deployer(hre, wallet);
    factoryArtifact = await deployer.loadArtifact("AAFactory");
    multisigArtifact = await deployer.loadArtifact("TwoUserMultisig");
    msOwner1 = Wallet.createRandom();
    msOwner2 = Wallet.createRandom();
  });

  it("Should deploy factory", async function () {
    logCyan("Deploying AA factory");
    // Getting the bytecodeHash of the account
    const bytecodeHash = utils.hashBytecode(multisigArtifact.bytecode);
    const factory = await deployer.deploy(factoryArtifact, [bytecodeHash], undefined, [
      multisigArtifact.bytecode,
    ]);
    logCyan(`AA factory address: ${factory.address}`);
    aaFactoryAddress = factory.address;
    expect(aaFactoryAddress).to.not.equal(DEFAULT_ADDRESS);
  });

  it("Should deploy multisig by factory and signers sign trx be valid", async function () {
    const aaFactory = new ethers.Contract(aaFactoryAddress, factoryArtifact.abi, wallet);

    // For the simplicity, we will use zero hash as salt
    const salt = ethers.constants.HashZero;

    // deploy account owned by owner1 & owner2
    const tx = await aaFactory.deployAccount(salt, msOwner1.address, msOwner2.address);
    await tx.wait();

    // Getting the address of the deployed contract account,
    // this reserves an address future-proof: https://era.zksync.io/docs/api/js/utils.html#create2address
    // Always use the JS utility methods
    const abiCoder = new ethers.utils.AbiCoder();
    multisigAddress = utils.create2Address(aaFactoryAddress, await aaFactory.aaBytecodeHash(), salt, abiCoder.encode(["address", "address"], [msOwner1.address, msOwner2.address]));
    expect(multisigAddress).to.not.equal(DEFAULT_ADDRESS);
    logCyan(`Multisig account address ${multisigAddress}`);

    // Send funds to the multisig account we just deployed
    logCyan("Sending funds to multisig account");
    const sendAmount = ethers.utils.parseEther("0.008");
    await sendFunds(wallet, multisigAddress, sendAmount);
    let multisigBalance = await provider.getBalance(multisigAddress);
    expect(multisigBalance.toString()).to.equal(sendAmount.toString());
    logCyan(`Multisig account balance is ${multisigBalance.toString()}`);

    // Transaction to deploy a new account to the multisig we just deployed
    let aaTx = await aaFactory.populateTransaction.deployAccount(
      salt,
      Wallet.createRandom().address,
      Wallet.createRandom().address
    );
    const gasLimit = await provider.estimateGas(aaTx);
    const gasPrice = await provider.getGasPrice();
    aaTx = {
      ...aaTx,
      // deploy a new account using the multisig
      from: multisigAddress,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
      chainId: (await provider.getNetwork()).chainId,
      nonce: await provider.getTransactionCount(multisigAddress),
      type: 113,
      customData: {
        gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
      } as types.Eip712Meta,
      value: ethers.BigNumber.from(0),
    };
    const signedTxHash = EIP712Signer.getSignedDigest(aaTx);
    const signature = ethers.utils.concat([
      // Note, that `signMessage` wouldn't work here, since we don't want
      // the signed hash to be prefixed with `\x19Ethereum Signed Message:\n`
      ethers.utils.joinSignature(msOwner1._signingKey().signDigest(signedTxHash)),
      ethers.utils.joinSignature(msOwner2._signingKey().signDigest(signedTxHash)),
    ]);
    aaTx.customData = {
      ...aaTx.customData,
      customSignature: signature,
    };
    logCyan(`The multisig's nonce before the first tx is ${await provider.getTransactionCount(multisigAddress)}`);
    const sentTx = await provider.sendTransaction(utils.serialize(aaTx));
    await sentTx.wait();

    // Checking that the nonce for the account has increased
    logCyan(`The multisig's nonce after the first tx is ${await provider.getTransactionCount(multisigAddress)}`);
    multisigBalance = await provider.getBalance(multisigAddress);
    logCyan(`Multisig account balance is now ${multisigBalance.toString()}`);
  });
});