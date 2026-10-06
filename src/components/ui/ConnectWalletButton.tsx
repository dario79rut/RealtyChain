import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';

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

type ConnectWalletButtonProps = {
  showBalance?: boolean;
};

function shortAddress(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function ConnectWalletButton({ showBalance: _showBalance = true }: ConnectWalletButtonProps) {
  const simulateExtensionError = simulateWalletExtensionErrorEnabled();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [toastVisible, setToastVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const hideToast = () => {
    clearTimeout(hideTimer.current);
    setToastVisible(false);
  };

  const showToast = () => {
    setToastVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hideToast, 4500);
  };

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const onClick = () => {
    if (simulateExtensionError && !connected) {
      showToast();
      return;
    }
    if (connected) {
      disconnect().catch(() => undefined);
      return;
    }
    setVisible(true);
  };

  const label = connected && publicKey ? shortAddress(publicKey.toBase58()) : 'Connect Wallet';

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-void-950"
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
                  <p className="text-sm text-amber-100 leading-snug">{EXTENSION_ERROR}</p>
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
