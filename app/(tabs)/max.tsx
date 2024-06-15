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
} from "viem";
import { optimismSepolia } from "viem/chains";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { privateKeyToAccount } from "viem/accounts";
import {
  domain,
  types,
  FACTORY_ADDRESS,
  message,
  ERC6492_DETECTION_SUFFIX,
} from "./data";

const coinbaseSignatureWrapperAbi = [
  {
    components: [
      { name: "ownerIndex", type: "uint256" },
      { name: "signatureData", type: "bytes" },
    ],
    name: "SignatureWrapper",
    type: "tuple",
  },
];

const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

const eoaAccount = privateKeyToAccount(
  `0x${process.env.EXPO_PUBLIC_PRIVATE_KEY}`
);

const encodedEoaAccount = encodeAbiParameters(
  [{ name: "account", type: "address" }],
  [eoaAccount.address]
);

const createAccountInitData: Hash = encodeFunctionData({
  abi: CoinbaseSmartWalletFactoryAbi,
  functionName: "createAccount",
  args: [[encodedEoaAccount], 0],
});

async function getPreDeployAccountAddress(): Promise<Hex> {
  const data = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: CoinbaseSmartWalletFactoryAbi,
    functionName: "getAddress",
    args: [[encodedEoaAccount], 0],
  });
  return data as Hex;
}

// NOTE for meek. the passkey version of this function should be called:
// prepare6492AccountSigUsingPasskeySigner
async function prepare6492AccountSigUsingEoa712Signer(): Promise<Hash> {
  const eoa712Signature: Hex = await eoaAccount.signTypedData({
    account: eoaAccount.address,
    domain: domain,
    types: types,
    primaryType: "Mail",
    // @ts-ignore
    // NOTE FOR MEEK: this message might be formatted incorrectly due to what
    // coonbase account safeHashReplay requires. im not sure
    message: message,
  });
  const encodedSignatureWrapper: Hash = encodeAbiParameters(
    coinbaseSignatureWrapperAbi,
    [0, eoa712Signature] // owner index, signatureData
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

  return sigFor6492Account;
}

export default function HomeScreen() {
  type Results = {
    eoaSigner: Address;
    preDeployAccount: Address;
    message: any;
    signature: Hash;
    wasSigValid: boolean;
  };

  const [
    resultsFrom6492AccountSigUsingEoa712Signer,
    setResultsFrom6492AccountSigUsingEoa712Signer,
  ] = useState<Results>();
  if (!process.env.EXPO_PUBLIC_PRIVATE_KEY)
    throw Error("Private key not set in .env");

  // NOTE for meek: the passkey version of this function should be called
  // signAndValidate6492AccountSigUsingPasskeySigner
  async function signAndValidate6492AccountSigUsingEoa712Signer() {
    const preDeployAccountAddress = await getPreDeployAccountAddress();
    const sigFor6492Account = await prepare6492AccountSigUsingEoa712Signer();
    const was6492SigValid = await publicClient.verifyTypedData({
      address: preDeployAccountAddress,
      domain: domain,
      types: types,
      primaryType: "Mail",
      message: message,
      signature: sigFor6492Account,
    });

    const resultStruct = {
      eoaSigner: eoaAccount.address,
      preDeployAccount: preDeployAccountAddress,
      message: message,
      signature: sigFor6492Account,
      wasSigValid: was6492SigValid,
    };

    setResultsFrom6492AccountSigUsingEoa712Signer(resultStruct);
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
        <Button onPress={() => signAndValidate6492AccountSigUsingEoa712Signer()} theme='active'>
          Sign Message with EOA For 6492 Account
        </Button>
        <Text>
          Eoa Signer: {resultsFrom6492AccountSigUsingEoa712Signer?.eoaSigner}
        </Text>
        <Text>
          6492 Account:{" "}
          {resultsFrom6492AccountSigUsingEoa712Signer?.preDeployAccount}
        </Text>
        <Text>
          Message:{" "}
          {JSON.stringify(
            resultsFrom6492AccountSigUsingEoa712Signer?.message,
            null,
            2
          )}
        </Text>
        <Text>
          Signature: {resultsFrom6492AccountSigUsingEoa712Signer?.signature}
        </Text>
        <Text>
          Sig Validity:{" "}
          {resultsFrom6492AccountSigUsingEoa712Signer?.wasSigValid}
        </Text>

        {/* <Button theme="active">Sign Message with Passkey</Button> */}
      </View>
    </View>
  );
}
