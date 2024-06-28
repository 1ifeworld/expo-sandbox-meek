import {
  Hex,
  concat,
  encodeAbiParameters,
  sha256,
  stringToBytes,
  toBytes,
} from "viem";

/// @dev https://github.com/base-org/webauthn-sol/blob/619f20ab0f074fef41066ee4ab24849a913263b2/test/Utils.sol#L16-L31
/// helper function for undeployed account
export function getWebAuthnStruct(challenge: Hex) {
  const challengeb64url = btoa(
    encodeAbiParameters([{ name: "challenge", type: "bytes32" }], [challenge])
  );
  const clientDataJSON =
    '{"type":"webauthn.get","challenge":"' +
    challengeb64url +
    '","origin":"http://localhost:8081"}';

  const clientDataJSONHash = sha256(stringToBytes(clientDataJSON));
  const authenticatorData = toBytes(
    "0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000"
  );
  const messageHash = sha256(concat([authenticatorData, clientDataJSONHash]));
  return {
    authenticatorData: authenticatorData,
    clientDataJSON: clientDataJSON,
    messageHash: messageHash,
  };
}
