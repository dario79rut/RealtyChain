import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useWalletNotice } from '../../solana/provider';

/**
 * Interview defect: show a fake browser-extension error instead of opening
 * the wallet modal. Flip this constant, or set
 * VITE_SIMULATE_WALLET_EXTENSION_ERROR=true|false in .env.
 */
const SIMULATE_WALLET_EXTENSION_ERROR_DEFAULT = false;

export function simulateWalletExtensionErrorEnabled(): boolean {
  const env = import.meta.env.VITE_SIMULATE_WALLET_EXTENSION_ERROR?.trim().toLowerCase();
  if (env === 'true') return true;
  if (env === 'false') return false;
  return SIMULATE_WALLET_EXTENSION_ERROR_DEFAULT;
}

const EXTENSION_ERROR = 'Could not reach your wallet browser extension.';
const WALLET_MISSING = 'Install Phantom or Solflare, then try connecting again.';

type ConnectWalletButtonProps = {
  showBalance?: boolean;
};

function shortAddress(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function ConnectWalletButton({ showBalance: _showBalance = true }: ConnectWalletButtonProps) {
  const simulateExtensionError = simulateWalletExtensionErrorEnabled();
  const { connected, connecting, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { notice, clearNotice } = useWalletNotice();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState(EXTENSION_ERROR);
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
    if (simulateExtensionError && !connected) {
      showToast(EXTENSION_ERROR);
      return;
    }
    if (connected) {
      disconnect().catch(() => undefined);
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
