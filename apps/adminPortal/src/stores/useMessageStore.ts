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
      const index = state.messages.findIndex(
        (currentMessage) => currentMessage.messageId === message.messageId
      );

      let nextMessages: ChatMessageState[];
      if (index !== -1) {
        // Update existing message
        nextMessages = [...state.messages];
        nextMessages[index] = normalizeMessage(message);
      } else {
        // Add new message
        nextMessages = [...state.messages, normalizeMessage(message)];
      }

      return {
        messages: nextMessages.sort((left, right) => left.sequenceId - right.sequenceId),
      };
    }),
}));
