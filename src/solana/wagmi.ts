import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { encodeInstruction } from './instruction';

type WriteArgs = {
  functionName: string;
  args?: unknown[];
  address?: string;
  abi?: unknown;
};

function programId() {
  const raw = (import.meta.env.VITE_SOLANA_PROGRAM_ID || '').trim();
  if (!raw) {
    throw new Error('Set VITE_SOLANA_PROGRAM_ID to the deployed RealtyChain program.');
  }
  return new PublicKey(raw);
}

export function useAccount() {
  const { publicKey, connected, connecting, disconnecting } = useWallet();
  let status: 'connected' | 'connecting' | 'disconnected' | 'reconnecting' = 'disconnected';
  if (connecting) status = 'connecting';
  else if (disconnecting) status = 'reconnecting';
  else if (connected) status = 'connected';
  return {
    address: publicKey ? publicKey.toBase58() : undefined,
    isConnected: connected,
    status,
    chain: connected ? { id: 103, name: 'Solana' } : undefined,
  };
}

export function useDisconnect() {
  const { disconnect } = useWallet();
  return { disconnect };
}

export function usePublicClient() {
  const { connection } = useConnection();
  return {
    waitForTransactionReceipt: async ({ hash }: { hash: string }) => {
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: hash, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        'confirmed',
      );
      return { transactionHash: hash };
    },
    readContract: async () => undefined,
  };
}

export function useReadContract(_args?: unknown) {
  const refetch = useCallback(async () => ({ data: undefined }), []);
  return { data: undefined, refetch, isLoading: false, error: null };
}

export function useReadContracts(_args?: unknown) {
  const refetch = useCallback(async () => ({ data: undefined }), []);
  return { data: undefined as undefined, refetch, isLoading: false };
}

export function useSignTypedData() {
  const { publicKey, signMessage } = useWallet();
  return {
    signTypedDataAsync: async () => {
      if (!publicKey || !signMessage) throw new Error('Connect a Solana wallet that can sign messages.');
      const signed = await signMessage(new TextEncoder().encode('RealtyChain subscription'));
      const hex = Array.from(signed).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `0x${hex}` as `0x${string}`;
    },
  };
}

export function useWaitForTransactionReceipt({ hash }: { hash?: string }) {
  return {
    isLoading: false,
    isSuccess: Boolean(hash),
    error: null,
    data: hash ? { transactionHash: hash } : undefined,
  };
}

export function useWriteContract() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [isPending, setPending] = useState(false);
  const [hash, setHash] = useState<string | undefined>();

  const writeContractAsync = useCallback(async ({ functionName, args }: WriteArgs) => {
    if (!publicKey) throw new Error('Connect a Solana wallet first.');
    setPending(true);
    try {
      const id = programId();
      const keys = [{ pubkey: publicKey, isSigner: true, isWritable: true }];
      if (String(functionName).toLowerCase() === 'configure') {
        const [config] = PublicKey.findProgramAddressSync([new TextEncoder().encode('config')], id);
        const usdcMint = new PublicKey(
          import.meta.env.VITE_SOLANA_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        );
        keys.push(
          { pubkey: config, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: false },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        );
      }
      const ix = new TransactionInstruction({
        programId: id,
        keys,
        data: encodeInstruction(functionName, args),
      });
      const tx = new Transaction().add(ix);
      const latest = await connection.getLatestBlockhash();
      tx.feePayer = publicKey;
      tx.recentBlockhash = latest.blockhash;
      const signature = await sendTransaction(tx, connection);
      setHash(signature);
      return signature;
    } finally {
      setPending(false);
    }
  }, [connection, publicKey, sendTransaction]);

  return {
    writeContractAsync,
    data: hash,
    isPending,
    reset: () => setHash(undefined),
  };
}

export function WagmiProvider({ children }: { children: React.ReactNode }) {
  return children;
}
