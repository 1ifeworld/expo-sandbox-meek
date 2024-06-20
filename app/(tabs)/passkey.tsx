import React from "react";
import { View, Button, Text } from "tamagui";
import { usePasskey } from "../../hooks/usePasskey";
import { toHex, Hex, createPublicClient, http, encodeAbiParameters } from "viem";
import { optimismSepolia } from "viem/chains";
import { decode } from "cbor-x";
import { Buffer } from "buffer";
import { CoinbaseSmartWalletFactoryAbi } from "../abi/CoinbaseSmartWalletFactory";
import { FACTORY_ADDRESS, ERC6492_DETECTION_SUFFIX } from "./data";

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

    const encodedOwner = encodeAbiParameters(
      [{name: "x", type: "bytes"}, {name: "y", type: "bytes"}],
      [x, y]
    )

    const undeplyedSmartAccountAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: CoinbaseSmartWalletFactoryAbi,
      functionName: 'getAddress',
      args: [[encodedOwner], 0]
    })    

    console.log("undeplyedSmartAccountAddress:", undeplyedSmartAccountAddress)
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
      }}
    >
      <View style={{ display: "flex", gap: "16px" }}>
        <Button onPress={onPressHandler} theme="active">
          Create Passkey
        </Button>
        <Button
          onPress={() => signWithPasskey(toHex("signature"))}
          theme="active"
        >
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
