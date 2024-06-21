import {
  createPublicClient,
  http,
  Hash,
  encodeFunctionData,
  parseAbi
} from "viem";
import { optimismSepolia } from "viem/chains";

export const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

export const webauthnStructAbi = [
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

export function getCreateAccountInitData(accountOwners: Hash[]) {
  return encodeFunctionData({
    abi: parseAbi(["function createAccount(bytes[] owners, uint256 nonce)"]),
    functionName: "createAccount",
    args: [accountOwners, BigInt(0)],
  });
}
