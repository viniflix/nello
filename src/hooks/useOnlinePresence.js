import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * useOnlinePresence
 *
 * Works on both sides:
 * - Nutritionist: calls this hook to subscribe and read online state of all users.
 * - Patient: calls this hook (from PatientMobileLayout) to register their own presence.
 *
 * How Supabase Realtime Presence works:
 * - presenceState() returns an object keyed by the channel "key" (which we set to user.id).
 * - Each key maps to an array of presence payloads for that user.
 * - So to get all online user IDs we just need Object.keys(presenceState()).
 */
export const useOnlinePresence = () => {
    const { user } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    const syncState = useCallback((channel) => {
        const state = channel.presenceState();
        // The keys of presenceState ARE the user IDs (because we set config.presence.key = user.id)
        const ids = new Set(Object.keys(state));
        setOnlineUsers(ids);
    }, []);

    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase.channel('platform:presence', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        // Sync: fired after the initial state is downloaded and after any change
        channel.on('presence', { event: 'sync' }, () => {
            syncState(channel);
        });

        // Join: a user came online — sync full state (safer than manually patching)
        channel.on('presence', { event: 'join' }, () => {
            syncState(channel);
        });

        // Leave: a user went offline — sync full state
        channel.on('presence', { event: 'leave' }, () => {
            syncState(channel);
        });

        // Subscribe and immediately track self
        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString(),
                });
            }
        });

        return () => {
            channel.untrack();
            supabase.removeChannel(channel);
        };
    }, [user?.id, syncState]);

    /**
     * Returns true if the given userId is currently online.
     */
    const isUserOnline = useCallback(
        (userId) => onlineUsers.has(userId),
        [onlineUsers]
    );

    return { onlineUsers, isUserOnline };
};
