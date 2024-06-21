import {
  createPublicClient,
  http,
  Hash,
  encodeFunctionData,
  parseAbi,
  type PublicClient,
  Address
} from "viem";
import { optimismSepolia } from "viem/chains";
import { CoinbaseSmartWalletFactoryAbi } from "./abi/CoinbaseSmartWalletFactory";
import {
  CoinbaseSmartWallet,
  coinbaseSignatureWrapperAbi,
} from "./abi/CoinbaseSmartWallet";

export const FACTORY_ADDRESS = "0xabc14A381ab1BC4750eb08D11E5e29506e68c1b9";
export const ERC6492_DETECTION_SUFFIX = "0x6492649264926492649264926492649264926492649264926492649264926492";

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

export async function getSafeHash({
  publicClient,
  ownersForPreDeployAcct,
  preDeployAcct,
  startingHash,
}: {
  publicClient: PublicClient,
  ownersForPreDeployAcct: Hash[];
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
      args: [ownersForPreDeployAcct, BigInt(0)],
    }),
    // Function to call on the Smart Account.
    abi: CoinbaseSmartWallet,
    address: preDeployAcct,
    functionName: "replaySafeHash",
    args: [startingHash],
  });
  return data;
}