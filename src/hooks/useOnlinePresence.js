import { useCallback } from 'react';
import { useRealtime } from '@/contexts/RealtimeContext';

// Consumers share one private inbox; calls never create Presence channels.
export const useOnlinePresence = () => {
  const { peers, setTyping, connection, presenceReady } = useRealtime();
  const isUserOnline = useCallback(id => peers.some(peer => peer.id === id && peer.online), [peers]);
  const isUserTyping = useCallback(id => peers.some(peer => peer.id === id && peer.typing), [peers]);
  const isRelationshipActive = useCallback(id => peers.some(peer => peer.id === id), [peers]);
  return { presenceReady, isRelationshipActive, onlineUsers: new Set(peers.filter(peer => peer.online).map(peer => peer.id)), isUserOnline, isUserTyping, setTyping, connection };
};
