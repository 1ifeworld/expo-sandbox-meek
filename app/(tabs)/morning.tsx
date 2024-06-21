import React from "react";
import { View, Button, Text } from "tamagui";
import { decode } from "cbor-x";
import { Buffer } from "buffer";
import { Hex, toHex, Address, encodeAbiParameters, hexToBigInt, Hash, concat } from "viem";
import * as asn1js from "asn1js";
import { PublicKeyInfo } from "pkijs";
import { parseSignature } from "@/hooks/helpers";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { FACTORY_ADDRESS, ERC6492_DETECTION_SUFFIX } from "./data";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import {
  CoinbaseSmartWallet,
  coinbaseSignatureWrapperAbi,
} from "../abi/CoinbaseSmartWallet";
// import { publicClient, webauthnStructAbi, getCreateAccountInitData } from "../ethereum";
import {secp256r1} from "@noble/curves/p256"
import { sha256 } from '@noble/hashes/sha256'

async function handlePasskey() {
  var createCredentialDefaultArgs = {
    publicKey: {
      rp: {
        name: "Acme",
      },
      user: {
        id: new Uint8Array(16),
        name: "john.p.smith@example.com",
        displayName: "John P. Smith",
      },
      pubKeyCredParams: [
        {
          type: "public-key",
          alg: -7,
        },
      ],
      attestation: "direct",
      timeout: 60000,
      challenge: new Uint8Array([
        // must be a cryptographically random number sent from a server
        0x8c, 0x0a, 0x26, 0xff, 0x22, 0x91, 0xc1, 0xe9, 0xb9, 0x4e, 0x2e, 0x17,
        0x1a, 0x98, 0x6a, 0x73, 0x71, 0x9d, 0x43, 0x48, 0xd5, 0xa7, 0x6a, 0x15,
        0x7e, 0x38, 0x94, 0x52, 0x77, 0x97, 0x0f, 0xef,
      ]).buffer,
    },
  };

  // sample arguments for login
  var getCredentialDefaultArgs = {
    publicKey: {
      timeout: 60000,
      // allowCredentials: [newCredential] // see below
      challenge: new Uint8Array([
        // must be a cryptographically random number sent from a server
        0x79, 0x50, 0x68, 0x71, 0xda, 0xee, 0xee, 0xb9, 0x94, 0xc3, 0xc2, 0x15,
        0x67, 0x65, 0x26, 0x22, 0xe3, 0xf3, 0xab, 0x3b, 0x78, 0x2e, 0xd5, 0x6f,
        0x81, 0x26, 0xe2, 0xa6, 0x01, 0x7d, 0x74, 0x50,
      ]).buffer,
    },
  };

  // register / create a new credential
  // @ts-ignore
  var cred = await navigator.credentials.create(createCredentialDefaultArgs);

  if (!cred) {
    console.log("create cred failed");
    return;
  }

  var assertation = await navigator.credentials.get(getCredentialDefaultArgs);
  // @ts-ignore
  var signature = assertation.response.signature;
  console.log("SIGNATURE", signature);
  // @ts-ignore
  var clientDataJSON = assertation.response.clientDataJSON;
  console.log("clientDataJSON", clientDataJSON);
  // @ts-ignore
  var authenticatorData = new Uint8Array(assertation.response.authenticatorData);
  console.log("authenticatorData", authenticatorData);

  var clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", clientDataJSON)
  );
  console.log("clientDataHash", clientDataHash);

  // concat authenticatorData and clientDataHash
  var signedData = new Uint8Array(
    authenticatorData.length + clientDataHash.length
  );
  signedData.set(authenticatorData);
  signedData.set(clientDataHash, authenticatorData.length);
  console.log("signedData", signedData);

  // get createCred public key and verify it vs other way of getting it/
  // @ts-ignore
  const publicKey = cred.response.getPublicKey();
  console.log("public key from getPublicKey", publicKey);
  const pubKeyBuffer = new Uint8Array(publicKey);
  console.log("pubkeybuffer", pubKeyBuffer);

  // Parse the ASN.1 structure
  const asn1 = asn1js.fromBER(pubKeyBuffer);
  if (asn1.offset === -1) {
    throw new Error("Error during ASN.1 parsing");
  }

  // Initialize PublicKeyInfo object
  const publicKeyInfo = new PublicKeyInfo({ schema: asn1.result });

  // Extract the x and y coordinates
  const publicKeyBuffer =
    publicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
  const publicKeyArray = new Uint8Array(publicKeyBuffer);
  const x = toHex(publicKeyArray.slice(1, publicKeyArray.length / 2 + 1));
  const y = toHex(publicKeyArray.slice(publicKeyArray.length / 2 + 1));

  console.log("x from getPublicKey", x);
  console.log("y from getPublicKey", y);

  //   const publicKeyBytes = new Uint8Array(publicKey);
  //   console.log("public key bytes", publicKeyBytes);
  //   const decodedPubKey = decodePubKey(publicKeyBytes)
  //   console.log("decodedPubKey key bytes", decodedPubKey);

  // import key
  var key = await crypto.subtle.importKey(
    // The getPublicKey() operation thus returns the credential public key as a SubjectPublicKeyInfo. See:
    //
    // https://w3c.github.io/webauthn/#sctn-public-key-easy
    //
    // crypto.subtle can import the spki format:
    //
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    "spki", // "spki" Simple Public Key Infrastructure rfc2692
    publicKey,
    {
      // these are the algorithm options
      // await cred.response.getPublicKeyAlgorithm() // returns -7
      // -7 is ES256 with P-256 // search -7 in https://w3c.github.io/webauthn
      // the W3C webcrypto docs:
      //
      // https://www.w3.org/TR/WebCryptoAPI/#informative-references (scroll down a bit)
      //
      // ES256 corrisponds with the following AlgorithmIdentifier:
      name: "ECDSA",
      namedCurve: "P-256",
      hash: { name: "SHA-256" },
    },
    false, //whether the key is extractable (i.e. can be used in exportKey)
    ["verify"] //"verify" for public key import, "sign" for private key imports
  );

  // Convert signature from ASN.1 sequence to "raw" format
  var usignature = new Uint8Array(signature);
  var rStart = usignature[4] === 0 ? 5 : 4;
  var rEnd = rStart + 32;
  var sStart = usignature[rEnd + 2] === 0 ? rEnd + 3 : rEnd + 2;
  var r = usignature.slice(rStart, rEnd);
  var s = usignature.slice(sStart);
  var rawSignature = new Uint8Array([...r, ...s]);

  // check signature with public key and signed data
  var verified = await crypto.subtle.verify(
    // { name: "ECDSA", namedCurve: "P-256", hash: { name: "SHA-256" } },
    { name: "ECDSA", hash: { name: "SHA-256" } },
    key,
    rawSignature,
    signedData.buffer
  );
  // verified is now true!
  console.log("verified", verified);

  // try separate verificaiton of p256
//   const rToBigInt = hexToBigInt(toHex(r))
  const rToBigInt = hexToBigInt(toHex(r))
  const sToBigInt = hexToBigInt(toHex(s))
  const pubKeyToHex = `04${x.slice(2)}${y.slice(2)}`
  const isValidP256 = secp256r1.verify({r: rToBigInt, s: sToBigInt}, sha256(signedData), pubKeyToHex)
  console.log("isvalid p256: ", isValidP256)




  /*
  *
  * PORT VERIFIED MESSAGE INTO ETHEREUM
  *
  */

//   // calculate encoded owner from pubkey x and y coords
//   const encodedOwner = `0x${x.slice(2)}${y.slice(2)}` as Hex;
//   // callculate undeployed smart account address
//   const data = await publicClient.readContract({
//     address: FACTORY_ADDRESS,
//     abi: CoinbaseSmartWalletFactoryAbi,
//     functionName: "getAddress",
//     args: [[encodedOwner], BigInt(0)],
//   });
//   const undeployedSmartAccountAddress = data as Address;
//   // Format web auth struct
//   // NOTE: HUGE RED FLAG THE TYPE CONVERSIONS HERE COULD BE MESSING THINGS UP
//   const webAuthnStruct = {
//     authenticatorData: toHex(authenticatorData),
//     clientDataJson: JSON.stringify(clientDataJSON), //JSON.stringify(clientDataJSON).replace(/[" ]/g, ""),
//     challengeIndex: BigInt(23),
//     typeIndex: BigInt(1),    
//     r: hexToBigInt(toHex(r)),
//     s: hexToBigInt(toHex(s))
//   }
//   const encodedWebAuthnStruct = encodeAbiParameters(webauthnStructAbi, [webAuthnStruct]);
//   // Format signature
//   const encodedSignatureWrapper: Hash = encodeAbiParameters(
//     coinbaseSignatureWrapperAbi,
//     [{ ownerIndex: BigInt(0), signatureData: encodedWebAuthnStruct }]
//   );  
//   const createAccountInitData = getCreateAccountInitData([
//     undeployedSmartAccountAddress,
//   ]);
//   const sigFor6492Account: Hash = concat([
//     encodeAbiParameters(
//       [
//         { name: "smartAccountFactory", type: "address" },
//         { name: "createAccountInitData", type: "bytes" },
//         { name: "encodedSigWrapper", type: "bytes" },
//       ],
//       [FACTORY_ADDRESS, createAccountInitData, encodedSignatureWrapper]
//     ),
//     ERC6492_DETECTION_SUFFIX,
//   ]);  

}

export default function PasskeyScreen() {
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
        <Button onPress={handlePasskey} theme="active">
          Create and Sign With Passkey
        </Button>
      </View>
    </View>
  );
}

function decodePubKey(encodedPubKey: Uint8Array) {
  const publicKey = decode(encodedPubKey);
  return publicKey;
}

function credToPubKey(credential: any) {
  const attestationObject = new Uint8Array(
    credential?.response.attestationObject
  );
  const decodedAttestationObj = decode(attestationObject);
  const authData = parseAuthenticatorData(decodedAttestationObj.authData);
  const publicKey = decode(authData?.COSEPublicKey);
  console.log("decode(authData?.COSEPublicKey)", publicKey);

  const x = toHex(publicKey[-2]);
  const y = toHex(publicKey[-3]);
  console.log("x from attestatiobObj", x);
  console.log("y from attestatiobObj", y);
  return publicKey;
  //   console.log("x coord", publicKey[-2]);
  //   console.log("toHex(x coord)", x);
  //   console.log("BigInt(toHex(x coord))", hexToBigInt(x));
  //   console.log("y coord", publicKey[-3]);
  //   console.log("toHex(y coord)", y);
  //   console.log("BigInt(toHex(y coord))", hexToBigInt(y));

  //   const encodedOwner = `0x${x.slice(2)}${y.slice(2)}` as Hex;
  //   console.log("encodedOwner", encodedOwner);
}

function parseAuthenticatorData(buffer: Uint8Array) {
  const rpIdHash = buffer.slice(0, 32);
  buffer = buffer.slice(32);
  const flagsBuf = buffer.slice(0, 1);
  buffer = buffer.slice(1);
  const flags = flagsBuf[0];
  const counterBuf = buffer.slice(0, 4);
  buffer = buffer.slice(4);
  const counter = Buffer.from(counterBuf).readUInt32BE(0);
  const aaguid = buffer.slice(0, 16);
  buffer = buffer.slice(16);
  const credIDLenBuf = buffer.slice(0, 2);
  buffer = buffer.slice(2);
  const credIDLen = Buffer.from(credIDLenBuf).readUInt16BE(0);
  const credID = buffer.slice(0, credIDLen);
  buffer = buffer.slice(credIDLen);
  const COSEPublicKey = buffer;

  return {
    rpIdHash,
    flagsBuf,
    flags,
    counter,
    counterBuf,
    aaguid,
    credID,
    COSEPublicKey,
  };
}
