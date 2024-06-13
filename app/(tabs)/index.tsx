import { Heading, View, Button, Text } from "tamagui";

export default function HomeScreen() {
  const results = {
    address: "0x0001",
    message: "Hello, 👋🏾",
  };
  return (
    <View margin={10} style={{ display: "flex", textAlign: "center", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <Heading>Expo Sandbox</Heading>
      <View style={{ display: "flex", gap: "16px" }}>
        <Button theme='active'>Sign Message with EOA</Button>
        <Text>address: {results.address}</Text>
        <Text>message: {results.message}</Text>
        <Button theme='active'>Sign Message with Passkey</Button>
      </View>
    </View>
  );
}
