import { ECDSASigValue } from "@peculiar/asn1-ecc";
import { AsnParser } from "@peculiar/asn1-schema";
import { toHex } from "viem";

export function getRS(credential: PublicKeyCredential & { response: AuthenticatorAssertionResponse }): {
  r: bigint;
  s: bigint;
} {
  const parsedSignature = AsnParser.parse(credential.response.signature, ECDSASigValue);
  let rBytes = new Uint8Array(parsedSignature.r);
  let sBytes = new Uint8Array(parsedSignature.s);
  function shouldRemoveLeadingZero(bytes: Uint8Array): boolean {
    return bytes[0] === 0x0 && (bytes[1] & (1 << 7)) !== 0;
  }
  if (shouldRemoveLeadingZero(rBytes)) rBytes = rBytes.slice(1);
  if (shouldRemoveLeadingZero(sBytes)) sBytes = sBytes.slice(1);

  // MUST protect for signature malleability
  const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  function normalizeS(s: bigint) {
    if (s > n / BigInt(2)) {
      return n - s;
    }

    return s;
  }

  return {
    r: BigInt(toHex(rBytes)),
    s: normalizeS(BigInt(toHex(sBytes))),
  };
}
