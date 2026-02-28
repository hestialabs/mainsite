'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function LoginPage() {
  const { signIn, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  if (user && !authLoading) {
    router.replace('/dashboard');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      toast.error('Email and password are required');
      setLoading(false);
      return;
    }

    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch {
      toast.error('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-xs uppercase tracking-widest text-muted-foreground">
          Initializing...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
            Hestia Control
          </div>
          <h1 className="text-3xl font-bold uppercase tracking-tighter">
            Infrastructure Access
          </h1>
        </div>

        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest">Authenticate</CardTitle>
            <CardDescription>
              Sign in with your tenant credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] uppercase tracking-widest font-bold">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="contact@hestialabs.in"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] uppercase tracking-widest font-bold">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="font-mono text-sm"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full uppercase tracking-widest text-[10px] font-bold"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground uppercase tracking-widest">
          Access is invite-only during beta.
        </p>
      </div>
    </div>
  );
}
