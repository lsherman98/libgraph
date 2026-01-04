import { createLazyFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pb } from "@/lib/pocketbase";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import type { AuthMethodsList, RecordAuthResponse } from "pocketbase";
import type { UsersResponse } from "@/lib/pocketbase-types";

export const Route = createLazyFileRoute("/signin")({
  component: LoginForm,
});

/**
 * Look for the user name and avatar in the OAuth2 provider's response and update the user's
 * profile.
 *
 * @param authData data returned from the OAuth2 provider after successful authentication
 * @returns
 */
const updateProfileFromOAuth2 = async (authData: RecordAuthResponse<UsersResponse>) => {
  const meta = authData.meta;

  if (!meta) {
    return;
  }

  const formData = new FormData();

  if (meta.avatarUrl) {
    const response = await fetch(meta.avatarUrl);

    if (response.ok) {
      const file = await response.blob();
      formData.append("avatar", file);
    }
  }

  if (meta.name) {
    formData.append("name", meta.name);
  }

  await pb.collection("users").update(authData.record.id, formData);
};

const UserLoginForm = () => {
  const navigate = useNavigate();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        try {
          const form = event.target as HTMLFormElement;
          const email = form.email.value;
          const password = form.password.value;
          const isAdmin = form["admin-auth"]?.[1]?.checked;

          if (isAdmin) {
            await pb.collection("_superusers").authWithPassword(email, password);
          } else {
            await pb.collection("users").authWithPassword(email, password);
          }

          toast.success("Successfully signed in!");
          navigate({ to: "/" });
        } catch (error: any) {
          console.error(error);
          const message = "Failed to sign in. Please check your credentials.";
          toast.error(message);
        }
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" name="email" placeholder="your@email.com" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <Button type="submit" className="w-full">
        Sign in
      </Button>
    </form>
  );
};

const UserCreateForm = () => {
  const navigate = useNavigate();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        try {
          const form = event.target as HTMLFormElement;
          const username = form.username.value;
          const email = form.email.value;
          const password = form.password.value;

          const data = {
            name: username,
            email,
            password,
            passwordConfirm: password,
          };

          await pb.collection("users").create(data);
          await pb.collection("users").requestVerification(email);
          await pb.collection("users").authWithPassword(email, password);

          toast.success("Account created successfully!");
          navigate({ to: "/" });
        } catch (error: any) {
          console.error(error);
          let message = "Failed to create account. Please try again.";

          if (error?.data?.data) {
            const errorData = error.data.data;
            if (errorData.email) {
              message = "This email is already in use.";
            } else if (errorData.password) {
              message = "Password does not meet requirements.";
            }
          } else if (error?.message) {
            message = error.message;
          }

          toast.error(message);
        }
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-2">
        <Label htmlFor="username">Name</Label>
        <Input id="username" type="text" name="name" placeholder="Your Name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" name="email" placeholder="your@email.com" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
      </div>

      <Button type="submit" className="w-full">
        Create account
      </Button>
    </form>
  );
};

const PasswordResetRequestForm = ({ onBack }: { onBack: () => void }) => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setIsLoading(true);

        try {
          const form = event.target as HTMLFormElement;
          const email = form.email.value;

          await pb.collection("users").requestPasswordReset(email);

          toast.success("Password reset email sent! Please check your inbox.");
          onBack();
        } catch (error: any) {
          console.error(error);
          const message = error?.message || "Failed to send password reset email.";
          toast.error(message);
        } finally {
          setIsLoading(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <CardDescription>Enter your email address and we'll send you a link to reset your password.</CardDescription>

      <div className="grid gap-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input id="reset-email" type="email" name="email" placeholder="your@email.com" required />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Sending..." : "Send Reset Link"}
      </Button>

      <div className="flex justify-center">
        <Button onClick={onBack} variant="link" type="button">
          Back to sign in
        </Button>
      </div>
    </form>
  );
};

const UserAuthForm = () => {
  const [isSignIn, setIsSignIn] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);

  if (isResetPassword) {
    return <PasswordResetRequestForm onBack={() => setIsResetPassword(false)} />;
  }

  return (
    <>
      <CardDescription>Use your email and password to access your account.</CardDescription>

      <div className="flex justify-between items-center">
        <Button onClick={() => setIsResetPassword(true)} variant="link" className="px-0">
          Forgot password?
        </Button>
        <Button onClick={() => setIsSignIn(!isSignIn)} variant="link">
          {isSignIn ? "Create an account" : "Login"}
        </Button>
      </div>

      {isSignIn ? <UserLoginForm /> : <UserCreateForm />}
    </>
  );
};

function LoginForm() {
  const navigate = useNavigate();

  const [authProviders, setAuthProviders] = useState<AuthMethodsList | null>(null);

  const hasPasswordAuth: boolean = !!authProviders?.password;
  const hasSocialAuth: boolean = !!authProviders?.oauth2.providers.length;

  useEffect(() => {
    pb.collection("users")
      .listAuthMethods()
      .then((result) => {
        setAuthProviders(result);
      });
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Toaster position="top-center" />
      <div className="flex justify-center items-center flex-1">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {hasSocialAuth && <CardDescription>Login with one of the following providers.</CardDescription>}

            {authProviders?.oauth2?.providers?.map((provider) => (
              <Button
                key={provider.name}
                className="w-full"
                variant="outline"
                onClick={async () => {
                  try {
                    const authData = await pb.collection("users").authWithOAuth2({
                      provider: provider.name,
                    });

                    await updateProfileFromOAuth2(authData);

                    toast.success("Successfully signed in!");
                    navigate({ to: "/" });
                  } catch (error: any) {
                    console.error(error);
                    const message = "Failed to sign in.";
                    toast.error(message);
                  }
                }}
              >
                <img src={`${pb.baseURL}_/images/oauth2/${provider.name}.svg`} className="h-4 w-4 mr-4" />
                Sign in with {provider.displayName}
              </Button>
            ))}

            {hasPasswordAuth && hasSocialAuth && <Separator />}

            {hasPasswordAuth && <UserAuthForm />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
