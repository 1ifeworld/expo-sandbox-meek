import { Hex, encodeFunctionData, parseAbi } from "viem";
import { CoinbaseSmartWalletFactoryAbi } from "../../abi/CoinbaseSmartWalletFactory";

export function getCreateAccountInitData(owners: Hex[]) {
  return encodeFunctionData({
    abi: CoinbaseSmartWalletFactoryAbi,
    functionName: "createAccount",
    args: [owners, BigInt(0)],
  });
}
