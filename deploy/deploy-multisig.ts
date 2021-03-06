import { utils, Wallet, Provider, EIP712Signer } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Eip712Meta } from "zksync-web3/build/src/types";

// Put the address of your AA factory
const AA_FACTORY_ADDRESS = '0xa0eD7885B408961430F89d797cD1cc87530D8fBe'

// An example of a deploy script that will deploy and call a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
    const provider = new Provider(hre.config.zkSyncDeploy.zkSyncNetwork);
    const wallet = (new Wallet("<PRIVATE-KEY>")).connect(provider);
    const factoryArtifact = await hre.artifacts.readArtifact('AAFactory');

    const aaFactory = new ethers.Contract(
        AA_FACTORY_ADDRESS,
        factoryArtifact.abi, 
        wallet
    );

    // The two owners of the multisig
    const owner1 = Wallet.createRandom();
    const owner2 = Wallet.createRandom();

    // For the simplicity of the tutorial, we will use zero hash as salt
    const salt =  ethers.constants.HashZero;
    
    const tx = await aaFactory.deployAccount(
        salt,
        owner1.address,
        owner2.address
    );
    await tx.wait();

    // Getting the address of the deployed contract
    const abiCoder = new ethers.utils.AbiCoder();
    const multisigAddress = utils.create2Address(
        AA_FACTORY_ADDRESS,
        await aaFactory.aaBytecodeHash(),
        salt,
        abiCoder.encode(['address','address'], [owner1.address, owner2.address])
    );
    console.log(`Multisig deployed on address ${multisigAddress}`);

    await (await wallet.sendTransaction({
        to: multisigAddress,
        value: ethers.utils.parseEther('0.0001')
    })).wait();

    let aaTx = await aaFactory.populateTransaction.deployAccount(
        salt,
        Wallet.createRandom().address,
        Wallet.createRandom().address
    );
    const gasLimit = await provider.estimateGas(aaTx);
    const gasPrice =  await provider.getGasPrice();

    aaTx = {
        ...aaTx,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
        chainId: (await provider.getNetwork()).chainId,
        nonce: await provider.getTransactionCount(multisigAddress),
        type: 113,
        customData: {
            ergsPerPubdata: '1',
            feeToken: utils.ETH_ADDRESS
        } as Eip712Meta,
        value: ethers.BigNumber.from(0)
    }
    const signedTxHash = EIP712Signer.getSignedDigest(aaTx);

    const signature = ethers.utils.concat([
        // Note, that `signMessage` wouldn't work here, since we don't want
        // the signed hash to be prefixed with `\x19Ethereum Signed Message:\n`
        ethers.utils.joinSignature(owner1._signingKey().signDigest(signedTxHash)),
        ethers.utils.joinSignature(owner2._signingKey().signDigest(signedTxHash))
    ])

    aaTx.customData = {
        ...aaTx.customData,
        aaParams: {
            from: multisigAddress,
            signature
        }
    };

    console.log(`The multisig's nonce before the first tx is ${await provider.getTransactionCount(multisigAddress)}`);
    const sentTx = await provider.sendTransaction(utils.serialize(aaTx));
    await sentTx.wait();

    // Checking that the nonce for the account has increased
    console.log(`The multisig's nonce after the first tx is ${await provider.getTransactionCount(multisigAddress)}`);
}
