import React, { useState } from "react";
import { Button, View, Text } from "tamagui";
import { Buffer } from "buffer";
import {
  Hash,
  Hex,
  concat,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  parseAbi,
  toHex,
  sha256,
} from "viem";
import { optimismSepolia } from "viem/chains";
import { AsnParser } from "@peculiar/asn1-schema";
import { ECDSASigValue } from "@peculiar/asn1-ecc";
import { decode, encode } from "cbor-x";
import { parseAuthenticatorData } from "@simplewebauthn/server/script/helpers";
import { ERC6492_DETECTION_SUFFIX, FACTORY_ADDRESS } from "./data";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";

/// @dev VIEM setup
const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

/// @dev CREATE options
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

/// @dev GET options
const getChallenge: BufferSource = Buffer.from("I am verifying this challenge");
const getOptions: PublicKeyCredentialRequestOptions = {
  challenge: getChallenge,
};

export default function passkey() {
  const [createCredential, setCreateCredential] =
    useState<PublicKeyCredential>();

  const [getCredential, setGetCredential] = useState<PublicKeyCredential>();

  // 1. RELYING PARTY creating credentials
  function handleCreateCredential(
    publicKey: PublicKeyCredentialCreationOptions
  ) {
    navigator.credentials.create({ publicKey }).then((credential) => {
      if (!credential) return;
      setCreateCredential(credential as PublicKeyCredential);
      console.log("1. createCredential", credential);
      // CBOR-x decode attestationObject
      const attestationObject = decode(
        new Uint8Array(credential.response.attestationObject)
      );
      console.log("1.1 attestationObject", attestationObject);

      // utf-8 decode clientDataJSON to text
      const decoder = new TextDecoder();
      const clientDataJSON = decoder.decode(credential.response.clientDataJSON);
      console.log("1.2 clientDataJSON", clientDataJSON);

      // decode authData with parseAuthenticatorData helper
      const authData = parseAuthenticatorData(attestationObject.authData);
      console.log("1.3 authData", authData);

      // CBOR-x decode credentialPublicKey
      const publicKey = decode(authData.credentialPublicKey);
      console.log("1.4 publicKey", publicKey);

      /// @dev Set x, y in browser context
      /// To get values user localStorage.getItem("x")
      localStorage.setItem("x", toHex(publicKey[-2]));
      localStorage.setItem("y", toHex(publicKey[-3]));
    });
  }

  // 2. RELYING PARTY requesting credentials to sign signature
  function handleSignForCredential(
    publicKey: PublicKeyCredentialRequestOptions
  ) {
    navigator.credentials.get({ publicKey }).then((credential) => {
      console.log("2. getCredential", credential);
      setGetCredential(credential as PublicKeyCredential);
      verify(credential.response);
    });
  }

  // 3. ETHEREUM on-chain verify results from authenticator
  async function verify(response: AuthenticatorAssertionResponse) {
    const decoder = new TextDecoder("utf-8");
    console.log("3. Response", response);
    console.log(
      "4. autenticatorData",
      toHex(new Uint8Array(response.authenticatorData))
    );
    console.log("5. clientDataJSON", decoder.decode(response.clientDataJSON));
    console.log("6. signature", toHex(new Uint8Array(response.signature)));

    const parsedSignature = AsnParser.parse(response.signature, ECDSASigValue);
    let rBytes = new Uint8Array(parsedSignature.r);
    let sBytes = new Uint8Array(parsedSignature.s);
    function shouldRemoveLeadingZero(bytes: Uint8Array): boolean {
      return bytes[0] === 0x0 && (bytes[1] & (1 << 7)) !== 0;
    }
    if (shouldRemoveLeadingZero(rBytes)) rBytes = rBytes.slice(1);
    if (shouldRemoveLeadingZero(sBytes)) sBytes = sBytes.slice(1);

    const webAuthnStruct = {
      authenticatorData: toHex(new Uint8Array(response.authenticatorData)),
      clientDataJson: decoder.decode(response.clientDataJSON),
      challengeIndex: BigInt(23),
      typeIndex: BigInt(1),
      r: BigInt(toHex(rBytes)),
      s: BigInt(toHex(sBytes)),
    };
    const webauthnStructAbi = [
      {
        components: [
          { name: "authenticatorData", type: "bytes" },
          { name: "clientDataJson", type: "string" },
          { name: "challengeIndex", type: "uint256" },
          { name: "typeIndex", type: "uint256" },
          { name: "r", type: "uint256" },
          { name: "s", type: "uint256" },
        ],
        name: "WebAuthnAuth",
        type: "tuple",
      },
    ] as const;
    const encodedWebAuthnStruct = encodeAbiParameters(webauthnStructAbi, [
      webAuthnStruct,
    ]);
    const coinbaseSignatureWrapperAbi = [
      {
        components: [
          { name: "ownerIndex", type: "uint256" },
          { name: "signatureData", type: "bytes" },
        ],
        name: "SignatureWrapper",
        type: "tuple",
      },
    ] as const;
    const encodedSignatureWrapper: Hash = encodeAbiParameters(
      coinbaseSignatureWrapperAbi,
      [{ ownerIndex: BigInt(0), signatureData: encodedWebAuthnStruct }]
    );

    // const publicKey = createCredential.getPublicKey();
    const x = localStorage.getItem("x");
    const y = localStorage.getItem("y");
    const accountOwners = `0x${x?.slice(2)}${y?.slice(2)}` as Hex;
    const createAccountInitData = encodeFunctionData({
      abi: parseAbi(["function createAccount(bytes[] owners, uint256 nonce)"]),
      functionName: "createAccount",
      args: [[accountOwners], BigInt(0)],
    });
    const undeployedSmartAccountAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "getAddress",
      args: [[accountOwners], BigInt(0)],
    });
    const sigFor6492Account = concat([
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
    const challenge = concat([
      new Uint8Array(response.authenticatorData),
      sha256(Buffer.from(decoder.decode(response.clientDataJSON))),
    ]);
    const isValid = await publicClient.verifyMessage({
      address: undeployedSmartAccountAddress as Hex,
      message: { raw: Buffer.from("I am verifying this challenge") },
      signature: sigFor6492Account,
    });

    console.log("7. isValid", isValid);
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
          <Button
            onPress={() => handleCreateCredential(createOptions)}
            theme="active">
            Create Passkey
          </Button>
        )}
        {localStorage.getItem("x") && (
          <>
            <Text>x: {localStorage.getItem("x")}</Text>
            <Text>y: {localStorage.getItem("y")}</Text>
            <Button
              onPress={() => handleSignForCredential(getOptions)}
              theme="active">
              Sign with Passkey
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
