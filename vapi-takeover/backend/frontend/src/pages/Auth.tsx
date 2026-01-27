import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useUser } from "../context/UserContext"; // ✅ import context
import { processInvitation } from "@/services/organizationInvitations";
import * as Yup from "yup";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const loginValidationSchema = Yup.object().shape({
  email: Yup.string()
    .email("Enter a valid email address")
    .required("Email is required"),
  password: Yup.string()
    .required("Password is required"),
});


const signupValidationSchema = Yup.object().shape({
  fullName: Yup.string().required("Full name is required"),
  password: Yup.string()
    .required("Password is required")
    .min(8, "Must be at least 8 characters")
    .matches(/[A-Z]/, "Must contain at least one uppercase letter")
    .matches(/[a-z]/, "Must contain at least one lowercase letter")
    .matches(/[0-9]/, "Must contain at least one number")
    .matches(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});


export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [signupData, setSignupData] = useState({ email: "", password: "", fullName: "" });
  const { user, loading, refreshUser } = useUser(); // ✅ get user + loading state + refresh function
  // login password variables 
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  //  signup password variables
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [signupErrors, setSignupErrors] = useState({});
  const [signupTouched, setSignupTouched] = useState({});

  // Check for invitation token in URL
  const inviteToken = searchParams.get('invite');
  const [isInviteFlow, setIsInviteFlow] = useState(!!inviteToken);
  const [inviteProcessed, setInviteProcessed] = useState(false);


  const handleChange = async (e) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));

    if (touched[name]) {
      try {
        await loginValidationSchema.validateAt(name, { [name]: value });
        setErrors((prev) => ({ ...prev, [name]: "" }));
      } catch (err) {
        setErrors((prev) => ({ ...prev, [name]: err.message }));
      }
    }
  };

  const handleBlur = async (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    try {
      await loginValidationSchema.validateAt(name, { [name]: value });
      setErrors((prev) => ({ ...prev, [name]: "" }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [name]: err.message }));
    }
  };


  const getPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const getStrengthLabel = (score) => {
    switch (score) {
      case 0:
      case 1:
        return { label: "Weak", color: "bg-red-500" };
      case 2:
        return { label: "Fair", color: "bg-orange-400" };
      case 3:
        return { label: "Good", color: "bg-yellow-400" };
      case 4:
        return { label: "Strong", color: "bg-green-500" };
      case 5:
        return { label: "Very Strong", color: "bg-emerald-600" };
      default:
        return { label: "", color: "" };
    }
  };

  const handleSignupBlur = async (e) => {
    const { name, value } = e.target;
    setSignupTouched((prev) => ({ ...prev, [name]: true }));
    try {
      await signupValidationSchema.validateAt(name, { [name]: value });
      setSignupErrors((prev) => ({ ...prev, [name]: "" }));
    } catch (err) {
      setSignupErrors((prev) => ({ ...prev, [name]: err.message }));
    }
  };

  useEffect(() => {
    const checkInvite = async () => {
      if (!inviteToken) return;

      console.log("🎫 Invite token from URL:", inviteToken);

      try {
        // ✅ Clear any existing session when user opens invite link
        console.log("🔄 Clearing existing session for invite flow...");

        // Sign out from Supabase
        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
          console.error("❌ Error signing out:", signOutError);
        } else {
          console.log("✅ Session cleared successfully");
        }

        // Clear any cached user data from localStorage
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.clear();
        console.log("✅ Local storage cleared");

        // Use backend API to validate invite (bypasses RLS)
        const apiBaseUrl = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiBaseUrl}/api/invitations/validate/${inviteToken}`);
        const result = await response.json();

        if (!response.ok) {
          console.error("❌ Invite validation failed:", result.message);

          if (result.expired) {
            toast({
              title: "Invitation Expired",
              description: result.message,
              variant: "destructive",
            });
          } else if (result.accepted) {
            toast({
              title: "Invitation Already Used",
              description: result.message,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Invalid Invitation",
              description: result.message || "This invitation link is not valid.",
              variant: "destructive",
            });
          }
          return;
        }

        if (result.success && result.invitation) {
          console.log("✅ Invite validated:", result.invitation);

          setIsInviteFlow(true);
          setSignupData((prev) => ({ ...prev, email: result.invitation.email }));

          toast({
            title: "Welcome!",
            description: `Create your account to join ${result.invitation.organizationName || 'the organization'}.`,
          });
        } else {
          console.log("❌ Unexpected response:", result);
          toast({
            title: "Invalid Invitation",
            description: "This invitation link is not valid.",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("💥 Error in checkInvite:", err);
        toast({
          title: "Error",
          description: "An error occurred while processing the invitation. Please try again.",
          variant: "destructive",
        });
      }
    };

    checkInvite();
  }, [inviteToken, toast]);

  // ✅ Redirect to dashboard if user already logged in (but not during invite flow)
  useEffect(() => {
    if (!loading && user && !inviteToken) {
      console.log("🔁 [Auth] User already logged in, redirecting to /dashboard");
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate, inviteToken]);

  // Process invitation after successful signup/login

  /*
  useEffect(() => {
    const handleInviteProcessing = async () => {
      if (inviteToken && !inviteProcessed) {
        // Get the current Supabase Auth session to get the auth user ID
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          setInviteProcessed(true);
          console.log('Processing invitation for auth user:', session.user.id);
          
          const result = await processInvitation(inviteToken, session.user.id);
          
          if (result.success) {
            // Force refresh user data to get the updated org_id
            await refreshUser();
            
            toast({
              title: "Welcome!",
              description: result.message,
            });
          } else {
            toast({
              title: "Invitation Error",
              description: result.message,
              variant: "destructive",
            });
          }
          
          // Redirect to dashboard regardless
          navigate("/dashboard", { replace: true });
        }
      }
    };

    handleInviteProcessing();
  }, [user, inviteToken, inviteProcessed, navigate, toast]);

  */

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate all fields before sending
      await loginValidationSchema.validate(loginData, { abortEarly: false });
      setErrors({});

      // // Basic client-side validation to avoid sending empty credentials which cause 400 from Supabase
      // if (!loginData.email.trim() || !loginData.password) {
      //   toast({ title: "Missing credentials", description: "Please enter both email and password.", variant: "destructive" });
      //   setIsLoading(false);
      //   return;
      // }
      const { email, password } = loginData;

      // Use direct Supabase authentication
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast({
          title: "Login failed",
          description: error.message || "Invalid credentials.",
          variant: "destructive",
        });
        return;
      }

      if (data.session) {
        // ✅ Check MFA enrollment/verification
        const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) throw aalError;

        if (aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
          // User has enrolled MFA but not verified yet
          window.location.href = "/vmf"; // AuthMFA
        } else if (aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal1') {
          // User has not enrolled MFA yet
          window.location.href = "/emf"; // EnrollMFA
        } else {
          // User has already verified MFA
          window.location.href = "/dashboard";
        }
      }


    } catch (error) {
      if (error.inner) {
        const formErrors = {};
        error.inner.forEach((e) => (formErrors[e.path] = e.message));
        setErrors(formErrors);
      }
      console.error('Login error:', error);
      toast({
        title: "Login failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Only allow signup with invitation
    if (!isInviteFlow || !inviteToken) {
      toast({
        title: "Signup not allowed",
        description: "You can only create an account through an organization invitation.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Ensure email is set from invitation
    if (!signupData.email) {
      toast({
        title: "Missing email",
        description: "Could not retrieve email from invitation. Please refresh the page and try again.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {

      await signupValidationSchema.validate(signupData, { abortEarly: false });
      setSignupErrors({});

      const { data, error } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
        options: {
          data: { full_name: signupData.fullName },
        },
      });

      if (error) {
        toast({
          title: "Signup failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data.user) {
        console.log('User signed up successfully with invitation:', data.user.id);
        console.log('Signup with invitation token:', inviteToken);

        toast({
          title: "Account created!",
          description: "Processing your invitation...",
        });

        // Process invitation immediately after signup
        try {
          const result = await processInvitation(inviteToken, data.user.id, signupData.email);

          if (result.success) {
            // Force refresh user data to get the updated org_id
            await refreshUser();

            toast({
              title: "Welcome!",
              description: result.message,
            });

            // Redirect to dashboard after successful invitation processing
            navigate("/dashboard", { replace: true });
          } else {
            toast({
              title: "Invitation Error",
              description: result.message,
              variant: "destructive",
            });
          }
        } catch (inviteError) {
          console.error('Error processing invitation:', inviteError);
          toast({
            title: "Invitation Error",
            description: "There was an issue processing your invitation. Please contact support.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast({
        title: "Signup failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetLoading(true);

    try {
      const email = forgotEmail.trim();

      // Basic validation
      if (!email) {
        toast({ title: "Missing email", description: "Please enter your email.", variant: "destructive" });
        setIsResetLoading(false);
        return;
      }

      // Optional: basic email format check
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email)) {
        toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
        setIsResetLoading(false);
        return;
      }

      // Request Supabase to send a password reset email. Include redirectTo so the recovery
      // link returns to our single-page app at /reset-password where the user can set a new password.
      // const redirectTo = "https://portal.aspireexecutive.ai";
      // redirectTo from .env
      const redirectTo = import.meta.env.redirectTo || 'https://portal.aspireexecutive.ai/reset-password';

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });


      // Log the attempt in audit_logs
      try {
        // Get user id if exists
        let userId: string | null = null;
        const { data: userData } = await supabase.from("users").select("id").eq("email", email).single();
        if (userData) userId = userData.id;

        await supabase.from("audit_logs").insert({
          org_id: null,
          user_id: userId,
          action: error ? "password_reset_failed" : "password_reset_requested",
          details: JSON.stringify({
            email,
            ip: window?.location?.hostname || null, // or use server-side headers if available
            userAgent: navigator?.userAgent || null
          }),
          created_at: new Date().toISOString()
        });
      } catch (auditErr) {
        console.error("Failed to log audit event:", auditErr);
      }


      // Supabase v2 commonly returns {} with HTTP 200 on success; treat that as success.
      if (error) {
        toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Email sent", description: "If an account exists for that email, a reset link was sent. Check your inbox." });
        // close dialog and clear field
        setIsResetDialogOpen(false);
        setForgotEmail("");
      }
    } catch (err) {
      console.error("Reset password error:", err);
      toast({ title: "Reset failed", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setIsResetLoading(false);
    }
  };

  if (loading) return (
    <div className="w-full h-screen flex items-center justify-center">
      <div className="w-32 h-32 relative flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-xl bg-blue-500/20 blur-xl animate-pulse"
        ></div>

        <div className="w-full h-full relative flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 animate-spin blur-sm"
          ></div>

          <div
            className="absolute inset-1 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden"
          >
            <div className="flex gap-1 items-center">
              <div
                className="w-1.5 h-12 bg-cyan-500 rounded-full animate-[bounce_1s_ease-in-out_infinite]"
              ></div>
              <div
                className="w-1.5 h-12 bg-blue-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.1s]"
              ></div>
              <div
                className="w-1.5 h-12 bg-indigo-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.2s]"
              ></div>
              <div
                className="w-1.5 h-12 bg-purple-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.3s]"
              ></div>
            </div>

            <div
              className="absolute inset-0 bg-gradient-to-t from-transparent via-blue-500/10 to-transparent animate-pulse"
            ></div>
          </div>
        </div>

        <div
          className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full animate-ping"
        ></div>
        <div
          className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-ping delay-100"
        ></div>
        <div
          className="absolute -bottom-1 -left-1 w-2 h-2 bg-cyan-500 rounded-full animate-ping delay-200"
        ></div>
        <div
          className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping delay-300"
        ></div>
      </div>
    </div>
  ); // wait for userContext

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/aspire.png" alt="Aspire Logo" className="w-full max-w-sm" />
        </div>

        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2 text-center justify-center">
              {isInviteFlow && <UserPlus className="h-6 w-6 text-primary" />}
              {isInviteFlow ? "Join Organization" : "Welcome Back"}
            </CardTitle>
            <CardDescription className="text-center">
              {isInviteFlow
                ? "Complete your account setup to join the organization"
                : "Sign in to your account"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isInviteFlow ? (
              <Tabs defaultValue="signup" className="w-full">
                <TabsList className="grid w-full grid-cols-1">
                  {/* <TabsTrigger value="login">Sign In</TabsTrigger> */}
                  <TabsTrigger value="signup" >Accept Invitation</TabsTrigger>
                </TabsList>

                {/* LOGIN FORM - Only for invite flow */}
                {/* <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In & Accept Invitation"  
                      )}
                    </Button>
                  </form>
                </TabsContent> */}

                {/* SIGNUP FORM - Only for invite flow */}
                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-4">
                    {/* Email - auto-filled from invite or manual entry */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="Enter the email your invitation was sent to"
                        value={signupData.email}
                        onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the email address where you received the invitation.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        name="fullName"
                        type="text"
                        placeholder="John Doe"
                        value={signupData.fullName}
                        onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
                        onBlur={handleSignupBlur}
                        className={
                          signupTouched.fullName && signupErrors.fullName
                            ? "border-red-500 focus-visible:ring-red-500"
                            : ""
                        }
                        required
                      />
                      {signupTouched.fullName && signupErrors.fullName && (
                        <p className="text-red-500 text-sm mt-1">{signupErrors.fullName}</p>
                      )}
                    </div>
                    {/* <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        value={signupData.password}
                        onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                        required
                      />
                    </div> */}

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        name="password"
                        type="password"
                        value={signupData.password}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSignupData({ ...signupData, password: value });
                          setPasswordStrength(getPasswordStrength(value));
                        }}
                        onBlur={handleSignupBlur}
                        className={
                          signupTouched.password && signupErrors.password
                            ? "border-red-500 focus-visible:ring-red-500"
                            : ""
                        }
                        required
                      />
                      {/* Strength Meter */}
                      {signupData.password && (
                        <div className="mt-2">
                          <div className="h-2 w-full bg-gray-200 rounded">
                            <div
                              className={`h-2 rounded transition-all duration-300 ${getStrengthLabel(passwordStrength).color}`}
                              style={{ width: `${(passwordStrength / 5) * 100}%` }}
                            />
                          </div>
                          <p className="text-sm mt-1 font-medium text-gray-600">
                            Strength: {getStrengthLabel(passwordStrength).label}
                          </p>
                        </div>
                      )}
                      {signupTouched.password && signupErrors.password && (
                        <p className="text-red-500 text-sm mt-1">{signupErrors.password}</p>
                      )}
                    </div>



                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account & Join Organization"
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            ) : (
              /* Login only form for non-invite users */
              <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginData.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={touched.email && errors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {touched.email && errors.email && (
                      <p className="text-red-500 text-sm mt-0">{errors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      value={loginData.password}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={touched.password && errors.password ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {touched.password && errors.password && (
                      <p className="text-red-500 text-sm mt-0">{errors.password}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
                <div className="flex items-center justify-between mt-2">
                  <div />
                  <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    {/* trigger is outside the login form to avoid accidental parent form submission */}
                    <button
                      type="button"
                      className="text-sm text-primary underline"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsResetDialogOpen(true);
                      }}
                    >
                      Forgot password?
                    </button>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reset your password</DialogTitle>
                        <DialogDescription>
                          Enter your account email and we'll send a password reset link if an account exists.
                        </DialogDescription>
                      </DialogHeader>

                      <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label htmlFor="forgot-email">Email</Label>
                          <Input
                            id="forgot-email"
                            type="email"
                            placeholder="you@example.com"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            required
                          />
                        </div>

                        <DialogFooter>
                          <Button type="submit" disabled={isResetLoading}>
                            {isResetLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              "Send reset email"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </>
            )}
          </CardContent>
        </Card>


      </div>
    </div>
  );
}
