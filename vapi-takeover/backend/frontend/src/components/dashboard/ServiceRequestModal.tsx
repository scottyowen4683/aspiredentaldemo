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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { Loader2, Send, Headphones } from "lucide-react";

interface ServiceRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  organizationName?: string;
}

export function ServiceRequestModal({
  open,
  onOpenChange,
  organizationId,
  organizationName,
}: ServiceRequestModalProps) {
  const { user } = useUser();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [requestType, setRequestType] = useState("general");
  const [urgency, setUrgency] = useState("medium");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both subject and message",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/service-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          requestType,
          urgency,
          organizationId: organizationId || user?.org_id,
          organizationName,
          userName: user?.full_name,
          userEmail: user?.email,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Request Submitted",
          description: `Your service request has been submitted. Reference: ${result.referenceId}`,
        });
        // Reset form
        setSubject("");
        setMessage("");
        setRequestType("general");
        setUrgency("medium");
        onOpenChange(false);
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to submit service request",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5" />
            Submit Service Request
          </DialogTitle>
          <DialogDescription>
            Contact the Aspire support team. We typically respond within 24 hours.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="requestType">Request Type</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Inquiry</SelectItem>
                  <SelectItem value="technical">Technical Support</SelectItem>
                  <SelectItem value="billing">Billing Question</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="urgency">Urgency</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger>
                  <SelectValue placeholder="Select urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - No rush</SelectItem>
                  <SelectItem value="medium">Medium - Standard response</SelectItem>
                  <SelectItem value="high">High - Urgent issue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Brief summary of your request"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Describe your request in detail..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
