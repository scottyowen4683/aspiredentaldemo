import { useEffect, useState } from "react";
import { supabase } from '../../supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { RectangleEllipsis } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";

interface AuthMFAProps {
  onSuccess: () => void;
}

export default function AuthMFA() {
  const { toast } = useToast();
  const { refreshUser } = useUser();

  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const onSubmitClicked = async () => {
    setError("");
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      const totpFactor = factors.data.totp[0];
      if (!totpFactor) throw new Error("No TOTP factors found!");

      const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      // Refresh user data after MFA verification
      await refreshUser();

      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });

      // Small delay to ensure context is updated
      setTimeout(() => {
        navigate("/dashboard");
      }, 100);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const oncancelClicked = () => {
    // logout user 
    supabase.auth.signOut();
    navigate("/"); // navigate back home

  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex justify-center mb-8">
          <img src="/aspire.png" alt="Aspire Logo" className="w-full max-w-sm" />
        </Link>
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="text-2xl flex flex-col items-center gap-2 text-center justify-center">
              {/* lucid react icon for multi factor enrollment */}
              <RectangleEllipsis className="h-10 w-10 text-primary" />
              Please enter the code from your authenticator app
            </CardTitle>
            <CardDescription className="text-center">
              {error && <div className="text-red-500">{error}</div>}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Label htmlFor="login-email">Enter Code</Label>
            <Input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.trim())}
              placeholder="TOTP Code"
              className="border p-2 mt-2 w-full"
            />
            <Button onClick={onSubmitClicked} className=" text-white px-4 py-2 mt-2 rounded">
              Submit
            </Button>
            <Button onClick={oncancelClicked} className=" text-white px-4 py-2 mt-2 rounded ml-2">
              Cancel
            </Button>
          </CardContent>

        </Card>
      </div>
    </div>
  );
}

