export const Mock6492VerifierAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "eip712Domain",
    inputs: [],
    outputs: [
      { name: "fields", type: "bytes1", internalType: "bytes1" },
      { name: "name", type: "string", internalType: "string" },
      { name: "version", type: "string", internalType: "string" },
      { name: "chainId", type: "uint256", internalType: "uint256" },
      {
        name: "verifyingContract",
        type: "address",
        internalType: "address",
      },
      { name: "salt", type: "bytes32", internalType: "bytes32" },
      {
        name: "extensions",
        type: "uint256[]",
        internalType: "uint256[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isValidSig",
    inputs: [
      { name: "_signer", type: "address", internalType: "address" },
      { name: "_hash", type: "bytes32", internalType: "bytes32" },
      { name: "_signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isValidSigImpl",
    inputs: [
      { name: "_signer", type: "address", internalType: "address" },
      { name: "_hash", type: "bytes32", internalType: "bytes32" },
      { name: "_signature", type: "bytes", internalType: "bytes" },
      { name: "allowSideEffects", type: "bool", internalType: "bool" },
      { name: "tryPrepare", type: "bool", internalType: "bool" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isValidSigWithSideEffects",
    inputs: [
      { name: "_signer", type: "address", internalType: "address" },
      { name: "_hash", type: "bytes32", internalType: "bytes32" },
      { name: "_signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isValidSignature",
    inputs: [
      { name: "hash", type: "bytes32", internalType: "bytes32" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "result", type: "bytes4", internalType: "bytes4" }],
    stateMutability: "view",
  },
  {
    type: "error",
    name: "ERC1271Revert",
    inputs: [{ name: "error", type: "bytes", internalType: "bytes" }],
  },
  {
    type: "error",
    name: "ERC6492DeployFailed",
    inputs: [{ name: "error", type: "bytes", internalType: "bytes" }],
  },
] as const;