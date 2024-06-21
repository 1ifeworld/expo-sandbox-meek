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

const webauthnStructAbi = [
  {
    components: [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataJson", type: "string" },
      { name: "challengeIndex", type: "uint256" },
      { name: "typeIndex", type: "uint256" },
      { name: "r", type: "uint256" },
      { name: "s", type: "uint2556" },
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

export default function PasskeyScreen() {
  const [passkeyCedential, setPasskeyCredential] =
    React.useState<PublicKeyCredential | null>();
  const { createPasskey, signWithPasskey } = usePasskey();

  const onPressHandler = async () => {
    const credential = await createPasskey();
    console.log("credential", credential);
    if (!credential) return;
    const attestationObject = new Uint8Array(
      credential?.response.attestationObject
    );
    console.log("attestationObject", attestationObject);
    const decodedAttestationObj = decode(attestationObject);
    console.log("decodedAttestationObj", decodedAttestationObj);
    const authData = parseAuthenticatorData(decodedAttestationObj.authData);
    console.log("authData", authData);

    const publicKey = decode(authData?.COSEPublicKey);
    console.log("public key", publicKey);

    const x = toHex(publicKey[-2]);
    const y = toHex(publicKey[-3]);

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

    // how to generate a p256 signature we can then create a SIWE message with
    const unhashedSiweMessage = createSiweMessage({
      address: undeployedSmartAccountAddress as Address,
      chainId: optimismSepolia.id,
      domain: "localhost",
      nonce: generateSiweNonce(),
      uri: "localhost:8081",
      version: "1",
    });
    console.log("unhashed message: ", unhashedSiweMessage)
    const hashedSiweMessage = hashMessage(unhashedSiweMessage);
    const replaySafeHash = await getSafeHash({
      ownersForPreDeployAcct: [encodedOwner],
      preDeployAcct: undeployedSmartAccountAddress,
      startingHash: hashedSiweMessage,
    });
    // const dummyChallenge = "0x";
    const signatureRequest = await signWithPasskey(replaySafeHash);
    console.log("signatureRequest: ", signatureRequest);
    if (!signatureRequest) return;

    let cred = credential as unknown as {
      rawId: ArrayBuffer;
      response: {
        clientDataJSON: ArrayBuffer;
        authenticatorData: ArrayBuffer;
        signature: ArrayBuffer;
        userHandle: ArrayBuffer;
      };
    };

    const webAuthnStruct = {
      authenticatorData: signatureRequest.authenticatorData,
      clientDataJson: JSON.stringify(signatureRequest.clientData).replace(/[" ]/g, ""),
      challengeIndex: BigInt(23), // BigInt(signatureRequest.clientData.indexOf("'challenge'")),
      typeIndex: BigInt(1), //BigInt(signatureRequest.clientData.indexOf("'type'")),        
      r: hexToBigInt(signatureRequest.signature.r),
      s: hexToBigInt(signatureRequest.signature.s),      
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

    const was6492SiweSigValid = await publicClient.verifySiweMessage({
      address: undeployedSmartAccountAddress,
      message: unhashedSiweMessage,
      signature: sigFor6492Account,
    });

    console.log("was6492SiweSigValid", was6492SiweSigValid);
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
        <Button onPress={onPressHandler} theme="active">
          Create Passkey
        </Button>
        <Button
          onPress={() => signWithPasskey(toHex("signature"))}
          theme="active">
          Sign with Passkey
        </Button>
        {passkeyCedential && (
          <>
            <Text>Passkey Signer: {}</Text>
            <Text>6492 Account: {}</Text>
            <Text>Message: {}</Text>
            <Text>Signature: {}</Text>
            <Text>Sig Validity: {}</Text>
          </>
        )}
      </View>
    </View>
  );
}
