import { Buffer } from "buffer";
import { toHex, Hex, PublicClient, Hash, Address, encodeFunctionData, parseAbi } from "viem";
import { PublicKeyInfo } from "pkijs";
import * as asn1js from "asn1js";
import { FACTORY_ADDRESS } from "./app/ethereum";
import { CoinbaseSmartWallet } from "./app/abi/CoinbaseSmartWallet";

export function extractPublicKey(credential: Credential): { x: Hex; y: Hex } {
  // @ts-ignore
  const publicKey = credential.response.getPublicKey();
  const pubKeyBuffer = new Uint8Array(publicKey);
  // Parse the ASN.1 structure
  const asn1 = asn1js.fromBER(pubKeyBuffer);
  if (asn1.offset === -1) {
    throw new Error("Error during ASN.1 parsing");
  }
  // Initialize PublicKeyInfo object
  const publicKeyInfo = new PublicKeyInfo({ schema: asn1.result });
  const publicKeyBuffer =
    publicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
  const publicKeyArray = new Uint8Array(publicKeyBuffer);
  return {
    x: toHex(publicKeyArray.slice(1, publicKeyArray.length / 2 + 1)),
    y: toHex(publicKeyArray.slice(publicKeyArray.length / 2 + 1)),
  };
  // Remeber that for the webauthn stuff need to convert into uint
  // const xToBigInt = hexToBigInt(x);
  // const yToBigInt = hexToBigInt(y);
}

export async function getSafeHash({
    publicClient,
    ownerForPreDeployAcct,
    preDeployAcct,
    startingHash,
  }: {
    publicClient: PublicClient,
    ownerForPreDeployAcct: Hash;
    preDeployAcct: Address;
    startingHash: Hash;
  }): Promise<Hash> {
    const data = await publicClient.readContract({
      // Address of the Smart Account deployer (factory).
      factory: FACTORY_ADDRESS,
      // Function to execute on the factory to deploy the Smart Account.
      factoryData: encodeFunctionData({
        abi: parseAbi(["function createAccount(bytes[] owners, uint256 nonce)"]),
        functionName: "createAccount",
        args: [[ownerForPreDeployAcct], BigInt(0)],
      }),
      // Function to call on the Smart Account.
      abi: CoinbaseSmartWallet,
      address: preDeployAcct,
      functionName: "replaySafeHash",
      args: [startingHash],
    });
    return data;
  }

export function parseAuthenticatorData(buffer: Uint8Array) {
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

export const createCredentialDefaultArgs = {
  publicKey: {
    rp: {
      name: "Acme",
    },
    user: {
      id: new Uint8Array(16),
      name: "john.p.smith@example.com",
      displayName: "John P. Smith",
    },
    pubKeyCredParams: [
      {
        type: "public-key",
        alg: -7,
      },
    ],
    attestation: "direct",
    challenge: new Uint8Array([
      // must be a cryptographically random number sent from a server
      0x8c, 0x0a, 0x26, 0xff, 0x22, 0x91, 0xc1, 0xe9, 0xb9, 0x4e, 0x2e, 0x17,
      0x1a, 0x98, 0x6a, 0x73, 0x71, 0x9d, 0x43, 0x48, 0xd5, 0xa7, 0x6a, 0x15,
      0x7e, 0x38, 0x94, 0x52, 0x77, 0x97, 0x0f, 0xef,
    ]).buffer,
  },
};
