import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Save, RotateCcw, FileText, Copy, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface AssistantRubricModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistant: { 
    id: string; 
    friendly_name?: string; 
    rubric?: Rubric | null;
    org_id?: string;
  } | null;
  organizationRubric?: Rubric | null; // Pass the org rubric for comparison
  onSave: (rubric: Rubric | null, useCustom: boolean) => void;
}

export default function AssistantRubricModal({ 
  open, 
  onOpenChange, 
  assistant, 
  organizationRubric,
  onSave 
}: AssistantRubricModalProps) {
  const [useCustomRubric, setUseCustomRubric] = useState(false);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [loading, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    console.log("Assistant rubric modal useEffect:", { assistant, organizationRubric });
    if (assistant) {
      const hasCustom = !!assistant.rubric;
      console.log("Has custom rubric:", hasCustom);
      setUseCustomRubric(hasCustom);
      
      if (hasCustom) {
        console.log("Setting assistant custom rubric:", assistant.rubric);
        setRubric(assistant.rubric);
      } else if (organizationRubric) {
        // Start with org rubric as template
        console.log("Setting org rubric as template:", organizationRubric);
        setRubric({
          ...organizationRubric,
          version: 1 // Reset version for assistant copy
        });
      } else {
        // Initialize with empty rubric structure when no org rubric exists
        console.log("Initializing with empty rubric structure");
        setRubric({
          dimensions: [],
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
        });
      }
    }
  }, [assistant, organizationRubric]);

  const addDimension = () => {
    if (!rubric) return;
    setRubric(prev => prev ? ({
      ...prev,
      dimensions: [...prev.dimensions, {
        name: "",
        weight: 0,
        criteria: ""
      }]
    }) : null);
  };

  const updateDimension = (index: number, field: keyof RubricDimension, value: string | number) => {
    if (!rubric) return;
    setRubric(prev => prev ? ({
      ...prev,
      dimensions: prev.dimensions.map((dim, i) => 
        i === index ? { ...dim, [field]: value } : dim
      )
    }) : null);
  };

  const removeDimension = (index: number) => {
    if (!rubric) return;
    setRubric(prev => prev ? ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== index)
    }) : null);
  };

  const copyFromOrganization = () => {
    if (organizationRubric) {
      setRubric({
        ...organizationRubric,
        version: 1 // Reset version for assistant copy
      });
      setUseCustomRubric(true);
      toast({
        title: "Copied from Organization",
        description: "Organization rubric has been copied as starting template"
      });
    }
  };

  const validateRubric = (): string | null => {
    if (!useCustomRubric) return null; // No validation needed if using org default
    
    if (!rubric || rubric.dimensions.length === 0) {
      return "At least one dimension is required for custom rubric";
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
      const finalRubric = useCustomRubric && rubric ? {
        ...rubric,
        version: (rubric.version || 0) + 1
      } : null;
      
      onSave(finalRubric, useCustomRubric);
      
      toast({
        title: "Rubric Saved",
        description: useCustomRubric 
          ? "Custom rubric has been saved for this assistant"
          : "Assistant will now use the organization default rubric"
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

  const totalWeight = rubric?.dimensions.reduce((sum, dim) => sum + dim.weight, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Assistant Rubric - {assistant?.friendly_name || "Unnamed Assistant"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configure custom scoring rubric for this assistant, or use the organization default.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Rubric Mode Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rubric Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="use-custom-rubric"
                    checked={useCustomRubric}
                    onCheckedChange={(checked) => {
                      setUseCustomRubric(checked);
                      
                      // When enabling custom rubric, ensure we have a proper structure
                      if (checked && !rubric) {
                        if (organizationRubric) {
                          // Copy from organization rubric
                          setRubric({
                            ...organizationRubric,
                            version: 1
                          });
                        } else {
                          // Create empty rubric structure
                          setRubric({
                            dimensions: [],
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
                          });
                        }
                      }
                    }}
                  />
                  <Label htmlFor="use-custom-rubric">
                    Use custom rubric for this assistant
                  </Label>
                </div>

                {!useCustomRubric && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      This assistant will use the organization's default rubric. 
                      {!organizationRubric && " No organization default rubric is configured yet."}
                    </AlertDescription>
                  </Alert>
                )}

                {useCustomRubric && organizationRubric && (
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={copyFromOrganization}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy from Organization Default
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Show Organization Rubric Preview when not using custom */}
          {!useCustomRubric && organizationRubric && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Organization Default Rubric (Preview)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {organizationRubric.dimensions.map((dimension, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <div className="font-medium">{dimension.name}</div>
                        <div className="text-sm text-muted-foreground">{dimension.criteria}</div>
                      </div>
                      <Badge variant="outline">{dimension.weight}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Custom Rubric Editor */}
          {useCustomRubric && (
            <>
              {/* Rubric Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Custom Rubric Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Total Dimensions</Label>
                      <div className="text-2xl font-bold">{rubric?.dimensions.length || 0}</div>
                    </div>
                    <div>
                      <Label>Total Weight</Label>
                      <div className="text-2xl font-bold">
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
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Custom Scoring Dimensions</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      console.log("Add dimension clicked, rubric state:", rubric);
                      addDimension();
                    }} 
                    disabled={!rubric || !useCustomRubric}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Dimension
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rubric?.dimensions.map((dimension, index) => (
                    <Card key={index} className="border-l-4 border-l-primary">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <Badge variant="outline">Dimension {index + 1}</Badge>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeDimension(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <Label htmlFor={`dim-name-${index}`}>Dimension Name</Label>
                            <Input
                              id={`dim-name-${index}`}
                              value={dimension.name}
                              onChange={(e) => updateDimension(index, 'name', e.target.value)}
                              placeholder="e.g., Communication Quality"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`dim-weight-${index}`}>Weight (%)</Label>
                            <Input
                              id={`dim-weight-${index}`}
                              type="number"
                              min="1"
                              max="100"
                              value={dimension.weight}
                              onChange={(e) => updateDimension(index, 'weight', parseInt(e.target.value) || 0)}
                              placeholder="30"
                            />
                          </div>
                        </div>
                        
                        <div>
                          <Label htmlFor={`dim-criteria-${index}`}>Scoring Criteria</Label>
                          <Textarea
                            id={`dim-criteria-${index}`}
                            value={dimension.criteria}
                            onChange={(e) => updateDimension(index, 'criteria', e.target.value)}
                            placeholder="Describe what constitutes good performance in this dimension..."
                            rows={3}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {(!rubric?.dimensions.length) && (
                    <div className="text-center py-8 text-muted-foreground">
                      No dimensions defined. Click "Add Dimension" to get started or copy from organization default.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Scoring Scale */}
              {rubric && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Scoring Scale</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="text-center">
                        <Label>Excellent</Label>
                        <Input
                          type="number"
                          value={rubric.scoring_scale.excellent}
                          onChange={(e) => setRubric(prev => prev ? ({
                            ...prev,
                            scoring_scale: {
                              ...prev.scoring_scale,
                              excellent: parseInt(e.target.value) || 90
                            }
                          }) : null)}
                          className="text-center"
                        />
                      </div>
                      <div className="text-center">
                        <Label>Good</Label>
                        <Input
                          type="number"
                          value={rubric.scoring_scale.good}
                          onChange={(e) => setRubric(prev => prev ? ({
                            ...prev,
                            scoring_scale: {
                              ...prev.scoring_scale,
                              good: parseInt(e.target.value) || 80
                            }
                          }) : null)}
                          className="text-center"
                        />
                      </div>
                      <div className="text-center">
                        <Label>Satisfactory</Label>
                        <Input
                          type="number"
                          value={rubric.scoring_scale.satisfactory}
                          onChange={(e) => setRubric(prev => prev ? ({
                            ...prev,
                            scoring_scale: {
                              ...prev.scoring_scale,
                              satisfactory: parseInt(e.target.value) || 70
                            }
                          }) : null)}
                          className="text-center"
                        />
                      </div>
                      <div className="text-center">
                        <Label>Needs Improvement</Label>
                        <Input
                          type="number"
                          value={rubric.scoring_scale.needs_improvement}
                          onChange={(e) => setRubric(prev => prev ? ({
                            ...prev,
                            scoring_scale: {
                              ...prev.scoring_scale,
                              needs_improvement: parseInt(e.target.value) || 60
                            }
                          }) : null)}
                          className="text-center"
                        />
                      </div>
                      <div className="text-center">
                        <Label>Poor</Label>
                        <Input
                          type="number"
                          value={rubric.scoring_scale.poor}
                          onChange={(e) => setRubric(prev => prev ? ({
                            ...prev,
                            scoring_scale: {
                              ...prev.scoring_scale,
                              poor: parseInt(e.target.value) || 50
                            }
                          }) : null)}
                          className="text-center"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <Separator />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || (useCustomRubric && totalWeight !== 100)}
          >
            <Save className="mr-2 h-4 w-4" />
            {loading ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}