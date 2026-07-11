import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * useOnlinePresence
 *
 * Works on both sides:
 * - Nutritionist: calls this hook to subscribe and read online state of all users.
 * - Patient: calls this hook (from PatientLayout) to register their own presence.
 *
 * How Supabase Realtime Presence works:
 * - presenceState() returns an object keyed by the channel "key" (which we set to user.id).
 * - Each key maps to an array of presence payloads for that user.
 * - So to get all online user IDs we just need Object.keys(presenceState()).
 */
export const useOnlinePresence = () => {
    const { user } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    const [typingUsers, setTypingUsers] = useState(new Set());
    const [typingStatus, _setTypingStatus] = useState(false);

    const setTyping = useCallback((isTyping) => {
        _setTypingStatus(isTyping);
    }, []);

    const syncState = useCallback((channel) => {
        const state = channel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        setOnlineUsers(onlineIds);

        // Extrair usuários que estão digitando
        const typingIds = new Set();
        Object.entries(state).forEach(([userId, presences]) => {
            if (presences.some(p => p.is_typing)) {
                typingIds.add(userId);
            }
        });
        setTypingUsers(typingIds);
    }, []);

    useEffect(() => {
        if (!user?.id) return;

        let lastUpdate = 0;
        const THROTTLE_MS = 60000;

        const updateLastSeen = async () => {
            const now = Date.now();
            if (now - lastUpdate < THROTTLE_MS) return;
            lastUpdate = now;
            await supabase.from('user_profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id);
        };

        const channel = supabase.channel('platform:presence', {
            config: { presence: { key: user.id } },
        });

        channel.on('presence', { event: 'sync' }, () => syncState(channel));
        channel.on('presence', { event: 'join' }, () => syncState(channel));
        channel.on('presence', { event: 'leave' }, () => syncState(channel));

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString(),
                    is_typing: typingStatus
                });
                await updateLastSeen();
            }
        });

        // Re-track quando o status de digitando mudar
        if (typingStatus !== undefined) {
             channel.track({
                user_id: user.id,
                online_at: new Date().toISOString(),
                is_typing: typingStatus
            });
        }

        const interval = setInterval(updateLastSeen, THROTTLE_MS);

        return () => {
            clearInterval(interval);
            channel.untrack();
            supabase.removeChannel(channel);
        };
    }, [user?.id, syncState, typingStatus]);

    const isUserOnline = useCallback((userId) => onlineUsers.has(userId), [onlineUsers]);
    const isUserTyping = useCallback((userId) => typingUsers.has(userId), [typingUsers]);

    return { onlineUsers, isUserOnline, isUserTyping, setTyping };
};
