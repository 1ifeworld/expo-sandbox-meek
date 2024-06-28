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
    const message = "I am verifying this challenge";
    const challengeHash = hashMessage(message);

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
          args: [challengeHash],
        });
        console.log("1.1 replaySafeHash", replaySafeHash);
        return {
          _replaySafeHash: replaySafeHash,
          _undeployedSmartAccountAddress: _undeployedSmartAccountAddress,
        };
      })
      .then(({ _replaySafeHash, _undeployedSmartAccountAddress }) => {
        const { authenticatorData, clientDataJSON, messageHash } = getWebAuthnStruct(_replaySafeHash);
        // GET credential options
        const getChallenge: BufferSource = hexToBytes(messageHash, { size: 32 });
        const getOptions: PublicKeyCredentialRequestOptions = {
          challenge: getChallenge,
        };
        navigator.credentials
          .get({ publicKey: getOptions })
          // @ts-ignore for some reason ts doesn't recognize correct return type
          .then((credential: (PublicKeyCredential & { response: AuthenticatorAssertionResponse }) | null) => {
            if (!credential) return;
            console.log("1.2 messageHash", messageHash);
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
            console.log("7.1 isErc6492Signature", isErc6492Signature(erc6492Signature));
            return {
              _address: _undeployedSmartAccountAddress as Address,
              _message: message,
              _hash: _replaySafeHash,
              _signature: erc6492Signature,
            };
          })
          .then(async ({ _address, _message, _hash, _signature }) => {
            const isValid = await publicClient.verifyMessage({
              address: _address,
              message: _message,
              signature: _signature,
            });

            console.log("7. isValid", isValid);
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

// (foundry) 0x
// 0000000000000000000000002a9e8fa175f45b235efddd97d2727741ef4eee63 (factory)
// 0000000000000000000000000000000000000000000000000000000000000060
// 0000000000000000000000000000000000000000000000000000000000000180
// 00000000000000000000000000000000000000000000000000000000000000e4
// 3ffba36f                                                         createAccount(bytes[],uint256) (selector)
// 0000000000000000000000000000000000000000000000000000000000000040
// 0000000000000000000000000000000000000000000000000000000000000000 (ownerIndex)
// 0000000000000000000000000000000000000000000000000000000000000001 (initialOwners.length)
// 0000000000000000000000000000000000000000000000000000000000000020
// 0000000000000000000000000000000000000000000000000000000000000040
// 1c05286fe694493eae33312f2d2e0d0abeda8db76238b7a204be1fb87f54ce42 (x)
// 28fef61ef4ac300f631657635c28e59bfb2fe71bce1634c81c65642042f6dc4d (y)
// 00000000000000000000000000000000000000000000000000000000
// 0000000000000000000000000000000000000000000000000000000000000280
// 0000000000000000000000000000000000000000000000000000000000000020
// 0000000000000000000000000000000000000000000000000000000000000002
// 0000000000000000000000000000000000000000000000000000000000000040
// 0000000000000000000000000000000000000000000000000000000000000200
// 0000000000000000000000000000000000000000000000000000000000000020
// 00000000000000000000000000000000000000000000000000000000000000c0
// 0000000000000000000000000000000000000000000000000000000000000120
// 0000000000000000000000000000000000000000000000000000000000000017 (challenge index)
// 0000000000000000000000000000000000000000000000000000000000000001 (type index)
// 5f5049044b9f2e0f6aa3b93ae679252ab604d33077ede6247bac2adf7fd79e86
// 495945e451e7a4707f3b71b402b6487b9406168d5bd7699e5f1593cb2ec700aa
// 0000000000000000000000000000000000000000000000000000000000000025 (authenticatorData.length)
// 49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763 (authenticatorData)
// 0500000000000000000000000000000000000000000000000000000000000000 (flags)
// 000000000000000000000000000000000000000000000000000000000000008a (clientDataJSON.length)
// 7b2274797065223a22776562617574686e2e676574222c226368616c6c656e67 (clientDataJSON start) string
// 65223a225a547879655158666d522d584744363075624e514950384b6955724d
// 77597255374a5f4a4a6d69354c4e67222c226f726967696e223a226874747073
// 3a2f2f7369676e2e636f696e626173652e636f6d222c2263726f73734f726967
// 696e223a66616c73657d00000000000000000000000000000000000000000000 (clientDataJSON end)
// 6492649264926492649264926492649264926492649264926492649264926492 ERC6492_DETECTION_SUFFIX

// (front end) 0x
// 000000000000000000000000abc14a381ab1bc4750eb08d11e5e29506e68c1b9
// 0000000000000000000000000000000000000000000000000000000000000060
// 0000000000000000000000000000000000000000000000000000000000000180
// 00000000000000000000000000000000000000000000000000000000000000e4
// 3ffba36f                                                         createAccount(bytes[],uint256) (selector)
// 0000000000000000000000000000000000000000000000000000000000000040
// 0000000000000000000000000000000000000000000000000000000000000000 (ownerIndex)
// 0000000000000000000000000000000000000000000000000000000000000001 (initialOwners.length)
// 0000000000000000000000000000000000000000000000000000000000000020
// 0000000000000000000000000000000000000000000000000000000000000040
// 24040297831cd45dbd64f46870999e1f7c72a93791b4908e266e8126c83fa377 (x)
// 8d3e9e2a6d170285fe0c3cdcfe9d31052b338cdb6f70fd695e86b98706843b17 (y)
// 00000000000000000000000000000000000000000000000000000000
// 0000000000000000000000000000000000000000000000000000000000000280
// 0000000000000000000000000000000000000000000000000000000000000020
// 0000000000000000000000000000000000000000000000000000000000000000
// 0000000000000000000000000000000000000000000000000000000000000040
// 0000000000000000000000000000000000000000000000000000000000000200
// 0000000000000000000000000000000000000000000000000000000000000020
// 00000000000000000000000000000000000000000000000000000000000000c0
// 0000000000000000000000000000000000000000000000000000000000000120
// 0000000000000000000000000000000000000000000000000000000000000017 (challenge index)
// 0000000000000000000000000000000000000000000000000000000000000001 (type index)
// c0082ba05c8987c4ec3c98efb7477426b7a44cacfd1e09cc680fd013572fbfa2
// 56919f8efb2dc7d8188178b8bad95e7f7da9a22ff3110c09ac388dcef3611c13
// 0000000000000000000000000000000000000000000000000000000000000025 (authenticatorData.length)
// 49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763 (authenticatorData)
// 1d00000000000000000000000000000000000000000000000000000000000000 (flags)
// 000000000000000000000000000000000000000000000000000000000000009f (clientDataJSON.length)
// 7b2274797065223a22776562617574686e2e676574222c226368616c6c656e67 (clientDataJSON start) string
// 65223a224d486778597a59305a5451784f474531595749774d7a466b4f54466a
// 4d4445314d6a52684e7a4e694e4452694d7a5a695a544d324d4459794f574a6c
// 4d7a41775a54686d597a4134595759784e4463335a6a686d4d7a4d7a222c226f
// 726967696e223a22687474703a2f2f6c6f63616c686f73743a38303831227d00 (clientDataJSON end)
// 6492649264926492649264926492649264926492649264926492649264926492 ERC6492_DETECTION_SUFFIX
