import { Hex } from "viem";

export function getLocalStoragePublicKey() {
  const x = localStorage.getItem("x");
  const y = localStorage.getItem("y");
  return `0x${x?.slice(2)}${y?.slice(2)}` as Hex;
}
