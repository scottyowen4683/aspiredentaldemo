import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/supabaseClient";
import { Loader2 } from "lucide-react";
import * as Yup from "yup";

// --- Yup schema ---
const passwordSchema = Yup.object().shape({
  password: Yup.string()
    .required("Password is required")
    .min(8, "Password must be at least 8 characters")
    .matches(/[A-Z]/, "Password must contain at least one uppercase letter")
    .matches(/[a-z]/, "Password must contain at least one lowercase letter")
    .matches(/\d/, "Password must contain at least one number")
    .matches(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirm: Yup.string()
    .required("Confirm Password is required")
    .oneOf([Yup.ref("password")], "Passwords must match"),
});

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionPresent, setSessionPresent] = useState(false);

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [errors, setErrors] = useState({ password: "", confirm: "" });
  const [strength, setStrength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- URL hash fix for Supabase recovery links ---
  useEffect(() => {
    if (window.location.hash && window.location.hash.includes("access_token")) {
      const newUrl = window.location.href.replace("#", "?");
      window.history.replaceState(null, "", newUrl);
      window.location.reload();
    }
  }, []);

  // --- Session check ---
  useEffect(() => {
    const init = async () => {
      setLoadingSession(true);
      try {
        const { data } = await supabase.auth.getSession();
        setSessionPresent(!!data?.session?.user);
      } catch (err) {
        console.error(err);
        setSessionPresent(false);
      } finally {
        setLoadingSession(false);
      }
    };
    init();
  }, []);

  // --- Evaluate password strength ---
  const evaluateStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    setStrength(score);
  };

  // --- Handle input change ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === "password") evaluateStrength(value);

    if (touched[name]) {
      passwordSchema
        .validateAt(name, { ...form, [name]: value })
        .then(() => setErrors((prev) => ({ ...prev, [name]: "" })))
        .catch((err) => setErrors((prev) => ({ ...prev, [name]: err.message })));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));

    passwordSchema
      .validateAt(name, { ...form, [name]: value })
      .then(() => setErrors((prev) => ({ ...prev, [name]: "" })))
      .catch((err) => setErrors((prev) => ({ ...prev, [name]: err.message })));
  };

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      await passwordSchema.validate(form, { abortEarly: false });
      setErrors({});

      setIsSubmitting(true);
      const { error } = await supabase.auth.updateUser({ password: form.password });

      // Log the password change attempt
      try {
        const user = supabase.auth.getUser ? await supabase.auth.getUser() : null;
        const userId = user?.data?.user?.id || null;

        await supabase.from("audit_logs").insert({
          org_id: null,
          user_id: userId,
          action: error ? "password_change_failed" : "password_changed",
          details: JSON.stringify({
            ip: window?.location?.hostname || null,
            userAgent: navigator?.userAgent || null,
          }),
          created_at: new Date().toISOString(),
        });
      } catch (auditErr) {
        console.error("Failed to log audit event:", auditErr);
      }

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }

      toast({
        title: "Password updated",
        description: "Your password has been updated. Please sign in.",
      });
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (err: any) {
      if (err.inner) {
        const formErrors: any = {};
        err.inner.forEach((e: any) => (formErrors[e.path] = e.message));
        setErrors(formErrors);
      }
      console.error(err);
      toast({
        title: "Update failed",
        description: "Please fix the errors above.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-600"];

  const type = searchParams.get("type");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSession ? (
              <div className="text-center py-8">Loading...</div>
            ) : !sessionPresent || type !== "recovery" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We couldn't verify a password recovery session. Open the link we emailed you.
                </p>
                <div className="flex justify-end">
                  <Button onClick={() => navigate("/auth")} variant="ghost">Back to sign in</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.password && errors.password ? "border-red-500" : ""}
                    required
                  />
                  {touched.password && errors.password && (
                    <p className="text-xs text-red-500">{errors.password}</p>
                  )}
                  {form.password && (
                    <div className="mt-1">
                      <div className="h-2 rounded bg-gray-200">
                        <div
                          className={`h-2 rounded ${strengthColors[strength - 1]}`}
                          style={{ width: `${(strength / 5) * 100}%` }}
                        ></div>
                      </div>
                      <p className={`text-xs mt-1 ${strength < 3 ? "text-red-500" : strength === 3 ? "text-yellow-500" : "text-green-600"}`}>
                        {strengthLabels[strength - 1] || "Very Weak"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    value={form.confirm}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.confirm && errors.confirm ? "border-red-500" : ""}
                    required
                  />
                  {touched.confirm && errors.confirm && (
                    <p className="text-xs text-red-500">{errors.confirm}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Set new password"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
