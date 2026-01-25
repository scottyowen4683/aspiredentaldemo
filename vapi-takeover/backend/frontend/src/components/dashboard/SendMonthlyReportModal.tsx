import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Calendar, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/supabaseClient";

interface SendMonthlyReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
}

export function SendMonthlyReportModal({
  open,
  onOpenChange,
  organizationId,
  organizationName,
}: SendMonthlyReportModalProps) {
  const currentDate = new Date();
  const [email, setEmail] = useState("");
  const [month, setMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [year, setYear] = useState<string>(currentDate.getFullYear().toString());
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  // Generate years from 2025 to current year + 1
  const currentYear = new Date().getFullYear();
  const startYear = 2025;
  const years = [];
  for (let y = startYear; y <= currentYear + 1; y++) {
    years.push(y);
  }

  // Month names for dropdown
  const months = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!email || !month || !year) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();

      // Call the send-monthly-report edge function
      const { data, error } = await supabase.functions.invoke('send-monthly-report', {
        body: {
          email: email,
          orgId: organizationId,
          month: parseInt(month),
          year: parseInt(year),
        },
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: "Email Sent Successfully",
          description: data.emailSent 
            ? `Monthly report sent to ${email}` 
            : `Report generated but email failed: ${data.emailError}`,
          variant: data.emailSent ? "default" : "destructive",
        });

        if (data.emailSent) {
          // Reset form and close modal on success
          setEmail("");
          setMonth("");
          setYear("");
          onOpenChange(false);
        }
      } else {
        throw new Error(data?.message || "Failed to send report");
      }
    } catch (error: any) {
      console.error("Error sending monthly report:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send monthly report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSending) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing
        const currentDate = new Date();
        setEmail("");
        setMonth((currentDate.getMonth() + 1).toString());
        setYear(currentDate.getFullYear().toString());
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send Monthly Report
          </DialogTitle>
          <DialogDescription>
            Send the monthly executive report for <strong>{organizationName}</strong> via email
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Email Input */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="recipient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSending}
                required
              />
              <p className="text-xs text-muted-foreground">
                The PDF report will be sent to this email address
              </p>
            </div>

            {/* Month Select */}
            <div className="space-y-2">
              <Label htmlFor="month" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Month
              </Label>
              <Select value={month} onValueChange={setMonth} disabled={isSending}>
                <SelectTrigger id="month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year Select */}
            <div className="space-y-2">
              <Label htmlFor="year" className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Year
              </Label>
              <Select value={year} onValueChange={setYear} disabled={isSending}>
                <SelectTrigger id="year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info Box */}
            <div className="bg-gradient-subtle p-4 rounded-lg border border-primary/20">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> If the report doesn't exist for the selected period, 
                it will be automatically generated before sending the email.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Report
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
