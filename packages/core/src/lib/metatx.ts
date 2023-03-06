import {
  Contract,
  type BigNumber,
  type PopulatedTransaction,
  type Wallet,
} from "ethers";

import { type Forwarder } from "./Forwarder";
import {
  type EIP712Domain,
  type EIP712Message,
  type EIP712TypedData,
} from "eth-sig-util";
import {
  type TypedDataField,
  type TypedDataSigner,
} from "@ethersproject/abstract-signer";
import forwarderAbi from "./forwarderAbi.json";

interface Input {
  from: string;
  to: string;
  data: string;
}

export type StaticEIP712Domain = Omit<
  EIP712Domain,
  "verifyingContract" | "chainId"
>;

const eip712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

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
  domain: StaticEIP712Domain
): Omit<EIP712TypedData, "message"> => ({
  types: {
    EIP712Domain: eip712Domain,
    ForwardRequest: forwardRequest,
  },
  domain: {
    ...domain,
    chainId,
    verifyingContract,
  },
  primaryType: "ForwardRequest",
});

async function signTypedData(
  signer: TypedDataSigner,
  data: EIP712TypedData
): Promise<string> {
  const types: Record<string, TypedDataField[]> = {
    ForwardRequest: forwardRequest,
  };

  return signer._signTypedData(data.domain, types, data.message);
}

const buildRequest = async (
  forwarder: Forwarder,
  input: Input
): Promise<ForwardRequest> => {
  const nonce = await forwarder
    .getNonce(input.from)
    .then((nonce: BigNumber) => nonce.toString());
  console.log("nonce", nonce);
  return { value: 0, gas: 2e6, nonce, ...input };
};

const buildTypedData = async (
  forwarder: Contract,
  request: EIP712Message,
  domain: StaticEIP712Domain
): Promise<EIP712TypedData> => {
  const chainId = await forwarder.provider.getNetwork().then((n) => n.chainId);
  const typeData = getMetaTxTypeData(chainId, forwarder.address, domain);
  return { ...typeData, message: request };
};

export const signMetaTxRequest = async (
  signer: TypedDataSigner,
  forwarder: Forwarder,
  input: Input,
  domain: StaticEIP712Domain
): Promise<{ request: ForwardRequest; signature: string }> => {
  const request = await buildRequest(forwarder, input);
  const toSign = await buildTypedData(forwarder, request, domain);
  const signature = await signTypedData(signer, toSign);
  return { signature, request };
};

export const createEIP2771ForwardedTransaction = async (
  tx: PopulatedTransaction,
  forwarder: { address: string; EIP712Domain: StaticEIP712Domain },
  wallet: Wallet
): Promise<PopulatedTransaction> => {
  if (tx.data === undefined || tx.to === undefined)
    throw new Error(
      "ITX requires a data field and to address in the transaction."
    );
  const forwarderContract = new Contract(
    forwarder.address,
    forwarderAbi
  ).connect(wallet) as Forwarder;
  const { request, signature } = await signMetaTxRequest(
    wallet,
    forwarderContract,
    {
      from: wallet.address,
      to: tx.to,
      data: tx.data,
    },
    forwarder.EIP712Domain
  );

  const populatedForwardedTransaction =
    await forwarderContract.populateTransaction.execute(request, signature);
  // ethers will set the from address on the populated transaction to the current wallet address (i.e the gatekeeper)
  // we don't want this, as the tx will be sent by some other relayer, so remove it.
  delete populatedForwardedTransaction.from;
  return populatedForwardedTransaction;
};
