import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2 } from "lucide-react";
import type { Organization } from "@/services/organizationService";
import { updateOrganization } from "@/services/organizationService";
import { useUser } from "@/context/UserContext";

interface EditOrganizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization | null;
  onSave?: (data: { name: string; slug: string }) => void;
}

export function EditOrganizationModal({ open, onOpenChange, organization, onSave }: EditOrganizationModalProps) {
  const { user } = useUser();
  const [name, setName] = useState(organization?.name ?? "");
  const [slug, setSlug] = useState(organization?.slug ?? "");
  const [contactEmail, setContactEmail] = useState(organization?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(organization?.contact_phone ?? "");
  const [billingEmail, setBillingEmail] = useState(organization?.billing_email ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Billing settings state
  const [monthlyInteractionLimit, setMonthlyInteractionLimit] = useState<number>(organization?.monthly_interaction_limit || 0);
  const [pricePerInteraction, setPricePerInteraction] = useState<number>(organization?.price_per_interaction || 0);
  const [flatRateFee, setFlatRateFee] = useState<number>(organization?.flat_rate_fee || 0);
  const [includedInteractions, setIncludedInteractions] = useState<number>(organization?.included_interactions || 0);
  const [overageRate, setOverageRate] = useState<number>(organization?.overage_rate_per_1000 || 0);

  useEffect(() => {
    setName(organization?.name ?? "");
    setSlug(organization?.slug ?? "");
    setContactEmail(organization?.contact_email ?? "");
    setContactPhone(organization?.contact_phone ?? "");
    setBillingEmail(organization?.billing_email ?? "");
    // Billing settings
    setMonthlyInteractionLimit(organization?.monthly_interaction_limit || 0);
    setPricePerInteraction(organization?.price_per_interaction || 0);
    setFlatRateFee(organization?.flat_rate_fee || 0);
    setIncludedInteractions(organization?.included_interactions || 0);
    setOverageRate(organization?.overage_rate_per_1000 || 0);
  }, [organization, open]);

  const handleCancel = () => {
    // reset local state
    setName(organization?.name ?? "");
    setSlug(organization?.slug ?? "");
    setContactEmail(organization?.contact_email ?? "");
    setContactPhone(organization?.contact_phone ?? "");
    setBillingEmail(organization?.billing_email ?? "");
    setMonthlyInteractionLimit(organization?.monthly_interaction_limit || 0);
    setPricePerInteraction(organization?.price_per_interaction || 0);
    setFlatRateFee(organization?.flat_rate_fee || 0);
    setIncludedInteractions(organization?.included_interactions || 0);
    setOverageRate(organization?.overage_rate_per_1000 || 0);
    onOpenChange(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: "Validation", description: "Organization name is required.", variant: "destructive" });
      return;
    }
    if (!organization?.id) {
      toast({ title: "Error", description: "No organization selected.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const updateData: any = {
        name: name.trim(),
        slug: slug.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        billing_email: billingEmail.trim() || null,
      };

      // Include billing settings if provided
      if (user?.role === "super_admin") {
        updateData.monthly_interaction_limit = monthlyInteractionLimit || null;
        updateData.price_per_interaction = pricePerInteraction || null;
        updateData.flat_rate_fee = flatRateFee || null;
        updateData.included_interactions = includedInteractions || null;
        updateData.overage_rate_per_1000 = overageRate || null;
      }

      const result = await updateOrganization(organization.id, updateData);
      if (!result.success) {
        toast({ title: "Error", description: result.error || "Failed to update organization.", variant: "destructive" });
        return;
      }

      toast({ title: "Saved", description: "Organization updated successfully." });
      onSave?.({ name: name.trim(), slug: slug.trim() });
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving organization:", err);
      toast({ title: "Error", description: "Unexpected error saving organization.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Edit Organization
          </DialogTitle>
          <DialogDescription className="text-sm">Update the organization details.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList className={`grid w-full ${user?.role === "super_admin" ? "grid-cols-2" : "grid-cols-1"}`}>
            <TabsTrigger value="basic" className="text-xs sm:text-sm">Basic Info</TabsTrigger>
            {user?.role === "super_admin" && (
              <TabsTrigger value="billing" className="text-xs sm:text-sm">Billing</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="basic">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name *</Label>
                  <Input
                    id="orgName"
                    placeholder="Organization name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSaving}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Slug</Label>
                  <Input
                    id="orgSlug"
                    placeholder="organization-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    disabled={isSaving}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    placeholder="contact@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    disabled={isSaving}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    placeholder="+1 234 567 8900"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    disabled={isSaving}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billingEmail">Billing Email</Label>
                <Input
                  id="billingEmail"
                  type="email"
                  placeholder="billing@example.com"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  disabled={isSaving}
                  className="w-full"
                />
              </div>

              <DialogFooter className="gap-2 flex-col sm:flex-row">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-primary hover:opacity-90 w-full sm:w-auto" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="billing">
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Billing Configuration</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="flatRateFee">Flat Rate Fee ($)</Label>
                    <Input
                      id="flatRateFee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={flatRateFee || ""}
                      onChange={(e) => setFlatRateFee(parseFloat(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="includedInteractions">Included Interactions</Label>
                    <Input
                      id="includedInteractions"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={includedInteractions || ""}
                      onChange={(e) => setIncludedInteractions(parseInt(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthlyLimit">Monthly Interaction Limit</Label>
                    <Input
                      id="monthlyLimit"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={monthlyInteractionLimit || ""}
                      onChange={(e) => setMonthlyInteractionLimit(parseInt(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pricePerInteraction">Price per Interaction ($)</Label>
                    <Input
                      id="pricePerInteraction"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.00"
                      value={pricePerInteraction || ""}
                      onChange={(e) => setPricePerInteraction(parseFloat(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="overageRate">Overage Rate (per 1000)</Label>
                    <Input
                      id="overageRate"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={overageRate || ""}
                      onChange={(e) => setOverageRate(parseFloat(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleSave}
                    className="bg-gradient-primary hover:opacity-90"
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Billing Settings"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default EditOrganizationModal;
