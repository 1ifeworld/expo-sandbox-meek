import React, { useState } from "react";
import { View, Button, Text } from "tamagui";
import {
  createPublicClient,
  http,
  Address,
  Hex,
  Hash,
  encodeAbiParameters,
  concat,
  encodeFunctionData,
  parseAbi,
  hashMessage,
} from "viem";
import { optimismSepolia } from "viem/chains";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import {
  CoinbaseSmartWallet,
  coinbaseSignatureWrapperAbi,
} from "../abi/CoinbaseSmartWallet";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { FACTORY_ADDRESS, ERC6492_DETECTION_SUFFIX } from "./data";
import { SigningKey } from "ethers";

const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

const eoaAccount = privateKeyToAccount(
  `0x${process.env.EXPO_PUBLIC_PRIVATE_KEY}`
);

const ethersSigner = new SigningKey(`0x${process.env.EXPO_PUBLIC_PRIVATE_KEY}`);

function getEncodedEoaAccount(eoaAccount: Address) {
  return encodeAbiParameters(
    [{ name: "account", type: "address" }],
    [eoaAccount]
  );
}

async function getPreDeployAccountAddress(owners: Hash[]): Promise<Hex> {
  const data = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: CoinbaseSmartWalletFactoryAbi,
    functionName: "getAddress",
    args: [owners, 0],
  });
  return data as Hex;
}

function getCreateAccountInitData(accountOwners: Hash[]) {
  return encodeFunctionData({
    abi: CoinbaseSmartWalletFactoryAbi,
    functionName: "createAccount",
    args: [accountOwners, 0],
  });
}

async function getSafeHash({
  ownersForPreDeployAcct,
  preDeployAcct,
  startingHash,
}: {
  ownersForPreDeployAcct: Hash[];
  preDeployAcct: Address;
  startingHash: Hash;
}): Promise<Hash> {
  const data = await publicClient.readContract({
    // Address of the Smart Account deployer (factory).
    factory: FACTORY_ADDRESS,
    // Function to execute on the factory to deploy the Smart Account.
    factoryData: encodeFunctionData({
      abi: parseAbi(["function createAccount(bytes[] owners, uint256 nonce)"]),
      functionName: "createAccount",
      args: [ownersForPreDeployAcct, 0n],
    }),
    // Function to call on the Smart Account.
    abi: CoinbaseSmartWallet,
    address: preDeployAcct,
    functionName: "replaySafeHash",
    args: [startingHash],
  });
  return data;
}

// NOTE for meek. the passkey version of this function should be called:
// prepare6492SiweSigWithPasskeyigner
async function prepare6492SiweSigWithEoaSigner(
  accountToSignFor: Address,
  accountToSignForEncodedOwners: Hash[]
): Promise<{
  unhashedSiweMessage: string;
  replaySafeHash: string;
  siweSig: Hash;
}> {
  const unhashedSiweMessage = createSiweMessage({
    address: accountToSignFor,
    chainId: optimismSepolia.id,
    domain: "example.com",
    nonce: generateSiweNonce(),
    uri: "https://example.com/path",
    version: "1",
  });
  const hashedSiweMessage = hashMessage(unhashedSiweMessage);
  const replaySafeHash = await getSafeHash({
    ownersForPreDeployAcct: accountToSignForEncodedOwners,
    preDeployAcct: accountToSignFor,
    startingHash: hashedSiweMessage,
  });
  // Use ethers signer to sign safeHash without adding eth-sign prefix
  const siweSig = ethersSigner.sign(replaySafeHash).serialized as Hex;
  //
  const encodedSignatureWrapper: Hash = encodeAbiParameters(
    coinbaseSignatureWrapperAbi,
    [{ ownerIndex: BigInt(0), signatureData: siweSig }] // owner index, signatureData
  );
  // generate account init data
  const createAccountInitData = getCreateAccountInitData(
    accountToSignForEncodedOwners
  );

  const sigFor6492Account: Hash = concat([
    encodeAbiParameters(
      [
        { name: "smartAccountFactory", type: "address" },
        { name: "createAccountInitData", type: "bytes" },
        { name: "encodedSigWrapper", type: "bytes" },
      ],
      [FACTORY_ADDRESS, createAccountInitData, encodedSignatureWrapper]
    ),
    ERC6492_DETECTION_SUFFIX,
  ]);
  return {
    unhashedSiweMessage: unhashedSiweMessage,
    replaySafeHash: replaySafeHash,
    siweSig: sigFor6492Account,
  };
}

export default function HomeScreen() {
  type Results = {
    eoaSigner: Address;
    preDeployAccount: Address;
    message: any;
    signature: Hash;
    wasSigValid: string;
  };

  const [
    resultsFrom6492AccountSiweSigUsingEoaSigner,
    setResultsFrom6492AccountSiweSigUsingEoaSigner,
  ] = useState<Results>();
  if (!process.env.EXPO_PUBLIC_PRIVATE_KEY)
    throw Error("Private key not set in .env");

  // NOTE for meek: the passkey version of this function should be called
  // signAndValidate6492AccountSigUsingPasskeySigner
  async function signAndValidate6492AccountSiweSigUsingEoaSigner() {
    const encodedEoaAccount = getEncodedEoaAccount(eoaAccount.address);
    const preDeployAccountOwners = [encodedEoaAccount];
    const preDeployAccountAddress = await getPreDeployAccountAddress(
      preDeployAccountOwners
    );
    const { unhashedSiweMessage, siweSig } =
      await prepare6492SiweSigWithEoaSigner(
        preDeployAccountAddress,
        preDeployAccountOwners
      );
    const was6492SiweSigValid = await publicClient.verifySiweMessage({
      address: preDeployAccountAddress,
      message: unhashedSiweMessage,
      signature: siweSig,
    });
    const resultStruct = {
      eoaSigner: eoaAccount.address,
      preDeployAccount: preDeployAccountAddress,
      message: unhashedSiweMessage,
      signature: siweSig,
      wasSigValid: was6492SiweSigValid.toString(),
    };

    setResultsFrom6492AccountSiweSigUsingEoaSigner(resultStruct);
  }

  return (
    <View
      margin={10}
      style={{
        display: "flex",
        textAlign: "center",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      <View style={{ display: "flex", gap: "16px" }}>
        <Button
          onPress={() => signAndValidate6492AccountSiweSigUsingEoaSigner()}
          theme="active"
        >
          Sign Message with EOA For 6492 Account
        </Button>
        <Text>
          Eoa Signer: {resultsFrom6492AccountSiweSigUsingEoaSigner?.eoaSigner}
        </Text>
        <Text>
          6492 Account:{" "}
          {resultsFrom6492AccountSiweSigUsingEoaSigner?.preDeployAccount}
        </Text>
        <Text>
          Message:{" "}
          {JSON.stringify(
            resultsFrom6492AccountSiweSigUsingEoaSigner?.message,
            null,
            2
          )}
        </Text>
        <Text>
          Signature:{" "}
          {`${resultsFrom6492AccountSiweSigUsingEoaSigner?.signature.slice(
            0,
            20
          )}...${resultsFrom6492AccountSiweSigUsingEoaSigner?.signature.slice(
            -20
          )}
          `}
        </Text>
        <Text>
          Sig Validity:{" "}
          {resultsFrom6492AccountSiweSigUsingEoaSigner?.wasSigValid}
        </Text>

        {/* <Button theme="active">Sign Message with Passkey</Button> */}
      </View>
    </View>
  );
}