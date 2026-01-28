import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Mail } from "lucide-react";
import { createOrganizationAndInvite, type CreateOrganizationData } from "@/services/organizationInvitations";

interface AddOrganizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddOrganizationModal({ open, onOpenChange, onSuccess }: AddOrganizationModalProps) {
  const [formData, setFormData] = useState<CreateOrganizationData>({
    organizationName: "",
    userEmail: "",
    servicePlanName: "",
    monthlyServiceFee: 0,
    baselineHumanCostPerCall: 0,
    timeZone: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: keyof CreateOrganizationData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetForm = () => ({
    organizationName: "",
    userEmail: "",
    servicePlanName: "",
    monthlyServiceFee: 0,
    baselineHumanCostPerCall: 0,
    timeZone: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.organizationName.trim()) {
      toast({
        title: "Validation Error",
        description: "Organization name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.userEmail.trim()) {
      toast({
        title: "Validation Error", 
        description: "User email is required.",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.userEmail)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await createOrganizationAndInvite(formData);

      if (result.success) {
        toast({
          title: "Success!",
          description: result.message,
          variant: "default",
        });

        // Reset form
        setFormData(resetForm());

        // Close modal
        onOpenChange(false);

        // Call success callback
        onSuccess?.();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error creating organization:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form when canceling
    setFormData(resetForm());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Add New Organization
          </DialogTitle>
          <DialogDescription>
            Create a new organization and invite the admin user. An invitation email will be sent to the specified address.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="organizationName">Organization Name</Label>
              <Input
                id="organizationName"
                placeholder="Enter organization name"
                value={formData.organizationName}
                onChange={(e) => handleInputChange("organizationName", e.target.value)}
                disabled={isLoading}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userEmail">Admin User Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="admin@organization.com"
                  value={formData.userEmail}
                  onChange={(e) => handleInputChange("userEmail", e.target.value)}
                  disabled={isLoading}
                  className="pl-10 w-full"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground border-t pt-4">Service Plan Configuration</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="servicePlanName">Service Plan Name</Label>
                <Input
                  id="servicePlanName"
                  placeholder="e.g., AI Customer Service - 12hr Coverage"
                  value={formData.servicePlanName}
                  onChange={(e) => handleInputChange("servicePlanName", e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeZone">Time Zone</Label>
                <Select
                  value={formData.timeZone}
                  onValueChange={(value: string) => handleInputChange("timeZone", value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time (America/New_York)</SelectItem>
                    <SelectItem value="America/Chicago">Central Time (America/Chicago)</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time (America/Denver)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time (America/Los_Angeles)</SelectItem>
                    <SelectItem value="America/Phoenix">Arizona Time (America/Phoenix)</SelectItem>
                    <SelectItem value="America/Anchorage">Alaska Time (America/Anchorage)</SelectItem>
                    <SelectItem value="Pacific/Honolulu">Hawaii Time (Pacific/Honolulu)</SelectItem>
                    <SelectItem value="America/Toronto">Toronto (America/Toronto)</SelectItem>
                    <SelectItem value="America/Vancouver">Vancouver (America/Vancouver)</SelectItem>
                    <SelectItem value="Europe/London">London (Europe/London)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (Europe/Paris)</SelectItem>
                    <SelectItem value="Europe/Berlin">Berlin (Europe/Berlin)</SelectItem>
                    <SelectItem value="Europe/Rome">Rome (Europe/Rome)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo (Asia/Tokyo)</SelectItem>
                    <SelectItem value="Asia/Shanghai">Shanghai (Asia/Shanghai)</SelectItem>
                    <SelectItem value="Asia/Kolkata">India (Asia/Kolkata)</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney (Australia/Sydney)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyServiceFee">Monthly Service Fee ($)</Label>
                <Input
                  id="monthlyServiceFee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.monthlyServiceFee || ""}
                  onChange={(e) => handleInputChange("monthlyServiceFee", parseFloat(e.target.value) || 0)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baselineHumanCostPerCall">Human Cost per Call ($)</Label>
                <Input
                  id="baselineHumanCostPerCall"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.baselineHumanCostPerCall || ""}
                  onChange={(e) => handleInputChange("baselineHumanCostPerCall", parseFloat(e.target.value) || 0)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground border-t pt-4">
            The user will receive an invitation email to join this organization as an admin.
          </p>

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              className="bg-gradient-primary hover:opacity-90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create & Invite"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}