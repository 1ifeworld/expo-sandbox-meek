import { Hex, encodeAbiParameters } from "viem";

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

export function abiEncodeWebAuthnAuthData(
  authenticatorData: Hex,
  clientDataJSON: string,
  r: Hex,
  s: Hex
): Hex {
  const webAuthnStruct = {
    authenticatorData: authenticatorData,
    clientDataJson: clientDataJSON,
    challengeIndex: BigInt(23),
    typeIndex: BigInt(1),
    r: BigInt(r),
    s: BigInt(s),
  };

  return encodeAbiParameters(webauthnStructAbi, [webAuthnStruct]);
}
