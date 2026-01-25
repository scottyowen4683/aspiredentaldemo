import { useEffect, useState } from "react";
import { supabase } from '../../supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { RectangleEllipsis } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import QRCode from 'qrcode'

interface EnrollMFAProps {
  onEnrolled: () => void;
  onCancelled: () => void;
}

export default function EnrollMFA() {
  const { toast } = useToast();
  const { refreshUser } = useUser();
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState("");
  const [qrSecret, setQRSecret] = useState(""); // QR code SVG
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [redirect, setRedirect] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')

  // Call enroll API on mount
  // useEffect(() => {
  //   (async () => {
  //     const { data, error } = await supabase.auth.mfa.enroll({
  //       factorType: "totp",
  //     });

  //     if (error) {
  //       setError(error.message);
  //       return;
  //     }

  //     setFactorId(data.id);


  //     const qr_code_uri = data?.totp?.uri;
  //     const qr_secret = data?.totp?.secret;

  //     setQRSecret(qr_secret || "");

  //     // // Fetch QR code SVG
  //     if (qr_code_uri) {
  //       QRCode.toDataURL(qr_code_uri, {
  //         width: 300,
  //         margin: 2,
  //         color: {
  //           dark: '#000000',
  //           light: '#FFFFFF'
  //         }
  //       })
  //         .then(url => {
  //           setQrCodeDataUrl(url)
  //         })
  //         .catch(err => {
  //           console.error('Error generating QR code:', err)
  //         })
  //     }

  //   })();
  // }, []);

useEffect(() => {
  (async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });

    if (error) {
      setError(error.message);
      return;
    }

    setFactorId(data.id);

    const qr_secret = data?.totp?.secret;
    setQRSecret(qr_secret || "");

    if (qr_secret) {
      // Rebuild TOTP URI with custom issuer
      const email = (await supabase.auth.getUser()).data.user?.email || "user@example.com";
      const otpauthUrl = `otpauth://totp/${encodeURIComponent("Aspire Executive AI:" + email)}?secret=${qr_secret}&issuer=${encodeURIComponent("Aspire Executive AI")}&algorithm=SHA1&digits=6&period=30`;

      // Generate QR code
      QRCode.toDataURL(otpauthUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error('Error generating QR code:', err));
    }

  })();
}, []);




  const onEnableClicked = async () => {
    setError("");
    try {
      // Create challenge
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      // Verify code entered by user
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      // 🔥 Update user's MFA status in your users table
      const { data: userData } = await supabase.auth.getUser();
      const authId = userData?.user?.id;

      if (authId) {
        await supabase
          .from("users")
          .update({ mfa_enabled: true })
          .eq("auth_id", authId);
      }

      toast({
        title: "MFA Enabled!",
        description: "You have successfully enabled Multi-Factor Authentication.",
      });

      // Refresh user data after MFA enrollment
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

  const onCancelClicked = () => {
    supabase.auth.signOut();
    // navigate back home
    navigate("/");

  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex justify-center mb-8">
          <img src="/aspire.png" alt="Aspire Logo" className="w-full max-w-sm" />
        </Link>
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2 text-center justify-center">
              {/* lucid react icon for multi factor enrollment */}
              <RectangleEllipsis className="h-6 w-6 text-primary" />
              Enroll Multi-Factor Authentication
            </CardTitle>
            <CardDescription className="text-center">
              Scan this QR code with your authenticator app.
            </CardDescription>
            <div className="flex justify-center mt-3">
              {qrCodeDataUrl ? (
                <div className="rounded-lg border-2 border-border p-4 bg-card">
                  <img src={qrCodeDataUrl} alt="QR Code" className="w-full h-auto" />
                </div>
              ) : (
                <div className="text-muted-foreground">Generating QR code...</div>
              )}
            </div>

            <div className="text-sm text-muted-foreground text-center max-w-md break-all">
              <p className="font-semibold mb-1">Secret:</p>
              <p className="font-mono text-xs">{qrSecret}</p>
            </div>

            <CardContent className="p-0">
              <Label htmlFor="login-email">Enter Code</Label>
              <Input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.trim())}
                placeholder="Enter code from app"
                className="border p-2 mt-2 w-full"
              />
              <div className="flex mt-2 gap-2 items-center">
                <Button onClick={onEnableClicked} >
                  Enable
                </Button>
                <Button onClick={onCancelClicked} >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
