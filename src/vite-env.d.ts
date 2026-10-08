/// <reference types="vite/client" />

declare const __COMMIT_SHA__: string;
declare const __BUILD_TIME__: string;
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_BUSINESS_TIME_ZONE?: string;
  readonly VITE_COMMIT_SHA?: string;
  /** Warranty text printed on receipts, e.g. «30 дней». Omitted when empty. */
  readonly VITE_RECEIPT_WARRANTY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

