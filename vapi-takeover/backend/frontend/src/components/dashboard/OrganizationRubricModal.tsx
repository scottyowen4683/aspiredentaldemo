import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Save, RotateCcw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getOrganizationRubric } from "@/services/rubricService";

export interface RubricDimension {
  name: string;
  weight: number;
  criteria: string;
}

export interface Rubric {
  dimensions: RubricDimension[];
  overall_weight: number;
  scoring_scale: {
    min: number;
    max: number;
    excellent: number;
    good: number;
    satisfactory: number;
    needs_improvement: number;
    poor: number;
  };
  version: number;
}

interface OrganizationRubricModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: { id: string; name: string; default_rubric?: Rubric | null } | null;
  onSave: (rubric: Rubric) => void;
}

const DEFAULT_RUBRIC: Rubric = {
  dimensions: [
    {
      name: "Communication Quality",
      weight: 30,
      criteria: "Clarity, professionalism, and appropriateness of language used"
    },
    {
      name: "Problem Resolution", 
      weight: 40,
      criteria: "Ability to understand and effectively address customer concerns"
    },
    {
      name: "Policy Compliance",
      weight: 20, 
      criteria: "Adherence to organizational policies and procedures"
    },
    {
      name: "Customer Satisfaction",
      weight: 10,
      criteria: "Overall customer experience and satisfaction indicators"
    }
  ],
  overall_weight: 100,
  scoring_scale: {
    min: 0,
    max: 100,
    excellent: 90,
    good: 80,
    satisfactory: 70,
    needs_improvement: 60,
    poor: 50
  },
  version: 1
};

export default function OrganizationRubricModal({ 
  open, 
  onOpenChange, 
  organization, 
  onSave 
}: OrganizationRubricModalProps) {
  const [rubric, setRubric] = useState<Rubric>(DEFAULT_RUBRIC);
  const [loading, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadRubric = async () => {
      if (!organization) {
        setRubric(DEFAULT_RUBRIC);
        return;
      }

      // First try the organization object (if it has the rubric data)
      if (organization?.default_rubric && typeof organization.default_rubric === 'object') {
        // Validate that it has the expected structure
        if (organization.default_rubric.dimensions && Array.isArray(organization.default_rubric.dimensions)) {
          setRubric(organization.default_rubric);
          return;
        }
      }

      // Fallback: Fetch directly from rubric service
      try {
        const result = await getOrganizationRubric(organization.id);
        if (result.success && result.data) {
          setRubric(result.data);
        } else {
          setRubric(DEFAULT_RUBRIC);
        }
      } catch (error) {
        console.error("Error fetching rubric from service:", error);
        setRubric(DEFAULT_RUBRIC);
      }
    };

    loadRubric();
  }, [organization]);

  const addDimension = () => {
    setRubric(prev => ({
      ...prev,
      dimensions: [...prev.dimensions, {
        name: "",
        weight: 0,
        criteria: ""
      }]
    }));
  };

  const updateDimension = (index: number, field: keyof RubricDimension, value: string | number) => {
    setRubric(prev => ({
      ...prev,
      dimensions: prev.dimensions.map((dim, i) => 
        i === index ? { ...dim, [field]: value } : dim
      )
    }));
  };

  const removeDimension = (index: number) => {
    setRubric(prev => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== index)
    }));
  };

  const resetToDefault = () => {
    setRubric(DEFAULT_RUBRIC);
    toast({
      title: "Reset to Default",
      description: "Rubric has been reset to default values"
    });
  };

  const validateRubric = (): string | null => {
    if (rubric.dimensions.length === 0) {
      return "At least one dimension is required";
    }

    for (const [index, dim] of rubric.dimensions.entries()) {
      if (!dim.name.trim()) {
        return `Dimension ${index + 1}: Name is required`;
      }
      if (dim.weight <= 0 || dim.weight > 100) {
        return `Dimension ${index + 1}: Weight must be between 1 and 100`;
      }
      if (!dim.criteria.trim()) {
        return `Dimension ${index + 1}: Criteria is required`;
      }
    }

    const totalWeight = rubric.dimensions.reduce((sum, dim) => sum + dim.weight, 0);
    if (totalWeight !== 100) {
      return `Total weight must equal 100% (currently ${totalWeight}%)`;
    }

    return null;
  };

  const handleSave = async () => {
    const validation = validateRubric();
    if (validation) {
      toast({
        title: "Validation Error",
        description: validation,
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const updatedRubric = {
        ...rubric,
        version: (rubric.version || 0) + 1
      };
      
      // Here you would call your API to save the rubric
      // For now, just call the onSave callback
      onSave(updatedRubric);
      
      toast({
        title: "Rubric Saved",
        description: "Organization default rubric has been updated successfully"
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving rubric:", error);
      toast({
        title: "Error",
        description: "Failed to save rubric. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const totalWeight = rubric.dimensions.reduce((sum, dim) => sum + dim.weight, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <FileText className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">Manage Default Rubric</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Configure the default scoring rubric for all assistants in this organization. 
            Individual assistants can override specific dimensions if needed.
          </p>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Rubric Overview */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-base">Rubric Overview</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs">Total Dimensions</Label>
                  <div className="text-lg sm:text-xl font-bold mt-1">{rubric.dimensions.length}</div>
                </div>
                <div>
                  <Label className="text-xs">Total Weight</Label>
                  <div className="text-lg sm:text-xl font-bold mt-1">
                    <span className={totalWeight === 100 ? "text-success" : "text-destructive"}>
                      {totalWeight}%
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dimensions */}
          <Card>
            <CardHeader className="p-3 sm:p-6 space-y-3">
              <CardTitle className="text-sm sm:text-base">Scoring Dimensions</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={resetToDefault} className="flex-1 sm:flex-none text-xs sm:text-sm h-8 sm:h-9">
                  <RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  Reset
                </Button>
                <Button variant="outline" size="sm" onClick={addDimension} className="flex-1 sm:flex-none text-xs sm:text-sm h-8 sm:h-9">
                  <Plus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
              {rubric.dimensions.map((dimension, index) => (
                <Card key={index} className="border-l-4 border-l-primary">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2">Dimension {index + 1}</Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeDimension(index)}
                        className="text-destructive hover:text-destructive h-7 w-7 sm:h-8 sm:w-8 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor={`dim-name-${index}`} className="text-[11px] sm:text-xs">Dimension Name</Label>
                        <Input
                          id={`dim-name-${index}`}
                          value={dimension.name}
                          onChange={(e) => updateDimension(index, 'name', e.target.value)}
                          placeholder="e.g., Communication Quality"
                          className="text-xs sm:text-sm h-8 sm:h-9 mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`dim-weight-${index}`} className="text-[11px] sm:text-xs">Weight (%)</Label>
                        <Input
                          id={`dim-weight-${index}`}
                          type="number"
                          min="1"
                          max="100"
                          value={dimension.weight}
                          onChange={(e) => updateDimension(index, 'weight', parseInt(e.target.value) || 0)}
                          placeholder="30"
                          className="text-xs sm:text-sm h-8 sm:h-9 mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`dim-criteria-${index}`} className="text-[11px] sm:text-xs">Scoring Criteria</Label>
                        <Textarea
                          id={`dim-criteria-${index}`}
                          value={dimension.criteria}
                          onChange={(e) => updateDimension(index, 'criteria', e.target.value)}
                          placeholder="Describe what constitutes good performance..."
                          rows={2}
                          className="text-xs sm:text-sm mt-1 resize-none"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {rubric.dimensions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No dimensions defined. Click "Add Dimension" to get started.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scoring Scale */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-base">Scoring Scale</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <div className="text-center">
                  <Label className="text-[10px] sm:text-xs block mb-1">Excellent</Label>
                  <Input
                    type="number"
                    value={rubric.scoring_scale.excellent}
                    onChange={(e) => setRubric(prev => ({
                      ...prev,
                      scoring_scale: {
                        ...prev.scoring_scale,
                        excellent: parseInt(e.target.value) || 90
                      }
                    }))}
                    className="text-center text-xs h-8 sm:h-9"
                  />
                </div>
                <div className="text-center">
                  <Label className="text-[10px] sm:text-xs block mb-1">Good</Label>
                  <Input
                    type="number"
                    value={rubric.scoring_scale.good}
                    onChange={(e) => setRubric(prev => ({
                      ...prev,
                      scoring_scale: {
                        ...prev.scoring_scale,
                        good: parseInt(e.target.value) || 80
                      }
                    }))}
                    className="text-center text-xs h-8 sm:h-9"
                  />
                </div>
                <div className="text-center">
                  <Label className="text-[10px] sm:text-xs block mb-1">Satisfactory</Label>
                  <Input
                    type="number"
                    value={rubric.scoring_scale.satisfactory}
                    onChange={(e) => setRubric(prev => ({
                      ...prev,
                      scoring_scale: {
                        ...prev.scoring_scale,
                        satisfactory: parseInt(e.target.value) || 70
                      }
                    }))}
                    className="text-center text-xs h-8 sm:h-9"
                  />
                </div>
                <div className="text-center">
                  <Label className="text-[10px] sm:text-xs block mb-1 leading-tight">Needs<br className="sm:hidden" /> Improv.</Label>
                  <Input
                    type="number"
                    value={rubric.scoring_scale.needs_improvement}
                    onChange={(e) => setRubric(prev => ({
                      ...prev,
                      scoring_scale: {
                        ...prev.scoring_scale,
                        needs_improvement: parseInt(e.target.value) || 60
                      }
                    }))}
                    className="text-center text-xs h-8 sm:h-9"
                  />
                </div>
                <div className="text-center">
                  <Label className="text-[10px] sm:text-xs block mb-1">Poor</Label>
                  <Input
                    type="number"
                    value={rubric.scoring_scale.poor}
                    onChange={(e) => setRubric(prev => ({
                      ...prev,
                      scoring_scale: {
                        ...prev.scoring_scale,
                        poor: parseInt(e.target.value) || 50
                      }
                    }))}
                    className="text-center text-xs h-8 sm:h-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-4" />

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto text-xs sm:text-sm h-9">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || totalWeight !== 100} className="w-full sm:w-auto text-xs sm:text-sm h-9">
            <Save className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            {loading ? "Saving..." : "Save Rubric"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}