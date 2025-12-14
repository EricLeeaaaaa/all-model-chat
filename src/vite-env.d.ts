/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GEMINI_API_KEY: string;
  readonly GEMINI_API_BASE_URL: string;
  readonly PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}