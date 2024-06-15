import React, { useEffect, useState } from "react";
import { View, Button, Text } from "tamagui";
import { createPublicClient, http, formatEther, Address } from "viem";
import { optimismSepolia } from "viem/chains";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { privateKeyToAccount } from "viem/accounts";

import { domain, types, FACTORY_ADDRESS, message } from "./data";

const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

export default function HomeScreen() {
  const [getAddress, setGetAddress] = useState();
  const [signature, setSignature] = useState();
  const [isValidSignature, setIsValidSignature] = useState();

  if (!process.env.EXPO_PUBLIC_PRIVATE_KEY) throw Error("Private key not set in .env");
  const account = privateKeyToAccount(`0x${process.env.EXPO_PUBLIC_PRIVATE_KEY}`);

  const signAndVerifyTypedDataEOA = async () => {
    const sig = await account.signTypedData({
      domain: domain,
      types: types,
      primaryType: "Mail",
      // @ts-ignore
      message: message,
    });
    // @ts-ignore
    setSignature(sig);

    const valid = await publicClient.verifyTypedData({
      address: account.address,
      domain: domain,
      types: types,
      primaryType: "Mail",
      message: message,
      signature: sig,
    });
    // @ts-ignore
    setIsValidSignature(valid);
  };

  const getDeterministicAddress = async () => {
    const data = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "getAddress",
      args: [["0x000000000000000000000000a5cc3c03994db5b0d9a5eedd10cabab0813678ac"], 0],
    });
    // @ts-ignore
    setGetAddress(data);
  };

  const signAndVerifyTypedData6492 = async () => {};

  useEffect(() => {
    // getDeterministicAddress();
    // signAndVerifyTypedDataEOA();
  }, [signature, getAddress, isValidSignature]);

  return (
    <View margin={10} style={{ display: "flex", textAlign: "center", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <View style={{ display: "flex", gap: "16px" }}>
        <Button
          onPress={() => {
            getDeterministicAddress();
            signAndVerifyTypedDataEOA();
          }}
          theme='active'>
          Sign Message with EOA
        </Button>
        <Text>Account: {String(account.address)}</Text>
        <Text>message: {JSON.stringify(message, null, 2)}</Text>
        <Text>Sig: {String(signature)}</Text>
        <Text>isValidSignature: {String(isValidSignature)}</Text>
        <Text>Deterministic Address: {getAddress}</Text>

        {/* <Button theme='active'>Sign Message with Passkey</Button> */}
      </View>
    </View>
  );
}
