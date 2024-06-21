import React from "react"
import { View, Button } from "tamagui"
import { generateSiweNonce, createSiweMessage } from "viem/siwe"
import { Buffer } from "buffer"
import { secp256r1 } from "@noble/curves/p256"
import { sha256 } from "@noble/hashes/sha256"
import { optimismSepolia } from "viem/chains"
import { hexToBytes } from "@noble/hashes/utils"

async function handleAuth() {
  try {
    const nonce = generateSiweNonce()
    
    const siweMessage = createSiweMessage({
        address: '0x0e38fbBACaF442FA8a8531386D6231F240a89a85',
        chainId: optimismSepolia.id,
        domain: "example.com",
        nonce: nonce,
        uri: "https://example.com/path",
        version: "1",
    });

    const privateKey = process.env.EXPO_PUBLIC_PRIVATE_KEY
    if (!privateKey) {
      throw new Error("Private key is not set")
    }
    const messageHash = sha256(Buffer.from(siweMessage))
    const signature = secp256r1.sign(messageHash, hexToBytes(privateKey))

    // Prepare the request payload
    const payload = {
      deviceId: "", 
      sessionId: "", 
      siweMsg: {
        custodyAddress: '0x0e38fbBACaF442FA8a8531386D6231F240a89a85', 
        message: siweMessage,
        signature: Array.from(signature.toCompactRawBytes()),
      },
    }

    // Make the POST request to the server
    const response = await fetch("https://240608-server-studies-production.up.railway.app/provisionSession", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    // Process the server response
    const data = await response.json()
    if (data.success) {
      console.log("Authorization successful:", data)
      // Here you might want to store the userId, sessionId, and deviceId
    } else {
      console.error("Authorization failed:", data.message)
    }
  } catch (error) {
    console.error("Error during authorization:", error)
  }
}

export default function AuthorizationScreen() {
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
        <Button onPress={handleAuth} theme="active">
          Authorize Server
        </Button>
      </View>
    </View>
  )
}