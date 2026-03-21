import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export const useOnlinePresence = () => {
    const { user } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    useEffect(() => {
        if (!user) return;

        // Initialize channel for platform presence
        const presenceChannel = supabase.channel('platform:presence', {
            config: {
                presence: {
                    key: user.id
                }
            }
        });

        // Listen for sync events
        presenceChannel.on('presence', { event: 'sync' }, () => {
            const newState = presenceChannel.presenceState();
            const activeUserIds = new Set();
            
            Object.values(newState).forEach(presences => {
                presences.forEach(p => {
                    if (p.online_at) {
                        activeUserIds.add(p.user_id);
                    }
                });
            });
            
            setOnlineUsers(activeUserIds);
        });

        // Listen for join events
        presenceChannel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
            setOnlineUsers(prev => {
                const updated = new Set(prev);
                newPresences.forEach(p => {
                    if (p.user_id) updated.add(p.user_id);
                });
                return updated;
            });
        });

        // Listen for leave events
        presenceChannel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            setOnlineUsers(prev => {
                const updated = new Set(prev);
                leftPresences.forEach(p => {
                    if (p.user_id) updated.delete(p.user_id);
                });
                return updated;
            });
        });

        // Subscribe to channel and track self
        presenceChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                const statusData = {
                    user_id: user.id,
                    online_at: new Date().toISOString()
                };
                await presenceChannel.track(statusData);
            }
        });

        return () => {
            presenceChannel.untrack();
            supabase.removeChannel(presenceChannel);
        };
    }, [user]);

    /**
     * Helper to check if a specific user ID is online
     */
    const isUserOnline = (userId) => {
        return onlineUsers.has(userId);
    };

    return {
        onlineUsers,
        isUserOnline
    };
};
