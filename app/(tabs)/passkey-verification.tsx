import React, { useState } from "react";
import { Button, View, Text } from "tamagui";
import { Buffer } from "buffer";
import { concat, createPublicClient, encodeAbiParameters, http, toHex, sha256, createWalletClient, Hex } from "viem";
import { optimismSepolia } from "viem/chains";
import { decode } from "cbor-x";
import { parseAuthenticatorData } from "@simplewebauthn/server/script/helpers";
import { ERC6492_DETECTION_SUFFIX, FACTORY_ADDRESS, MOCK_VERIFIER_ADDRESS } from "./data";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { getWebAuthnStruct } from "./utils/getWebAuthnStruct";
import { getCreateAccountInitData } from "./utils/getCreateAccountInitData";
import { getLocalStoragePublicKey } from "./utils/getLocalStoragePublicKey";
import { getRS } from "./utils/getRS";
import { abiEncodeSignatureWrapper } from "./utils/abiEncodeSignatureWrapper";
import { Mock6492VerifierAbi } from "../abi/Mock6492Verifier";

/// VIEM setup
const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

/// CREATE options
const createChallenge: BufferSource = Buffer.from("welcome to river");
const createRp: PublicKeyCredentialRpEntity = {
  name: "River",
  id: "localhost",
};
const createUserId: BufferSource = Buffer.from("new user random buffer");
const createUser: PublicKeyCredentialUserEntity = {
  displayName: "Meek Msaki",
  id: createUserId,
  name: "meek",
};
const createPubKeyCredParams: PublicKeyCredentialParameters[] = [];
const createOptions: PublicKeyCredentialCreationOptions = {
  challenge: createChallenge,
  rp: createRp,
  user: createUser,
  pubKeyCredParams: createPubKeyCredParams,
};

export default function passkey() {
  const [createCredential, setCreateCredential] = useState<PublicKeyCredential>();

  /// 1. RELYING PARTY CREATE credentials
  function handleCreateCredential(publicKey: PublicKeyCredentialCreationOptions) {
    navigator.credentials
      .create({ publicKey })
      // @ts-ignore
      .then((credential: (PublicKeyCredential & { response: AuthenticatorAttestationResponse }) | null) => {
        setCreateCredential(credential as PublicKeyCredential);
        // @ts-ignore
        const attestationObject = decode(new Uint8Array(credential.response.attestationObject));
        const decoder = new TextDecoder();
        // @ts-ignore
        const clientDataJSON = decoder.decode(credential.response.clientDataJSON);
        const authData = parseAuthenticatorData(attestationObject.authData);
        // @ts-ignore
        const publicKey = decode(authData.credentialPublicKey);

        console.log("1. createCredential", credential);
        console.log("1.1 attestationObject", attestationObject);
        console.log("1.2 clientDataJSON", clientDataJSON);
        console.log("1.3 authData", authData);
        console.log("1.4 publicKey", publicKey);

        /// @dev Save public key to local storage
        /// To get values -> localStorage.getItem("x")
        localStorage.setItem("x", toHex(publicKey[-2]));
        localStorage.setItem("y", toHex(publicKey[-3]));
      });
  }

  /// 2. RELYING PARTY GET credentials + sign
  async function handleSignWithCredential() {
    // Raw message
    const challengeHash = sha256(Buffer.from("I am verifying this challenge"));
    const { authenticatorData, clientDataJSON, messageHash } = getWebAuthnStruct(challengeHash);

    // GET credential options
    const getChallenge: BufferSource = Buffer.from(messageHash);
    const getOptions: PublicKeyCredentialRequestOptions = {
      challenge: getChallenge,
    };
    navigator.credentials
      .get({ publicKey: getOptions })
      // @ts-ignore for some reason ts doesn't recognize correct return type
      .then((credential: (PublicKeyCredential & { response: AuthenticatorAssertionResponse }) | null) => {
        if (!credential) return;
        console.log("1. messageHash", messageHash);
        console.log("2. Response", credential);
        console.log("3. authenticatorData", toHex(new Uint8Array(credential.response.authenticatorData)));
        const decoder = new TextDecoder("utf-8");
        console.log("4. clientDataJSON", decoder.decode(credential.response.clientDataJSON));
        console.log("5. signature", toHex(new Uint8Array(credential.response.signature)));

        const { r, s } = getRS(credential);
        console.log("6.1 r", toHex(r));
        console.log("6.2 s", toHex(s));
        console.log("6.3 x", localStorage.getItem("x"));
        console.log("6.3 y", localStorage.getItem("y"));

        const encodedSignatureWrapper = abiEncodeSignatureWrapper(
          toHex(authenticatorData),
          clientDataJSON,
          toHex(r),
          toHex(s)
        );

        const sig = concat([
          encodeAbiParameters(
            [
              { name: "smartAccountFactory", type: "address" },
              { name: "createAccountInitData", type: "bytes" },
              { name: "encodedSigWrapper", type: "bytes" },
            ],
            [FACTORY_ADDRESS, getCreateAccountInitData([getLocalStoragePublicKey()]), encodedSignatureWrapper]
          ),
          ERC6492_DETECTION_SUFFIX,
        ]);
        return {
          _signature: sig,
        };
      })
      // @ts-ignore Property '_signature' does not exist on type '{ _signature: `0x${string}`; } | undefined'
      .then(async ({ _signature }) => {
        const undeployedSmartAccountAddress = await publicClient.readContract({
          address: FACTORY_ADDRESS,
          abi: CoinbaseSmartWalletFactoryAbi,
          functionName: "getAddress",
          args: [[getLocalStoragePublicKey()], BigInt(0)],
        });
        return {
          _signer: undeployedSmartAccountAddress,
          _hash: messageHash,
          _signature: _signature,
        };
      })
      .then(async ({ _signer, _hash, _signature }) => {
        const { request } = await publicClient.simulateContract({
          address: MOCK_VERIFIER_ADDRESS,
          abi: Mock6492VerifierAbi,
          functionName: "isValidSig",
          // @ts-ignore Type 'unknown' is not assignable to type '`0x${string}`' for signer
          args: [_signer, _hash, _signature],
        });

        console.log("7. request", request);
      })
      .catch((err) => {
        console.error(err);
      });
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
      }}>
      <View style={{ display: "flex", gap: "16px" }}>
        {!localStorage.getItem("x") && (
          <Button onPress={() => handleCreateCredential(createOptions)} theme="active">
            Create Passkey
          </Button>
        )}
        {localStorage.getItem("x") && (
          <>
            <Button onPress={() => handleSignWithCredential()} theme="active">
              Sign with Passkey
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
