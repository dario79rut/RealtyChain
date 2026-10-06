/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE: string
  readonly VITE_SOLANA_RPC_URL: string
  readonly VITE_SOLANA_PROGRAM_ID: string
  readonly VITE_SOLANA_USDC_MINT: string
  readonly VITE_MOONPAY_PUBLISHABLE_KEY: string
  readonly VITE_MOONPAY_SANDBOX: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
