import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

/**
 * AuthVerifyPage
 * Handles Supabase email verification tokens (invite, signup, etc.)
 * when they are routed through the app domain.
 */
export default function AuthVerifyPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [verifying, setVerifying] = useState(true);

    useEffect(() => {
        const handleVerify = async () => {
            const token = searchParams.get('token');
            const type = searchParams.get('type'); // 'invite', 'signup', 'recovery', etc.
            const redirectTo = searchParams.get('redirect_to') || '/login';
            
            // Extract the pathname from redirectTo if it's a full URL on our domain
            let targetPath = redirectTo;
            try {
                const url = new URL(redirectTo);
                if (url.origin === window.location.origin) {
                    targetPath = url.pathname + url.search + url.hash;
                }
            } catch (e) {
                // Not a valid URL, use as is
            }

            if (!token || !type) {
                console.error('[AuthVerify] Missing token or type');
                setVerifying(false);
                navigate('/login');
                return;
            }

            try {
                // Verify the OTP/Token
                const { error } = await supabase.auth.verifyOtp({
                    token_hash: token,
                    type: type,
                });

                if (error) {
                    console.error('[AuthVerify] Verification error:', error);
                    toast({
                        title: "Erro na verificação",
                        description: "O link pode ter expirado ou já foi utilizado.",
                        variant: "destructive"
                    });
                    navigate('/login');
                } else {
                    console.log('[AuthVerify] Success, redirecting to:', targetPath);
                    // Supabase verifies and establishes a session.
                    // Now redirect to the intended destination.
                    navigate(targetPath, { replace: true });
                }
            } catch (err) {
                console.error('[AuthVerify] Unexpected error:', err);
                navigate('/login');
            } finally {
                setVerifying(false);
            }
        };

        handleVerify();
    }, [searchParams, navigate, toast]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <div className="text-center">
                    <h2 className="text-xl font-bold text-foreground">Verificando sua conta...</h2>
                    <p className="text-sm text-muted-foreground mt-1">Isso levará apenas um momento.</p>
                </div>
            </div>
        </div>
    );
}
