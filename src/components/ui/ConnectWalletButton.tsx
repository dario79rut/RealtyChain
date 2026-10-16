import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useWalletNotice } from '../../solana/provider';
import { useEthereumWallet } from '../../context/EthereumContext';

const WALLET_MISSING = 'Install Phantom or Solflare, then try connecting again.';

type ConnectWalletButtonProps = {
  showBalance?: boolean;
};

function shortAddress(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function SolanaConnectWalletButton() {
  const { connected, connecting, publicKey, connect, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { notice, clearNotice } = useWalletNotice();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const hideToast = () => {
    clearTimeout(hideTimer.current);
    setToastVisible(false);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hideToast, 4500);
  };

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!notice) return;
    showToast(notice);
    clearNotice();
  }, [notice, clearNotice]);

  useEffect(() => {
    if (connected) hideToast();
  }, [connected]);

  useEffect(() => {
    if (!wallet || connected || connecting) return;
    if (wallet.readyState === WalletReadyState.NotDetected || wallet.readyState === WalletReadyState.Unsupported) {
      showToast(WALLET_MISSING);
    }
  }, [wallet, connected, connecting]);

  const onClick = () => {
    if (connected) {
      disconnect().catch(() => undefined);
      return;
    }
    if (wallet && (wallet.readyState === WalletReadyState.Installed || wallet.readyState === WalletReadyState.Loadable)) {
      connect().catch(() => undefined); // The provider displays wallet errors.
      return;
    }
    setVisible(true);
  };

  const label = connecting
    ? 'Connecting…'
    : connected && publicKey
      ? shortAddress(publicKey.toBase58())
      : 'Connect Wallet';

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={connecting}
        aria-busy={connecting}
        title={connected && publicKey ? `Disconnect ${publicKey.toBase58()}` : 'Connect a Solana wallet'}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-void-950 disabled:opacity-70"
      >
        {label}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {toastVisible && (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="fixed top-5 right-5 z-[200] max-w-sm rounded-xl border border-amber-500/30 bg-void-800 px-4 py-3 shadow-xl"
              >
                <div className="flex items-start gap-3">
                  <p className="text-sm text-amber-100 leading-snug">{toastMessage}</p>
                  <button
                    type="button"
                    onClick={hideToast}
                    className="shrink-0 rounded-md p-0.5 text-cream-400 hover:text-cream-100"
                    aria-label="Dismiss"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

export function ConnectWalletButton(_props: ConnectWalletButtonProps) {
  const solana = useWallet();
  const ethereum = useEthereumWallet();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const address = solana.publicKey?.toBase58() || ethereum.address;

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { ethereum.discover(); setOpen(true); }}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-void-950"
      >
        {address ? shortAddress(address) : 'Connect Wallet'}
      </button>
      {typeof document !== 'undefined' && createPortal(
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
          onClick={(event) => { if (event.target === dialog.current) setOpen(false); }}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-void-600 bg-void-800 p-0 text-cream-100 backdrop:bg-black/70"
        >
          <div className="p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id={titleId} className="text-xl font-semibold">Connect a wallet</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet picker"><XIcon size={20} /></button>
            </div>
            <section className="border-b border-void-600 pb-5">
              <h3 className="mb-2 font-medium">Solana</h3>
              <p className="mb-3 text-sm text-cream-400">Phantom, Solflare, and compatible Solana wallets. Used for RealtyChain account linking and on-chain actions.</p>
              {solana.publicKey && <p className="mb-3 break-all text-xs">{solana.publicKey.toBase58()}</p>}
              <div onClick={() => setOpen(false)}><SolanaConnectWalletButton /></div>
            </section>
            <section className="pt-5">
              <h3 className="mb-2 font-medium">Ethereum / EVM</h3>
              <p className="mb-3 text-sm text-cream-400">Connect MetaMask or another installed Ethereum wallet. RealtyChain transactions currently use Solana.</p>
              {ethereum.address ? (
                <>
                  <p className="mb-2 break-all text-xs">{ethereum.address}</p>
                  <p className="mb-3 text-sm text-cream-400">Chain ID: {parseInt(ethereum.chainId, 16)}</p>
                  <button type="button" onClick={ethereum.disconnect} className="rounded-lg border border-void-600 px-3 py-2 text-sm">Disconnect from app</button>
                </>
              ) : (
                <div className="grid gap-2">
                  {ethereum.wallets.map((wallet) => (
                    <button type="button" key={wallet.id} disabled={ethereum.connecting} onClick={() => void ethereum.connect(wallet)} className="rounded-lg border border-void-600 px-3 py-2 text-left text-sm hover:border-accent disabled:opacity-60">
                      {ethereum.connecting ? 'Connecting…' : wallet.name}
                    </button>
                  ))}
                  {!ethereum.wallets.length && <p className="text-sm text-cream-400">Install MetaMask or a compatible browser wallet, or open this site in your wallet’s browser.</p>}
                </div>
              )}
              {ethereum.error && <p role="alert" className="mt-3 text-sm text-red-300">{ethereum.error}</p>}
            </section>
          </div>
        </dialog>, document.body,
      )}
    </>
  );
}
