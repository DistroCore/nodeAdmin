import { create } from 'zustand';

export type SocketConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

interface SocketState {
  connectionState: SocketConnectionState;
  setConnectionState: (connectionState: SocketConnectionState) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  connectionState: 'disconnected',
  setConnectionState: (connectionState) => set({ connectionState }),
}));
