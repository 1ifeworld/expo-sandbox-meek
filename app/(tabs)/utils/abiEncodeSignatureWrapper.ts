import { Hex, encodeAbiParameters } from "viem";
import { abiEncodeWebAuthnAuthData } from "./abiEncodeWebAuthnAuthData";

const coinbaseSignatureWrapperAbi = [
  {
    components: [
      { name: "ownerIndex", type: "uint256" },
      { name: "signatureData", type: "bytes" },
    ],
    name: "SignatureWrapper",
    type: "tuple",
  },
] as const;

export function abiEncodeSignatureWrapper(
  authenticatorData: Hex,
  clientDataJSON: string,
  r: Hex,
  s: Hex
): Hex {
  return encodeAbiParameters(coinbaseSignatureWrapperAbi, [
    {
      ownerIndex: BigInt(0),
      signatureData: abiEncodeWebAuthnAuthData(
        authenticatorData,
        clientDataJSON,
        r,
        s
      ),
    },
  ]);
}
