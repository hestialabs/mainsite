'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

function VerifyOtpContent() {
    const searchParams = useSearchParams();
    const emailParam = searchParams.get('email') || '';
    const [email, setEmail] = useState(emailParam);
    const [otp, setOtp] = useState('');
    const { verifyOtp, loading, error } = useAuth();

    useEffect(() => {
        if (emailParam) setEmail(emailParam);
    }, [emailParam]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await verifyOtp(email, otp, 'signup');
        } catch (err) {
            // Error handled by context
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold tracking-tight">Verify your account</CardTitle>
                    <CardDescription>
                        Enter the 6-digit code sent to your email
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-background/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="otp">Verification Code</Label>
                            <Input
                                id="otp"
                                type="text"
                                placeholder="123456"
                                required
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="bg-background/50 text-center tracking-[0.5em] font-mono text-xl"
                                maxLength={6}
                            />
                        </div>
                        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Verifying...' : 'Verify & Continue'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}

export default function VerifyOtpPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <VerifyOtpContent />
        </Suspense>
    );
}
