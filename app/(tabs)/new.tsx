import React, { useState } from "react";
import { View, Button, Text } from "tamagui";
import {
  Hex,
  Address,
  createPublicClient,
  http,
  PublicClient,
  Hash,
  hashMessage,
  toHex,
  hexToBytes,
  hexToBigInt,
} from "viem";
import { optimismSepolia } from "viem/chains";
import {
  extractPublicKey,
  createCredentialDefaultArgs,
  getSafeHash,
} from "@/helpers";
import { FACTORY_ADDRESS } from "../ethereum";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { secp256r1 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";

export default function HomeScreen() {
  /*
   *
   * PUBLIC_CLIENT + STATE + VARIABLES
   *
   */

  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: http(),
  });

  const [stateCredential, setStateCredential] = useState<Credential>();

  const publicKey: { x: Hex; y: Hex } | null = !stateCredential
    ? null
    : extractPublicKey(stateCredential);

  const encodedOwner: Hash | null = !publicKey
    ? null
    : `0x${publicKey.x.slice(2)}${publicKey.y.slice(2)}`;

  /*
   *
   * CREATE PASSKEY
   *
   */    

  async function handleCreateCredential() {
    const credential = await navigator.credentials.create(
      // @ts-ignore
      createCredentialDefaultArgs
    );
    if (!credential) {
      console.log("create cred failed");
      return;
    }
    setStateCredential(credential);
  }

  /*
   *
   * SIGN WITH PASSKEY
   *
   */      

  async function handleSignForCredential() {
    if (!publicKey || !encodedOwner) return;
    const data = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "getAddress",
      args: [[encodedOwner], BigInt(0)],
    });
    const undeployedSmartAccountAddress = data as Address;
    const unhashedMessage = new Uint8Array([0x8c, 0x0a]).buffer;
    const hashedMessage = hashMessage(toHex(new Uint8Array(unhashedMessage)));
    const replaySafeHash = await getSafeHash({
      publicClient: publicClient as PublicClient,
      ownerForPreDeployAcct: encodedOwner,
      preDeployAcct: undeployedSmartAccountAddress,
      startingHash: hashedMessage,
    });
    const getCredentialDefaultArgs = {
      publicKey: {
        timeout: 60000,
        challenge: hexToBytes(replaySafeHash),
      },
    };
    const assertion = await navigator.credentials.get(getCredentialDefaultArgs);
    // @ts-ignore/
    const signature = assertion.response.signature;
    // @ts-ignore
    const clientDataJSON = assertion.response.clientDataJSON;
    const utf8Decoder = new TextDecoder("utf-8");
    const decodedClientData = utf8Decoder.decode(clientDataJSON);
    const clientDataObj = JSON.parse(decodedClientData);
    const authenticatorData = new Uint8Array(
      // @ts-ignore
      assertion.response.authenticatorData
    );
    const clientDataHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", clientDataJSON)
    );
    var signedData = new Uint8Array(
      authenticatorData.length + clientDataHash.length
    );
    signedData.set(authenticatorData);
    signedData.set(clientDataHash, authenticatorData.length);
    const messageHashForp256Sig = new Uint8Array(
      await crypto.subtle.digest("SHA-256", signedData)
    );
    // Convert signature from ASN.1 sequence to "raw" format
    var usignature = new Uint8Array(signature);
    var rStart = usignature[4] === 0 ? 5 : 4;
    var rEnd = rStart + 32;
    var sStart = usignature[rEnd + 2] === 0 ? rEnd + 3 : rEnd + 2;
    var r = usignature.slice(rStart, rEnd);
    var s = usignature.slice(sStart);

    const rToBigInt = hexToBigInt(toHex(r));
    const sToBigInt = hexToBigInt(toHex(s));
    const pubKeyToHex = `04${publicKey.x.slice(2)}${publicKey.y.slice(2)}`;
    const isValidP256 = secp256r1.verify(
      { r: rToBigInt, s: sToBigInt },
      messageHashForp256Sig,
      pubKeyToHex
    );
    console.log("isvalid p256: ", isValidP256);
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
        {!stateCredential && (
          <>
            <Button onPress={() => handleCreateCredential()} theme="active">
              Create Passkey
            </Button>
          </>
        )}
        {stateCredential && (
          <>
            <Button onPress={() => handleSignForCredential()} theme="active">
              Sign with Passkey
            </Button>
          </>
        )}
      </View>
    </View>
  );
}