import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ChatProvider, useChat } from './ChatContext';
import { invalidateDomain } from '@/infrastructure/realtime/events';
const state = vi.hoisted(() => ({ rpc: vi.fn(), chat: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-owner' } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: state.rpc, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } } }));
function Probe() { state.chat = useChat(); return <output>{state.chat.messages.map(row => row.id).join(',')}</output>; }
const message = id => ({id: String(id), created_at: '2026-11-02T10:00:00Z'});
let finishOlder, reads;
beforeEach(() => {
  reads = []; finishOlder = null;
  state.rpc.mockImplementation((name, args) => {
    if (name !== 'list_chat_messages') return Promise.resolve({data: []});
    reads.push(args);
    if (args.p_before_id) return new Promise(resolve => { finishOlder = resolve; });
    return Promise.resolve({data: {messages: [message(2)], has_more: true}});
  });
});
async function open() {
  render(<ChatProvider><Probe /></ChatProvider>);
  await act(async () => { await state.chat.fetchMessages('synthetic-owner', 'synthetic-peer'); });
}
it('coalesces refresh during prepend and reconciles against the confirmed older page', async () => {
  await open();
  let older;
  act(() => { older = state.chat.loadOlderMessages(); });
  await waitFor(() => expect(finishOlder).toBeTypeOf('function'));
  await act(async () => {
    await state.chat.fetchMessages('synthetic-owner', 'synthetic-peer', {refresh: true});
    await state.chat.fetchMessages('synthetic-owner', 'synthetic-peer', {refresh: true});
  });
  await act(async () => { finishOlder({data: {messages: [message(1)], has_more: false}}); await older; });
  await waitFor(() => expect(state.chat.messages.map(row => row.id)).toEqual(['1', '2']));
  expect(reads).toHaveLength(3);
  expect(state.chat.hasMoreMessages).toBe(false);
});
it('does not replay a deferred refresh or publish the older page after conversation closes', async () => {
  await open(); let older;
  act(() => { older = state.chat.loadOlderMessages(); });
  await waitFor(() => expect(finishOlder).toBeTypeOf('function'));
  await act(async () => { await state.chat.fetchMessages('synthetic-owner', 'synthetic-peer', {refresh: true}); });
  act(() => { state.chat.closeConversation(); });
  await act(async () => { finishOlder({data: {messages: [message(1)], has_more: false}}); await older; });
  expect(state.chat.messages).toEqual([]);
  expect(reads).toHaveLength(2);
});
it('revokes queued history immediately and ignores its late success after access changes', async () => {
  await open(); let older;
  act(() => { older = state.chat.loadOlderMessages(); });
  await waitFor(() => expect(finishOlder).toBeTypeOf('function'));
  await act(async () => { await state.chat.fetchMessages('synthetic-owner', 'synthetic-peer', {refresh: true}); });
  state.rpc.mockResolvedValue({error: {status: 403}});
  await act(async () => { invalidateDomain('synthetic-owner', 'access'); });
  expect(state.chat.messages).toEqual([]);
  await act(async () => { finishOlder({data: {messages: [message(1)], has_more: false}}); await older; });
  expect(state.chat.messages).toEqual([]);
});

it('keeps prepend protected until its state commit when refresh follows the read promise', async () => {
  await open(); let older;
  act(() => { older = state.chat.loadOlderMessages(); });
  await waitFor(() => expect(finishOlder).toBeTypeOf('function'));
  await act(async () => {
    finishOlder({data: {messages: [message(1)], has_more: false}});
    await older;
    await state.chat.fetchMessages('synthetic-owner', 'synthetic-peer', {refresh: true});
  });
  await waitFor(() => expect(state.chat.messages.map(row => row.id)).toEqual(['1', '2']));
  expect(state.chat.hasMoreMessages).toBe(false);
});
