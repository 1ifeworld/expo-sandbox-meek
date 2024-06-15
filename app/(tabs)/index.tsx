import React, { useEffect, useState } from "react";
import { Heading, View, Button, Text } from "tamagui";
import { createPublicClient, http, formatEther, Address } from "viem";
import { mainnet } from "viem/chains";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { privateKeyToAccount } from "viem/accounts";

import { domain, types } from "./data";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

export default function HomeScreen() {
  const [blockNumber, setBlockNumber] = useState(0n);
  const [gasPrice, setGasPrice] = useState(0n);
  const [getAddress, setGetAddress] = useState();
  const [signature, setSignature] = useState();
  const [isValidSignature, SetIsValidSignature] = useState();

  if (!process.env.EXPO_PUBLIC_PRIVATE_KEY) throw Error("Private key not set in .env");
  const account = privateKeyToAccount(`0x${process.env.EXPO_PUBLIC_PRIVATE_KEY}`);

  const signMessage = async () => {
    const sig = await account.signTypedData({
      domain,
      types: {
        Person: [
          { name: "name", type: "string" },
          { name: "wallet", type: "address" },
        ],
        Mail: [
          { name: "from", type: "Person" },
          { name: "to", type: "Person" },
          { name: "contents", type: "string" },
        ],
      },
      primaryType: "Mail",
      message: {
        from: {
          name: "Cow",
          wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826",
        },
        to: {
          name: "Bob",
          wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        },
        contents: "Hello, Bob!",
      },
    });
    // @ts-ignore
    setSignature(sig);
    console.log(sig);
    const valid = await publicClient.verifyTypedData({
      address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      domain: {
        name: "Ether Mail",
        version: "1",
        chainId: 1,
        verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
      },
      types: {
        Person: [
          { name: "name", type: "string" },
          { name: "wallet", type: "address" },
        ],
        Mail: [
          { name: "from", type: "Person" },
          { name: "to", type: "Person" },
          { name: "contents", type: "string" },
        ],
      },
      primaryType: "Mail",
      message: {
        from: {
          name: "Cow",
          wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826",
        },
        to: {
          name: "Bob",
          wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        },
        contents: "Hello, Bob!",
      },
      signature: sig,
    });
    // @ts-ignore
    SetIsValidSignature(valid);
    return String(sig);
  };

  const results = {
    address: "0x0001",
    message: "Hello, 👋🏾",
  };
  // signMessage();
  return (
    <View margin={10} style={{ display: "flex", textAlign: "center", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <View style={{ display: "flex", gap: "16px" }}>
        <Button onClick={() => signMessage()} theme='active'>
          Sign Message with EOA
        </Button>
        <Text>Account: {String(account.address)}</Text>
        <Text>isValidSignature: {String(isValidSignature)}</Text>
        <Text>Sig: {String(signature)}</Text>

        <Button theme='active'>Sign Message with Passkey</Button>
      </View>
    </View>
  );
}
