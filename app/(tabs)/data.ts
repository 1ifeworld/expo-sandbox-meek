export const FACTORY_ADDRESS = "0xabc14A381ab1BC4750eb08D11E5e29506e68c1b9";
export const MOCK_VERIFIER_ADDRESS = "0x76379783717d3aBA4da7A712C5996cB9Fe468F03";
export const IMPLEMENTATION_ADDRESS = "0x66Fc5534b1A5521dCA263DCDF44a315eFDAa33C2";
export const ERC6492_DETECTION_SUFFIX = "0x6492649264926492649264926492649264926492649264926492649264926492";

// All properties on a domain are optional
export const domain = {
  name: "Ether Mail",
  version: "1",
  chainId: 1,
  verifyingContract: MOCK_VERIFIER_ADDRESS,
} as const;

// The named list of all type definitions
export const types = {
  Person: [
    { name: "name", type: "string" },
    { name: "wallet", type: "address" },
  ],
  Mail: [
    { name: "from", type: "Person" },
    { name: "to", type: "Person" },
    { name: "contents", type: "string" },
  ],
} as const;

export const message = {
  from: {
    name: "Cow",
    wallet: "0x10FaD54eddB7123fd082CB5EDe393f2481Ff625B",
  },
  to: {
    name: "Bob",
    wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  },
  contents: "Hello, Bob!",
};
