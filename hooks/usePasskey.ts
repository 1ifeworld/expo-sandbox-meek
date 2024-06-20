"use client";

import { Platform } from "react-native";
import { Hex, toHex } from "viem";
import { P256Credential } from "./types";
import { parseSignature } from "./helpers";
import { Buffer } from "buffer";

export const usePasskey = () => {
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

  const createPasskey = async () => {
    switch (Platform.OS) {
      case "ios": {
        /// TODO: IOS implement passkey authentication to create public key here
      }
      case "web":
        {
          try {
            // Creates a passkey that is stored locally on your device ie. iCloud
            const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredentialCreateResponse;
          } catch (e) {
            console.error(e);
          }
        }
        break;
      default: {
        throw new Error("Unsupported platform");
      }
    }
  };

  /**
   * @param challenge Hex message to be signed with passkey publickey
   * @return P256Signature
   */
  const signWithPasskey = async (challenge: Hex): Promise<P256Credential | undefined> => {
    switch (Platform.OS) {
      case "ios": {
        /// TODO: See IOS daimo's passkey creadential here: https://github.com/daimo-eth/daimo/blob/master/packages/daimo-expo-passkeys/src/Passkey.ts
        //        Currently able to sign with LocalAuthenticator from https://docs.expo.dev/versions/latest/sdk/local-authentication/
        //        (the snippet below works to get passkeys only. Expo does not have API to create passkeys as of June 19 2024) suggest
        // import * as LocalAuthentication from 'expo-local-authentication';
        // LocalAuthentication.authenticateAsync()
      }

      case "web":
        {
          try {
            // Creates params to requests passkey signer to sign your challenge
            const options: PublicKeyCredentialRequestOptions = {
              timeout: 60000,
              challenge: Buffer.from(challenge.slice(2), "hex"),
              rpId: window.location.hostname,
              userVerification: "preferred",
            } as PublicKeyCredentialRequestOptions;

            // Get creadentials with signature from challenge
            const credential = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredentialGetResponse;

            // Returns signature
            const utf8Decoder = new TextDecoder("utf-8");
            const decodedClientData = utf8Decoder.decode(credential.response.clientDataJSON);
            const clientDataObj = JSON.parse(decodedClientData);
            let authenticatorData = toHex(new Uint8Array(credential.response.authenticatorData));
            let signature = parseSignature(new Uint8Array(credential?.response?.signature));
            return {
              rawId: toHex(new Uint8Array(credential.rawId)),
              clientData: {
                type: clientDataObj.type,
                challenge: clientDataObj.challenge,
                origin: clientDataObj.origin,
                crossOrigin: clientDataObj.crossOrigin,
              },
              authenticatorData,
              signature,
            };
          } catch (e) {
            console.error(e);
          }
        }
        break;
      default: {
        throw new Error("Unsupported platform");
      }
    }
  };
  return { createPasskey, signWithPasskey };
};

interface PublicKeyCredentialGetResponse extends PublicKeyCredential {
  response: AuthenticatorAssertionResponse;
}

interface PublicKeyCredentialCreateResponse extends PublicKeyCredential {
  response: AuthenticatorAttestationResponse;
}
