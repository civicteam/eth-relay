import {
  type Contract,
  type Signer,
  type ContractTransaction,
  BaseContract,
  type TypedDataDomain,
  type PreparedTransactionRequest,
  resolveAddress,
} from "ethers";

import { type IForwarder } from "./IForwarder";

import forwarderAbi from "./forwarderAbi.json";

interface Input {
  from: string;
  to: string;
  data: string;
}

// const eip712Domain = [
//   { name: "name", type: "string" },
//   { name: "version", type: "string" },
//   { name: "chainId", type: "uint256" },
//   { name: "verifyingContract", type: "address" },
// ];

const forwardRequest = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "gas", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "data", type: "bytes" },
];

type ForwardRequest = Input & {
  value: number;
  gas: number;
  nonce: string;
};

const getMetaTxTypeData = (
  chainId: number,
  verifyingContract: string,
  domain: TypedDataDomain
): {
  types: Record<string, Array<{ name: string; type: string }>>;
  domain: TypedDataDomain;
  primaryType: string;
} => ({
  types: {
    // EIP712Domain: eip712Domain,
    ForwardRequest: forwardRequest,
  },
  domain: {
    ...domain,
    chainId,
    verifyingContract,
  },
  primaryType: "ForwardRequest",
});

const buildRequest = async (
  forwarder: IForwarder,
  input: Input
): Promise<ForwardRequest> => {
  const nonce = await forwarder
    .getNonce(input.from)
    .then((nonce: bigint) => nonce.toString());
  console.log("nonce", nonce);
  return { value: 0, gas: 2e6, nonce, ...input };
};

const buildTypedData = async (
  forwarder: Contract,
  request: ForwardRequest,
  domain: TypedDataDomain
): Promise<{
  types: Record<string, Array<{ name: string; type: string }>>;
  domain: TypedDataDomain;
  primaryType: string;
  message: ForwardRequest;
}> => {
  const chainId = await forwarder.runner?.provider
    ?.getNetwork()
    .then((n) => n.chainId);

  if (chainId === undefined)
    throw new Error(
      "Could not get chainId from forwarder contract - add a contractrunner"
    );

  const verifyingContract = await forwarder.getAddress();
  const typeData = getMetaTxTypeData(
    Number(chainId),
    verifyingContract,
    domain
  );
  return { ...typeData, message: request };
};

export const signMetaTxRequest = async (
  signer: Signer,
  forwarder: IForwarder,
  input: Input,
  domain: TypedDataDomain
): Promise<{ request: ForwardRequest; signature: string }> => {
  const request = await buildRequest(forwarder, input);
  const toSign = await buildTypedData(
    forwarder as unknown as Contract,
    request,
    domain
  );
  const signature = await signer.signTypedData(
    toSign.domain,
    toSign.types,
    toSign.message
  );
  return { signature, request };
};

export const createEIP2771ForwardedTransaction = async (
  tx: PreparedTransactionRequest,
  forwarder: { address: string; EIP712Domain: TypedDataDomain },
  signer: Signer
): Promise<ContractTransaction> => {
  if (tx.data === undefined || tx.to === undefined)
    throw new Error(
      "Forearded Tx requires a data field and to address in the transaction."
    );
  const forwarderContract = new BaseContract(
    forwarder.address,
    forwarderAbi
  ).connect(signer) as unknown as IForwarder;

  const toAddress = await resolveAddress(tx.to);

  const { request, signature } = await signMetaTxRequest(
    signer,
    forwarderContract,
    {
      from: await signer.getAddress(),
      to: toAddress,
      data: tx.data,
    },
    forwarder.EIP712Domain
  );

  const populatedForwardedTransaction =
    await forwarderContract.execute.populateTransaction(request, signature);
  // ethers will set the from address on the populated transaction to the current wallet address (i.e the gatekeeper)
  // we don't want this, as the tx will be sent by some other relayer, so remove it.
  delete populatedForwardedTransaction.from;
  return populatedForwardedTransaction;
};
