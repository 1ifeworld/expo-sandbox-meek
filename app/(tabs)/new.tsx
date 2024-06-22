import React, { useState } from "react";
import { View, Button, Text } from "tamagui";
import { Buffer } from "buffer";
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
  encodeAbiParameters,
  concat,
  stringToHex,
} from "viem";
import { optimismSepolia } from "viem/chains";
import {
  extractPublicKey,
  createCredentialDefaultArgs,
  getSafeHash,
  webauthnStructAbi,
  getCreateAccountInitData,
  ERC6492_DETECTION_SUFFIX,
  signatureWrapperStructAbi,
} from "@/helpers";
import { FACTORY_ADDRESS } from "../ethereum";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { secp256r1 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import base64url from "base64url";
import { parseErc6492Signature, isErc6492Signature } from "viem/experimental";
import { base64urlnopad } from "@scure/base";

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
    // Step 1: Convert ArrayBuffer to string using TextDecoder
    const clientDataString = new TextDecoder().decode(clientDataJSON);
    // Step 2: Parse the JSON string
    const clientDataObj = JSON.parse(clientDataString);
    console.log({ clientDataObj });
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

    console.log("Encoded Owner: ", encodedOwner);
    console.log("Predeploy Address: ", undeployedSmartAccountAddress);
    console.log("Valid P256 Signature: ", isValidP256);

    /*
     *
     * ETHEREUM VERIFICATION
     *
     */

    const base64UrlReplaySafeHash = base64urlnopad.encode(
      hexToBytes(replaySafeHash)
    );
    console.log({ base64UrlReplaySafeHash });
    console.log({ cDBO: clientDataObj.challenge });
    const equal = base64UrlReplaySafeHash == clientDataObj.challenge;
    console.log({ equal });

    const clientDataJsonString = `{"type":"webauthn.get","challenge":"${clientDataObj.challenge}","origin":"http://localhost:8081"}`;
    const webAuthnStruct = {
      authenticatorData: toHex(authenticatorData),
      clientDataJSON: stringToHex(clientDataJsonString),
      challengeIndex: clientDataJsonString.indexOf('"challenge":'),
      typeIndex: clientDataJsonString.indexOf('"type":'),
      r: rToBigInt,
      s: sToBigInt,
    };
    console.log({ webAuthnStruct });
    const encodedWebAuthnStruct = encodeAbiParameters(
      [webauthnStructAbi],
      [
        {
          authenticatorData: webAuthnStruct.authenticatorData,
          clientDataJSON: webAuthnStruct.clientDataJSON,
          challengeIndex: webAuthnStruct.challengeIndex,
          typeIndex: webAuthnStruct.typeIndex,
          r: webAuthnStruct.r,
          s: webAuthnStruct.s,
        },
      ]
    );
    const encodedSignatureWrapper: Hash = encodeAbiParameters(
      [signatureWrapperStructAbi],
      [{ ownerIndex: BigInt(0), signatureData: encodedWebAuthnStruct }]
    );
    const createAccountInitData = getCreateAccountInitData([
      undeployedSmartAccountAddress,
    ]);
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
    const {
      address: factoryAddress,
      data: factoryInitData,
      signature: erc6492SigOnlySig,
    } = parseErc6492Signature(sigFor6492Account);
    const sig6492FormatCheck = isErc6492Signature(sigFor6492Account);

    console.log({ factoryAddress });
    console.log({ factoryInitData });
    console.log({ erc6492SigOnlySig });
    console.log({ sig6492FormatCheck });
    console.log({ sigFor6492Account });

    const validEthSig = await publicClient.verifyMessage({
      address: undeployedSmartAccountAddress,
      message: toHex(new Uint8Array(unhashedMessage)),
      signature: sigFor6492Account,
    });

    console.log({ validEthSig });

    /* LOGS FOR FOUNDRY TESTING */

    const xBigInt = hexToBigInt(publicKey.x);
    const yBigInt = hexToBigInt(publicKey.y);
    console.log({ xBigInt });
    console.log({ yBigInt });
    console.log({ rToBigInt });
    console.log({ sToBigInt });
    console.log({ replaySafeHash });
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

function base64UrlToBase64(base64Url: any) {
  return base64Url.replace(/-/g, "+").replace(/_/g, "/");
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer: any) {
  return new TextDecoder().decode(buffer);
}

function base64ToBytes(base64: any) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
