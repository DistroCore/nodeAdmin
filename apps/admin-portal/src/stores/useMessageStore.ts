import { create } from 'zustand';
import type { ImMessage } from '@nodeadmin/shared-types';

export type ChatMessageState = ImMessage;

interface MessageState {
  messages: ChatMessageState[];
  resetMessages: (messages: ChatMessageState[]) => void;
  upsertMessage: (message: ChatMessageState) => void;
}

function normalizeMessage(message: ChatMessageState): ChatMessageState {
  return {
    ...message,
    messageType: message.messageType ?? 'text',
    metadata: message.metadata ?? null,
  };
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],
  resetMessages: (messages) =>
    set({
      messages: messages
        .map(normalizeMessage)
        .sort((left, right) => left.sequenceId - right.sequenceId),
    }),
  upsertMessage: (message) =>
    set((state) => {
      const duplicated = state.messages.some(
        (currentMessage) => currentMessage.messageId === message.messageId
      );
      if (duplicated) {
        return state;
      }

      return {
        messages: [...state.messages, normalizeMessage(message)].sort(
          (left, right) => left.sequenceId - right.sequenceId
        ),
      };
    }),
}));
