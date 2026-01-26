import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Upload,
  FileText,
  Link as LinkIcon,
  Trash2,
  Bot,
  Search,
  RefreshCw,
  Download,
  Eye,
  Plus,
  FileType,
  Clock,
  Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAssistants, AssistantRow } from "@/services/assistantService";

interface KnowledgeBaseEntry {
  id: string;
  assistant_id: string;
  assistant_name: string;
  org_id: string | null;
  org_name?: string;
  kb_path: string;
  kb_type: "text" | "file" | "url";
  kb_version: number;
  updated_at: string;
  assistant_type: string;
}

interface Organization {
  id: string;
  name: string;
}

export default function KnowledgeBase() {
  const { user } = useUser();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [kbEntries, setKbEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeBaseEntry | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Upload form state
  const [uploadType, setUploadType] = useState<"text" | "file" | "url">("text");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  const [targetAssistantId, setTargetAssistantId] = useState<string>("");
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch assistants with KB data
      const assistantsData = await fetchAssistants();
      setAssistants(assistantsData);

      // Fetch organizations
      const { data: orgsData } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      setOrganizations(orgsData || []);

      // Build KB entries from assistants that have kb_path
      const entries: KnowledgeBaseEntry[] = [];
      for (const assistant of assistantsData) {
        if (assistant.kb_path) {
          // Determine KB type
          let kbType: "text" | "file" | "url" = "text";
          if (assistant.kb_path.startsWith("http")) {
            kbType = assistant.kb_path.includes("supabase") ? "file" : "url";
          }

          // Get org name
          const org = orgsData?.find((o: Organization) => o.id === assistant.org_id);

          entries.push({
            id: assistant.id,
            assistant_id: assistant.id,
            assistant_name: assistant.friendly_name || "Unnamed Assistant",
            org_id: assistant.org_id || null,
            org_name: org?.name,
            kb_path: assistant.kb_path,
            kb_type: kbType,
            kb_version: assistant.kb_version || 1,
            updated_at: assistant.updated_at || assistant.created_at || new Date().toISOString(),
            assistant_type: assistant.assistant_type || "voice",
          });
        }
      }

      setKbEntries(entries);
    } catch (error) {
      console.error("Error fetching knowledge base data:", error);
      toast({
        title: "Error",
        description: "Failed to load knowledge base data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredEntries = kbEntries.filter((entry) => {
    const matchesSearch =
      entry.assistant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.kb_path.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOrg = selectedOrg === "all" || entry.org_id === selectedOrg;
    return matchesSearch && matchesOrg;
  });

  const handleUpload = async () => {
    if (!targetAssistantId) {
      toast({
        title: "Error",
        description: "Please select an assistant",
        variant: "destructive",
      });
      return;
    }

    setUploadLoading(true);
    try {
      let kbPath = "";

      if (uploadType === "text" && uploadText) {
        kbPath = uploadText;
      } else if (uploadType === "url" && uploadUrl) {
        kbPath = uploadUrl;
      } else if (uploadType === "file" && uploadFile) {
        // Upload file to Supabase storage
        const bucket = "kb_uploads";
        const fileName = `${Date.now()}_${uploadFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, uploadFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
        kbPath = publicUrlData.publicUrl;
      } else {
        toast({
          title: "Error",
          description: "Please provide knowledge base content",
          variant: "destructive",
        });
        setUploadLoading(false);
        return;
      }

      // Update assistant with new KB
      const { error } = await supabase
        .from("assistants")
        .update({
          kb_path: kbPath,
          kb_version: (kbEntries.find((e) => e.assistant_id === targetAssistantId)?.kb_version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetAssistantId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge base updated successfully",
      });

      setShowUploadModal(false);
      setUploadFile(null);
      setUploadText("");
      setUploadUrl("");
      setTargetAssistantId("");
      fetchData();
    } catch (error) {
      console.error("Error uploading knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to upload knowledge base",
        variant: "destructive",
      });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRemoveKB = async (assistantId: string) => {
    if (!confirm("Are you sure you want to remove this knowledge base?")) return;

    try {
      const { error } = await supabase
        .from("assistants")
        .update({
          kb_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assistantId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge base removed successfully",
      });

      fetchData();
    } catch (error) {
      console.error("Error removing knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to remove knowledge base",
        variant: "destructive",
      });
    }
  };

  const getKBTypeIcon = (type: string) => {
    switch (type) {
      case "file":
        return <FileType className="h-4 w-4" />;
      case "url":
        return <LinkIcon className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getKBTypeLabel = (type: string) => {
    switch (type) {
      case "file":
        return "Uploaded File";
      case "url":
        return "External URL";
      default:
        return "Text Content";
    }
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Stats
  const totalKBs = kbEntries.length;
  const fileKBs = kbEntries.filter((e) => e.kb_type === "file").length;
  const textKBs = kbEntries.filter((e) => e.kb_type === "text").length;
  const urlKBs = kbEntries.filter((e) => e.kb_type === "url").length;

  return (
    <DashboardLayout userRole={user?.role as "super_admin" | "org_admin"}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Knowledge Base</h1>
            <p className="text-muted-foreground mt-1">
              Manage knowledge bases for your AI assistants
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setShowUploadModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Knowledge Base
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total KBs</p>
                  <p className="text-2xl font-bold">{totalKBs}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">File Uploads</p>
                  <p className="text-2xl font-bold">{fileKBs}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Text Content</p>
                  <p className="text-2xl font-bold">{textKBs}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">External URLs</p>
                  <p className="text-2xl font-bold">{urlKBs}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <LinkIcon className="h-6 w-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by assistant name or content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              {user?.role === "super_admin" && (
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Filter by organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Base Table */}
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Base Entries</CardTitle>
            <CardDescription>
              View and manage knowledge bases attached to your assistants
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No knowledge bases found
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || selectedOrg !== "all"
                    ? "Try adjusting your filters"
                    : "Add knowledge base content to your assistants to get started"}
                </p>
                <Button onClick={() => setShowUploadModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Knowledge Base
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assistant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Content Preview</TableHead>
                    {user?.role === "super_admin" && <TableHead>Organization</TableHead>}
                    <TableHead>Version</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{entry.assistant_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {entry.assistant_type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getKBTypeIcon(entry.kb_type)}
                          <span className="text-sm">{getKBTypeLabel(entry.kb_type)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <span className="text-sm text-muted-foreground">
                          {truncateText(entry.kb_path)}
                        </span>
                      </TableCell>
                      {user?.role === "super_admin" && (
                        <TableCell>
                          {entry.org_name ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span>{entry.org_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="secondary">v{entry.kb_version}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(entry.updated_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedEntry(entry);
                              setShowViewModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {entry.kb_type === "file" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(entry.kb_path, "_blank")}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveKB(entry.assistant_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Upload Modal */}
        <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Knowledge Base</DialogTitle>
              <DialogDescription>
                Upload or enter knowledge base content for an assistant
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Select Assistant */}
              <div className="space-y-2">
                <Label>Select Assistant</Label>
                <Select value={targetAssistantId} onValueChange={setTargetAssistantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants.map((assistant) => (
                      <SelectItem key={assistant.id} value={assistant.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          {assistant.friendly_name || "Unnamed Assistant"}
                          {assistant.kb_path && (
                            <Badge variant="secondary" className="ml-2">
                              Has KB
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Content Type Tabs */}
              <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="text">
                    <FileText className="h-4 w-4 mr-2" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="file">
                    <Upload className="h-4 w-4 mr-2" />
                    File
                  </TabsTrigger>
                  <TabsTrigger value="url">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    URL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Knowledge Base Content</Label>
                    <Textarea
                      placeholder="Enter your knowledge base content here..."
                      value={uploadText}
                      onChange={(e) => setUploadText(e.target.value)}
                      rows={10}
                    />
                    <p className="text-sm text-muted-foreground">
                      Paste information, FAQs, documentation, or any text content your assistant should know.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="file" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Upload File</Label>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Input
                        type="file"
                        accept=".txt,.pdf,.docx,.doc,.md"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="kb-file-upload"
                      />
                      <label
                        htmlFor="kb-file-upload"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                        <span className="text-sm font-medium">
                          {uploadFile ? uploadFile.name : "Click to upload or drag and drop"}
                        </span>
                        <span className="text-xs text-muted-foreground mt-1">
                          TXT, PDF, DOCX up to 10MB
                        </span>
                      </label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="url" className="space-y-4">
                  <div className="space-y-2">
                    <Label>External URL</Label>
                    <Input
                      placeholder="https://example.com/docs/faq"
                      value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Link to external documentation, FAQ pages, or knowledge base articles.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploadLoading}>
                {uploadLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Save Knowledge Base
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {selectedEntry?.assistant_name}
              </DialogTitle>
              <DialogDescription>
                Knowledge Base Content (v{selectedEntry?.kb_version})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="flex items-center gap-1">
                  {getKBTypeIcon(selectedEntry?.kb_type || "text")}
                  {getKBTypeLabel(selectedEntry?.kb_type || "text")}
                </Badge>
                {selectedEntry?.org_name && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {selectedEntry.org_name}
                  </Badge>
                )}
              </div>

              <div className="bg-muted rounded-lg p-4">
                {selectedEntry?.kb_type === "file" ? (
                  <div className="space-y-4">
                    <a
                      href={selectedEntry.kb_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download File
                    </a>
                    <p className="text-sm text-muted-foreground break-all">
                      {selectedEntry.kb_path}
                    </p>
                  </div>
                ) : selectedEntry?.kb_type === "url" ? (
                  <a
                    href={selectedEntry.kb_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {selectedEntry.kb_path}
                  </a>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm font-mono">
                    {selectedEntry?.kb_path}
                  </pre>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
