import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { ConversationItem, ConversationType, CreateConversationRequest } from '@nodeadmin/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/formField';
import { Input } from '@/components/ui/input';
import { useApiClient } from '@/hooks/useApiClient';
import { className } from '@/lib/className';

interface CreateConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

interface SearchUser {
  avatar: string | null;
  email: string;
  id: string;
  name: string | null;
}

interface SearchUserResult {
  users: SearchUser[];
}

function getUserLabel(user: SearchUser): string {
  return user.name?.trim() || user.email;
}

export function CreateConversationDialog({ open, onClose, onCreated }: CreateConversationDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const [conversationType, setConversationType] = useState<ConversationType>('dm');
  const [groupTitle, setGroupTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<SearchUser[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetDialogState = () => {
    setConversationType('dm');
    setGroupTitle('');
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedUsers([]);
    setSubmitError(null);
  };

  const handleClose = () => {
    resetDialogState();
    onClose();
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, searchQuery]);

  const searchQueryResult = useQuery({
    queryFn: () =>
      apiClient.get<SearchUserResult>(`/api/v1/im/conversations/search-users?q=${encodeURIComponent(debouncedQuery)}`),
    queryKey: ['im', 'conversation-search-users', debouncedQuery],
    enabled: open && debouncedQuery.length > 0,
  });

  const createConversationMutation = useMutation({
    mutationFn: async (payload: CreateConversationRequest) => {
      return apiClient.post<ConversationItem>('/api/v1/im/conversations', payload);
    },
    onSuccess: (conversation) => {
      onCreated(conversation.id);
      handleClose();
    },
    onError: (error: unknown) => {
      const fallback = t({ id: 'im.createConversation.error' });
      setSubmitError(error instanceof Error ? error.message : fallback);
    },
  });

  const selectedUserIds = useMemo(() => new Set(selectedUsers.map((user) => user.id)), [selectedUsers]);
  const searchResults = searchQueryResult.data?.users ?? [];
  const showNoResults = debouncedQuery.length > 0 && !searchQueryResult.isFetching && searchResults.length === 0;

  const handleTypeChange = (nextType: ConversationType) => {
    setConversationType(nextType);
    setSubmitError(null);
    if (nextType === 'dm' && selectedUsers.length > 1) {
      setSelectedUsers(selectedUsers.slice(0, 1));
    }
  };

  const handleToggleUser = (user: SearchUser) => {
    setSubmitError(null);
    setSelectedUsers((current) => {
      const exists = current.some((item) => item.id === user.id);
      if (exists) {
        return current.filter((item) => item.id !== user.id);
      }

      if (conversationType === 'dm') {
        return [user];
      }

      return [...current, user];
    });
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((current) => current.filter((user) => user.id !== userId));
  };

  const handleCreateConversation = () => {
    if (selectedUsers.length === 0) {
      setSubmitError(t({ id: 'im.createConversation.selectAtLeastOne' }));
      return;
    }

    const payload: CreateConversationRequest = {
      type: conversationType,
      memberUserIds: selectedUsers.map((user) => user.id),
      ...(conversationType === 'group' && groupTitle.trim() ? { title: groupTitle.trim() } : {}),
    };

    setSubmitError(null);
    createConversationMutation.mutate(payload);
  };

  return (
    <Dialog onClose={handleClose} open={open} title={t({ id: 'im.createConversation.title' })}>
      <div className="space-y-6">
        <section className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">{t({ id: 'im.createConversation.selectType' })}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { type: 'dm', labelId: 'im.createConversation.dm' },
                { type: 'group', labelId: 'im.createConversation.group' },
              ] as const
            ).map((option) => {
              const isActive = conversationType === option.type;
              return (
                <button
                  aria-pressed={isActive}
                  className={className(
                    'flex min-h-24 flex-col items-start justify-between rounded-lg border p-4 text-left transition-colors',
                    isActive
                      ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                      : 'border-border bg-background hover:bg-muted/40',
                  )}
                  key={option.type}
                  onClick={() => handleTypeChange(option.type)}
                  type="button"
                >
                  <span
                    className={className(
                      'flex h-9 w-9 items-center justify-center rounded-full border',
                      isActive
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {option.type === 'dm' ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M8 10h8M8 14h5m-7 7l3.5-3H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v13l3-2z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2m18 0v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M13 7a4 4 0 11-8 0 4 4 0 018 0zm11 14v-2a4 4 0 00-3-3.87"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm font-semibold">{t({ id: option.labelId })}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <FormField htmlFor="conversation-user-search" label={t({ id: 'im.createConversation.searchUsers' })}>
            <Input
              className="bg-background"
              id="conversation-user-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t({ id: 'im.createConversation.searchUsers' })}
              value={searchQuery}
            />
          </FormField>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t({ id: 'im.createConversation.selectedMembers' })}
            </p>
            <div className="flex min-h-11 flex-wrap gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-3">
              {selectedUsers.length > 0 ? (
                selectedUsers.map((user) => (
                  <Badge className="gap-2 rounded-full px-3 py-1" key={user.id} variant="secondary">
                    <span className="max-w-40 truncate">{getUserLabel(user)}</span>
                    <button
                      aria-label={getUserLabel(user)}
                      className="rounded-full p-0.5 transition-colors hover:bg-black/10"
                      onClick={() => handleRemoveUser(user.id)}
                      type="button"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t({ id: 'im.createConversation.selectAtLeastOne' })}</p>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/10">
            {searchQueryResult.isFetching ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">{t({ id: 'common.loading' })}</div>
            ) : showNoResults ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {t({ id: 'im.createConversation.noResults' })}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {searchResults.map((user) => {
                  const isSelected = selectedUserIds.has(user.id);
                  return (
                    <li key={user.id}>
                      <button
                        className={className(
                          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                        )}
                        onClick={() => handleToggleUser(user)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{getUserLabel(user)}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                        {isSelected ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {conversationType === 'group' ? (
          <FormField htmlFor="conversation-group-title" label={t({ id: 'im.createConversation.groupName' })}>
            <Input
              id="conversation-group-title"
              onChange={(event) => setGroupTitle(event.target.value)}
              placeholder={t({ id: 'im.createConversation.groupName' })}
              value={groupTitle}
            />
          </FormField>
        ) : null}

        {submitError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button
            disabled={createConversationMutation.isPending}
            onClick={handleClose}
            type="button"
            variant="secondary"
          >
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={createConversationMutation.isPending} onClick={handleCreateConversation} type="button">
            {createConversationMutation.isPending
              ? t({ id: 'common.saving' })
              : t({ id: 'im.createConversation.create' })}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
