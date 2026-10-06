import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useWalletNotice } from '../../solana/provider';

const WALLET_MISSING = 'Install Phantom or Solflare, then try connecting again.';
const EXTENSION_ERROR = 'Could not reach your wallet browser extension.';

/** Set to true to drop the connection after a wallet is chosen and show EXTENSION_ERROR. */
const SIMULATE_WALLET_EXTENSION_ERROR = false;

type ConnectWalletButtonProps = {
  showBalance?: boolean;
};

function shortAddress(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function ConnectWalletButton({ showBalance: _showBalance = true }: ConnectWalletButtonProps) {
  const { connected, connecting, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { notice, clearNotice } = useWalletNotice();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const connectAttempt = useRef(false);

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
    if (!wallet || connected || connecting || SIMULATE_WALLET_EXTENSION_ERROR) return;
    if (wallet.readyState === WalletReadyState.NotDetected || wallet.readyState === WalletReadyState.Unsupported) {
      showToast(WALLET_MISSING);
    }
  }, [wallet, connected, connecting, SIMULATE_WALLET_EXTENSION_ERROR]);

  useEffect(() => {
    if (!SIMULATE_WALLET_EXTENSION_ERROR || !connectAttempt.current || !wallet) return;
    connectAttempt.current = false;
    showToast(EXTENSION_ERROR);
    disconnect().catch(() => undefined);
  }, [SIMULATE_WALLET_EXTENSION_ERROR, wallet, disconnect]);

  const onClick = () => {
    if (connected) {
      disconnect().catch(() => undefined);
      return;
    }
    connectAttempt.current = true;
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
