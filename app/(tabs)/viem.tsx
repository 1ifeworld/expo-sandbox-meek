import React, { useState } from "react";
import { View, Button } from "tamagui";
import {
  Address,
  createPublicClient,
  http,
  Hash,
  hashMessage,
  hexToBytes,
  encodeAbiParameters,
  concat,
  encodeFunctionData,
} from "viem";
import { optimismSepolia } from "viem/chains";
import {
  ERC6492_DETECTION_SUFFIX,
  FACTORY_ADDRESS,
  webauthn,  
  buildWebAuthnSignature,
  runViemChecks
} from "@/helpers";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { secp256r1 } from "@noble/curves/p256";
import {
  createCredential,
  sign,
  verify,
  type CreateCredentialReturnType,
  serializePublicKey,
} from "webauthn-p256";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { coinbaseSmartWalletAbi } from "../abi/CoinbaseSmartWallet";

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

  // return type = PublicKey
  // typePublicKey looks like { prefix: number | undefined, x: bigint, y: bigint }
  const [stateCredential, setStateCredential] =
    useState<CreateCredentialReturnType>();

  /*
   *
   * CREATE PASSKEY
   *
   */

  async function handleCreateCredential() {
    const credential = await createCredential({
      name: "Viem Credential Example",
    });

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
    if (!stateCredential) return;

    const raw = "hello world";
    const hash = hashMessage(raw);

    const encodedOwnerSmart = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [stateCredential.publicKey.x, stateCredential.publicKey.y]
    );

    const undeployedSmartAccount = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "getAddress",
      args: [[encodedOwnerSmart], BigInt(0)],
    });

    const accountInitData = encodeFunctionData({
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "createAccount",
      args: [[encodedOwnerSmart], BigInt(0)],
    });

    const replaySafeHash = await publicClient.readContract({
      factory: FACTORY_ADDRESS,
      factoryData: accountInitData,
      abi: coinbaseSmartWalletAbi,
      address: undeployedSmartAccount as Address,
      functionName: "replaySafeHash",
      args: [hash],
    });

    const defaultGetFn = window.navigator.credentials.get.bind(
      window.navigator.credentials
    );

    const customGetFn = async (options: any) => {
      // Ensure options.publicKey exists before modifying it
      if (options.publicKey) {
        // when this was set to required
        // it was causing some of the webauth internal flag checks to fail
        options.publicKey.userVerification = "preferred"; // Set the desired value here

      }
      return defaultGetFn(options);
    };

    const signature = await sign({
      credentialId: stateCredential.id,
      hash: replaySafeHash,
      getFn: customGetFn,
    });

    // const internalViemChecks = runViemChecks(
    //   signature.authenticatorData,
    //   signature.userVerificationRequired,
    //   signature.clientDataJSON,
    //   signature.typeIndex
    // );
    // used for debugging authenticatorData flags
    // console.log("internal viem checks", internalViemChecks);

    const clientDataJSONHash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        utf8ToBytes(signature.clientDataJSON)
      )
    );
    const messageHash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        concatBytes(hexToBytes(signature.authenticatorData), clientDataJSONHash)
      )
    );

    const valid = await verify({
      hash: replaySafeHash,
      publicKey: stateCredential.publicKey,
      signature: signature,
    });

    console.log("viem verify result: ", valid);

    const isValidP256 = secp256r1.verify(
      { r: signature.r, s: signature.s },
      messageHash,
      serializePublicKey(stateCredential.publicKey).slice(2)
    );
    console.log("secp256r1 verify result: ", isValidP256);

    const onchainVerified = await publicClient.readContract({
      abi: webauthn.abi,
      code: webauthn.bytecode,
      functionName: "verify",
      args: [
        replaySafeHash,
        false,
        signature,
        stateCredential.publicKey.x,
        stateCredential.publicKey.y,
      ],
    });

    console.log("onchain direct p256 verify result: ", onchainVerified);

    const encodedSignatureWrapper = buildWebAuthnSignature(
      BigInt(0),
      signature.authenticatorData,
      signature.clientDataJSON,
      signature.r,
      signature.s
    );

    const sigFor6492Account: Hash = concat([
      encodeAbiParameters(
        [
          { name: "smartAccountFactory", type: "address" },
          { name: "createAccountInitData", type: "bytes" },
          { name: "encodedSigWrapper", type: "bytes" },
        ],
        [FACTORY_ADDRESS, accountInitData, encodedSignatureWrapper]
      ),
      ERC6492_DETECTION_SUFFIX,
    ]);

    const valid6492Sig = await publicClient.verifyMessage({
      address: undeployedSmartAccount as Address,
      message: raw,
      signature: sigFor6492Account,
    });

    console.log("valid6492sig: ", valid6492Sig);
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