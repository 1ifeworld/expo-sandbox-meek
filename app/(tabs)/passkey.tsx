import React, { useState } from "react";
import { View, Button, Text } from "tamagui";
import { Platform } from "react-native";
import * as Application from "expo-application";
import * as LocalAuthentication from "expo-local-authentication";

const publicKey = {
  challenge: new TextEncoder().encode("fizz"),
  rp: {
    id: undefined,
    name: "expo-sandbox-meek",
  },
  user: {
    id: new Uint8Array([79, 252, 83, 72, 214, 7, 89, 26]),
    name: "ioey",
    displayName: "joey Doe",
  },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
} satisfies PublicKeyCredentialCreationOptions;

export default function PasskeyScreen() {
  const [passkeyCedential, setPasskeyCredential] = React.useState<Credential | null>();

  const createPasskey = async () => {
    switch (Platform.OS) {
      case "ios": {
        /// NOTE: use ios passkey authentication to create public key
        console.log(LocalAuthentication);
      }
      case "web": {
        try {
          const publicKeyCredential = await navigator.credentials.create({ publicKey });
          console.log("✅ Created New Passkeys", publicKeyCredential);
        } catch (e) {
          console.error(e);
        }
      }
      default: {
        // throw new Error("Unsupported platform");
      }
    }
  };

  const signPasskey = async () => {
    switch (Platform.OS) {
      case "ios": {
        /// NOTE: use ios passkey authentication to create public key
        console.log(LocalAuthentication);
      }
      case "web": {
        try {
          const publicKeyCredential = await navigator.credentials.get({ publicKey });
          setPasskeyCredential(publicKeyCredential);
          console.log("✅ Get Passkey", publicKeyCredential);
        } catch (e) {
          console.error(e);
        }
      }
      default: {
        // throw new Error("Unsupported platform");
      }
    }
  };

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
        <Button onPress={createPasskey} theme='active'>
          Create Passkey
        </Button>
        <Button onPress={signPasskey} theme='active'>
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
