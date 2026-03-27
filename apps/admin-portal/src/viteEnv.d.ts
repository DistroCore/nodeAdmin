/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CORE_API_BASE_URL?: string;
  readonly VITE_CORE_API_SOCKET_URL?: string;
  readonly VITE_IM_ACCESS_TOKEN?: string;
  readonly VITE_IM_CONVERSATION_ID?: string;
  readonly VITE_IM_ROLES?: string;
  readonly VITE_IM_TENANT_ID?: string;
  readonly VITE_IM_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
