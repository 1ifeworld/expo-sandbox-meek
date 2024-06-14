import React, { useEffect, useState } from "react";
import { Heading, View, Button, Text } from "tamagui";
import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

export default function HomeScreen() {
  const [blockNumber, setBlockNumber] = useState(0n);
  const [gasPrice, setGasPrice] = useState(0n);

  useEffect(() => {
    const getNetworkData = async () => {
      const [blockNumber, gasPrice] = await Promise.all([publicClient.getBlockNumber(), publicClient.getGasPrice()]);

      setBlockNumber(blockNumber);
      setGasPrice(gasPrice);
    };

    getNetworkData();
  }, []);

  const results = {
    address: "0x0001",
    message: "Hello, 👋🏾",
  };
  return (
    <View margin={10} style={{ display: "flex", textAlign: "center", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <View style={{ display: "flex", gap: "16px" }}>
        <Button theme='active'>Sign Message with EOA</Button>
        {blockNumber && <Text>Block number: {String(blockNumber)}</Text>}
        <Text>Gas price: {formatEther(gasPrice)} ETH </Text>
        <Text>address: {results.address}</Text>
        <Text>message: {results.message}</Text>
        <Button theme='active'>Sign Message with Passkey</Button>
      </View>
    </View>
  );
}
