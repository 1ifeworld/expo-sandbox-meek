import React, { useState } from "react";
import { Button, View, Text } from "tamagui";
import { Buffer } from "buffer";
import { concat, createPublicClient, encodeAbiParameters, http, toHex, hashMessage, Address, hexToBytes } from "viem";
import { optimismSepolia } from "viem/chains";
import { decode } from "cbor-x";
import { parseAuthenticatorData } from "@simplewebauthn/server/script/helpers";
import { ERC6492_DETECTION_SUFFIX, FACTORY_ADDRESS } from "./data";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { getWebAuthnStruct } from "./utils/getWebAuthnStruct";
import { getCreateAccountInitData } from "./utils/getCreateAccountInitData";
import { getLocalStoragePublicKey } from "./utils/getLocalStoragePublicKey";
import { getRS } from "./utils/getRS";
import { abiEncodeSignatureWrapper } from "./utils/abiEncodeSignatureWrapper";
import { isErc6492Signature } from "viem/experimental";
import { CoinbaseSmartWallet } from "../abi/CoinbaseSmartWallet";

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
    const message = "I am verifying this message";
    const hashedMessage = hashMessage(message);
    console.log("1.0 message", message);
    console.log("1.1 hashMessage(message)", hashedMessage);

    await publicClient
      .readContract({
        address: FACTORY_ADDRESS,
        abi: CoinbaseSmartWalletFactoryAbi,
        functionName: "getAddress",
        args: [[getLocalStoragePublicKey()], BigInt(0)],
      })
      .then(async (_undeployedSmartAccountAddress) => {
        const replaySafeHash = await publicClient.readContract({
          factory: FACTORY_ADDRESS,
          factoryData: getCreateAccountInitData([getLocalStoragePublicKey()]),
          abi: CoinbaseSmartWallet,
          address: _undeployedSmartAccountAddress as Address,
          functionName: "replaySafeHash",
          args: [hashedMessage],
        });
        return {
          _replaySafeHash: replaySafeHash,
          _undeployedSmartAccountAddress: _undeployedSmartAccountAddress,
        };
      })
      .then(({ _replaySafeHash, _undeployedSmartAccountAddress }) => {
        const { authenticatorData, clientDataJSON, messageHash } = getWebAuthnStruct(_replaySafeHash);
        // GET credential options
        const getChallenge: BufferSource = Buffer.from(_replaySafeHash);
        const getOptions: PublicKeyCredentialRequestOptions = {
          challenge: getChallenge,
        };
        navigator.credentials
          .get({ publicKey: getOptions })
          // @ts-ignore for some reason ts doesn't recognize correct return type
          .then(async (credential: (PublicKeyCredential & { response: AuthenticatorAssertionResponse }) | null) => {
            if (!credential) return;
            console.log("1.2 messageHash", messageHash);
            console.log("2. Response", credential);
            console.log("3. authenticatorData", toHex(new Uint8Array(credential.response.authenticatorData)));
            const decoder = new TextDecoder("utf-8");
            const clientDataJSON = decoder.decode(credential.response.clientDataJSON);
            const clientDataJSONHash = keccak256(stringToBytes(clientDataJSON));
            const authenticatorData = toHex(new Uint8Array(credential.response.authenticatorData));
            const messageHash = keccak256(concat([authenticatorData, clientDataJSONHash]));

            console.log("1.2 replaySafeHash", _replaySafeHash);
            console.log("1.3 messageHash", messageHash);
            console.log("2. response", credential.response);
            console.log("3. authenticatorData", authenticatorData);
            console.log("4. clientDataJSON", clientDataJSON);
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
            const erc6492Signature = concat([
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
            console.log("7.0 isErc6492Signature", isErc6492Signature(erc6492Signature));

            return {
              _address: _undeployedSmartAccountAddress as Address,
              _message: message,
              _replaySafeHash: _replaySafeHash,
              _signature: erc6492Signature,
            };
          })
          .then(async ({ _address, _message, _replaySafeHash, _signature }) => {
            const isValid = await publicClient.verifyMessage({
              address: _address,
              message: _replaySafeHash,
              signature: _signature,
            });

            console.log("7.1 isValid", isValid);
          })
          .catch((err) => {
            console.error(err);
          });
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
