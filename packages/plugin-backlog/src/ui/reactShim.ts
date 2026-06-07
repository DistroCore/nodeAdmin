import type * as ReactNamespace from 'react';

// Plugin UI bundles are loaded at runtime as separate ESM modules. To share the shell's single React
// instance (a second instance throws "Invalid hook call"), the build aliases `react` to this shim,
// which re-exports the host React exposed on window.__NODEADMIN_REACT__ by the shell's entrypoint.
const hostReact = (globalThis as unknown as { __NODEADMIN_REACT__?: typeof ReactNamespace }).__NODEADMIN_REACT__;

if (!hostReact) {
  throw new Error('Host React not found on window.__NODEADMIN_REACT__ — is the nodeAdmin shell loaded?');
}

export default hostReact;
export const {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useContext,
  useReducer,
  createElement,
  createContext,
  forwardRef,
  memo,
  Fragment,
} = hostReact;
