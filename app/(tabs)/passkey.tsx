import React from "react";
import { View, Button, Text } from "tamagui";
import { usePasskey } from "../../hooks/usePasskey";
import { toHex } from "viem";

export default function PasskeyScreen() {
  const [passkeyCedential, setPasskeyCredential] = React.useState<PublicKeyCredential | null>();
  const { createPasskey, signWithPasskey } = usePasskey();

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
        <Button onPress={createPasskey} theme="active">
          Create Passkey
        </Button>
        <Button onPress={() => signWithPasskey(toHex("signature"))} theme="active">
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
