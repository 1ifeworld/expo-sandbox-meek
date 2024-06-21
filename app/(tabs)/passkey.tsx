import React from "react";
import { View, Button, Text } from "tamagui";
import { usePasskey } from "../../hooks/usePasskey";
import {
  toHex,
  Hex,
  createPublicClient,
  http,
  encodeAbiParameters,
  hexToBigInt,
  Address,
  hashMessage,
  Hash,
  encodeFunctionData,
  parseAbi,
  concat,
  bytesToHex
} from "viem";
import { optimismSepolia } from "viem/chains";
import { decode } from "cbor-x";
import { Buffer } from "buffer";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { FACTORY_ADDRESS, ERC6492_DETECTION_SUFFIX } from "./data";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import {
  CoinbaseSmartWallet,
  coinbaseSignatureWrapperAbi,
} from "../abi/CoinbaseSmartWallet";
import { useState } from "react";

// @ts-ignore
// async function verifyCredential(credential, publicKeyArrayBuffer) {
//   console.log("running verify credential")
//   const authenticatorData = new Uint8Array(credential.response.authenticatorData);
//   console.log("authenticatorData in verify credential", authenticatorData)
//   const clientDataJSON = new Uint8Array(credential.response.clientDataJSON);
//   const signature = new Uint8Array(credential.response.signature);

//   // Create a combined buffer of authenticatorData and clientDataJSON
//   const combinedBuffer = new Uint8Array(authenticatorData.length + clientDataJSON.length);
//   combinedBuffer.set(authenticatorData);
//   combinedBuffer.set(clientDataJSON, authenticatorData.length);

//   // Import the public key
//   const importedPublicKey = await crypto.subtle.importKey(
//       'spki',
//       publicKeyArrayBuffer,
//       { name: 'ECDSA', namedCurve: 'P-256' },
//       true,
//       ['verify']
//   );

//   // Verify the signature
//   const isValid = await crypto.subtle.verify(
//       {
//           name: 'ECDSA',
//           hash: { name: 'SHA-256' },
//       },
//       importedPublicKey,
//       signature,
//       combinedBuffer
//   );

//   return isValid;
// }  


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

function getCreateAccountInitData(accountOwners: Hash[]) {
  return encodeFunctionData({
    abi: parseAbi(["function createAccount(bytes[] owners, uint256 nonce)"]),
    functionName: "createAccount",
    args: [accountOwners, BigInt(0)],
  });
}

async function getSafeHash({
  ownersForPreDeployAcct,
  preDeployAcct,
  startingHash,
}: {
  ownersForPreDeployAcct: Hash[];
  preDeployAcct: Address;
  startingHash: Hash;
}): Promise<Hash> {
  const data = await publicClient.readContract({
    // Address of the Smart Account deployer (factory).
    factory: FACTORY_ADDRESS,
    // Function to execute on the factory to deploy the Smart Account.
    factoryData: encodeFunctionData({
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "createAccount",
      args: [ownersForPreDeployAcct, 0],
    }),
    // Function to call on the Smart Account.
    abi: CoinbaseSmartWallet,
    address: preDeployAcct,
    functionName: "replaySafeHash",
    args: [startingHash],
  });
  return data;
}

const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

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

interface PublicKeyCredentialCreateResponse extends PublicKeyCredential {
  response: AuthenticatorAttestationResponse;
}


export default function PasskeyScreen() {
  const [passkeyCredentialRawId, setPasskeyCredentialRawId] =
    React.useState<Hex>();
  const [undeployedSmartAccountAddress, setUndeployedSmartAccountAddress] = React.useState<Address>()
  // type InitialCreds = {

  // }
  // const [initialCredsCheck, setInitialCreds] = useState<InitialCreds>()

  const { createPasskey, signWithPasskey } = usePasskey();


  const handleSignWithPasskey = async () => {
    if (!passkeyCredentialRawId || !undeployedSmartAccountAddress) {
      console.log("null sign request since no stored passkey cred or undeployed smart account yet")
      return
    }

    const mockChallenge = "0x123"
    const p256Credential = await signWithPasskey(mockChallenge);
    console.log("p256credential post sign ", p256Credential)

    if (!p256Credential || !p256Credential.rawId) {
      console.log("p256Credential not created")
      return
    }


    console.log("passkeyCredentialRawId", passkeyCredentialRawId)
    console.log("p256Credential?.rawId", p256Credential?.rawId)
    if (p256Credential?.rawId != passkeyCredentialRawId) {
      console.log("state level passkey.rawId doesnt match get resppnse p256Credneital.rawId")
      return
    }

    console.log("undeplotyed smart account addy: ", undeployedSmartAccountAddress)

    // console.log("signatureRequest: ", signatureRequest);
    // if (!signatureRequest) return;
    // // let cred = credential as unknown as {
    // //   rawId: ArrayBuffer;
    // //   response: {
    // //     clientDataJSON: ArrayBuffer;
    // //     authenticatorData: ArrayBuffer;
    // //     signature: ArrayBuffer;
    // //     userHandle: ArrayBuffer;
    // //   };
    // // };

    console.log("hexToBigInt(p256Credential.signature.r)", hexToBigInt(p256Credential.signature.r))
    console.log("hexToBigInt(p256Credential.signature.s)", hexToBigInt(p256Credential.signature.s))

    const webAuthnStruct = {
      authenticatorData: p256Credential.authenticatorData,
      clientDataJson: JSON.stringify(p256Credential.clientData).replace(/[" ]/g, ""),
      challengeIndex: BigInt(23), // BigInt(signatureRequest.clientData.indexOf("'challenge'")),
      typeIndex: BigInt(1), //BigInt(signatureRequest.clientData.indexOf("'type'")),        
      r: hexToBigInt(p256Credential.signature.r),
      s: hexToBigInt(p256Credential.signature.s),      
    }

    console.log("webAuthnStruct", webAuthnStruct);

    const encodedWebAuthnStruct = encodeAbiParameters(webauthnStructAbi, [webAuthnStruct]);

    console.log("encoded webautn struct", encodedWebAuthnStruct);

    const encodedSignatureWrapper: Hash = encodeAbiParameters(
      coinbaseSignatureWrapperAbi,
      [{ ownerIndex: BigInt(0), signatureData: encodedWebAuthnStruct }]
    );

    console.log("encodedSignatureWrapper", encodedSignatureWrapper);

    // generate account init data
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

    console.log("sigFor6492Account", sigFor6492Account);
    console.log("sigFor6492Account -64", sigFor6492Account.slice(-64));

    // const was6492SiweSigValid = await publicClient.verifySiweMessage({
    //   address: undeployedSmartAccountAddress,
    //   message: unhashedSiweMessage,
    //   signature: sigFor6492Account,
    // });

    const wasMessageValid = await publicClient.verifyMessage({
      address: undeployedSmartAccountAddress,
      message: mockChallenge,
      signature: sigFor6492Account,
    })

    // console.log("was6492SiweSigValid", was6492SiweSigValid);

    console.log("wasMessageValid", wasMessageValid);   
  }


  /*


  */


  const handleCreatePasskey = async () => {    
    const credential = await createPasskey();
    if (!credential) return
    const rawIdToHex = toHex(new Uint8Array(credential.rawId))
    console.log("raw id to hex in create flow:", rawIdToHex)
    setPasskeyCredentialRawId(rawIdToHex)
    // setPasskeyCredential(credential)


    const attestationObject = new Uint8Array(
      credential?.response.attestationObject
    );
    console.log("attestationObject", attestationObject);
    const decodedAttestationObj = decode(attestationObject);
    console.log("decodedAttestationObj", decodedAttestationObj);
    const authData = parseAuthenticatorData(decodedAttestationObj.authData);
    console.log("authData", authData);

    const publicKey = decode(authData?.COSEPublicKey);
    console.log("PUBLIC KEY", publicKey);

    const x = toHex(publicKey[-2]);
    const y = toHex(publicKey[-3]);
    console.log("x coord", publicKey[-2])
    console.log("toHex(x coord)", x)
    console.log("BigInt(toHex(x coord))", hexToBigInt(x))
    console.log("y coord", publicKey[-3])
    console.log("toHex(y coord)", y)
    console.log("BigInt(toHex(y coord))", hexToBigInt(y))

    const encodedOwner = `0x${x.slice(2)}${y.slice(2)}` as Hex;

    console.log("encodedOwner", encodedOwner);

    const data = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: "getAddress",
      args: [[encodedOwner], BigInt(0)],
    });
    const undeployedSmartAccountAddress = data as Address;    

    console.log(
      "undeployedSmartAccountAddress:",
      undeployedSmartAccountAddress
    );

    setUndeployedSmartAccountAddress(undeployedSmartAccountAddress)    
  };

  function prepare6492SiweSigWithPasskeyigner() {}


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
        <Button onPress={handleCreatePasskey} theme="active">
          Create Passkey
        </Button>
        {passkeyCredentialRawId && (
        <Button
          // onPress={() => signWithPasskey(toHex("signature"))}
          onPress={() => handleSignWithPasskey()}
          theme="active">
          Sign with Passkey
        </Button>
        )}
        {/* {passkeyCredential && (
          <>
            <Text>Passkey Signer: {}</Text>
            <Text>6492 Account: {}</Text>
            <Text>Message: {}</Text>
            <Text>Signature: {}</Text>
            <Text>Sig Validity: {}</Text>
          </>
        )} */}
      </View>
    </View>
  );
}
