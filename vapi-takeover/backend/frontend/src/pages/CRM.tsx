import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Plus,
  Search,
  Upload,
  Download,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Edit,
  Trash2,
  Eye,
  Send,
  MessageSquare,
  FileText,
  TrendingUp,
  Target,
  UserCheck,
  UserX,
  Loader2,
  Filter,
  RefreshCw,
  ChevronRight,
  MoreHorizontal,
  Star,
  StickyNote,
  Activity,
  Megaphone,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Types
interface Customer {
  id: string;
  org_id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company_name?: string;
  job_title?: string;
  website?: string;
  address_line1?: string;
  city?: string;
  postal_code?: string;
  australian_state?: string;
  mayor_name?: string;
  ceo_name?: string;
  council_type?: string;
  status: string;
  stage: string;
  source?: string;
  estimated_value?: number;
  lead_score?: number;
  tags?: string[];
  email_opt_in?: boolean;
  last_contacted_at?: string;
  next_followup_at?: string;
  created_at: string;
  assigned_user?: { id: string; full_name: string; email: string };
}

interface Activity {
  id: string;
  customer_id: string;
  activity_type: string;
  subject: string;
  description?: string;
  outcome?: string;
  duration_minutes?: number;
  activity_date: string;
  created_by_user?: { full_name: string };
}

interface Followup {
  id: string;
  customer_id: string;
  title: string;
  description?: string;
  due_date: string;
  status: string;
  priority: string;
  customer?: { id: string; first_name: string; last_name?: string; company_name?: string; email?: string };
  assigned_user?: { full_name: string };
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  recipient_count: number;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  created_at: string;
}

interface Stats {
  totalCustomers: number;
  customersByStatus: Record<string, number>;
  pipelineByStage: Record<string, number>;
  totalPipelineValue: number;
  pendingFollowups: number;
  overdueFollowups: number;
  recentActivities: number;
  campaigns: {
    total: number;
    sent: number;
    totalEmailsSent: number;
  };
}

interface StateCount {
  state: string;
  count: number;
}

// Constants
const CUSTOMER_STATUSES = [
  { value: "lead", label: "Lead", color: "bg-blue-500" },
  { value: "prospect", label: "Prospect", color: "bg-purple-500" },
  { value: "customer", label: "Customer", color: "bg-green-500" },
  { value: "churned", label: "Churned", color: "bg-red-500" },
  { value: "inactive", label: "Inactive", color: "bg-gray-500" },
];

const PIPELINE_STAGES = [
  { value: "new", label: "New", color: "bg-slate-500" },
  { value: "contacted", label: "Contacted", color: "bg-blue-500" },
  { value: "qualified", label: "Qualified", color: "bg-indigo-500" },
  { value: "proposal", label: "Proposal", color: "bg-purple-500" },
  { value: "negotiation", label: "Negotiation", color: "bg-amber-500" },
  { value: "closed_won", label: "Closed Won", color: "bg-green-500" },
  { value: "closed_lost", label: "Closed Lost", color: "bg-red-500" },
];

const ACTIVITY_TYPES = [
  { value: "call", label: "Phone Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: Users },
  { value: "note", label: "Note", icon: StickyNote },
  { value: "task", label: "Task", icon: CheckCircle },
  { value: "demo", label: "Demo", icon: Eye },
];

const AUSTRALIAN_STATES = [
  { value: "QLD", label: "Queensland" },
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "SA", label: "South Australia" },
  { value: "WA", label: "Western Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "NT", label: "Northern Territory" },
  { value: "ACT", label: "Australian Capital Territory" },
];

const FOLLOWUP_PRIORITIES = [
  { value: "low", label: "Low", color: "bg-slate-500" },
  { value: "medium", label: "Medium", color: "bg-blue-500" },
  { value: "high", label: "High", color: "bg-amber-500" },
  { value: "urgent", label: "Urgent", color: "bg-red-500" },
];

export default function CRM() {
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Main state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [states, setStates] = useState<StateCount[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");

  // Dialogs
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Selected items
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerActivities, setCustomerActivities] = useState<Activity[]>([]);
  const [customerFollowups, setCustomerFollowups] = useState<Followup[]>([]);

  // Form state
  const [customerForm, setCustomerForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_name: "",
    website: "",
    address_line1: "",
    city: "",
    postal_code: "",
    australian_state: "",
    mayor_name: "",
    ceo_name: "",
    status: "lead",
    stage: "new",
    estimated_value: "",
    tags: "",
  });

  const [activityForm, setActivityForm] = useState({
    activity_type: "call",
    subject: "",
    description: "",
    outcome: "",
    duration_minutes: "",
  });

  const [followupForm, setFollowupForm] = useState({
    title: "",
    description: "",
    due_date: "",
    priority: "medium",
  });

  const [emailForm, setEmailForm] = useState({
    subject: "",
    html_content: "",
  });

  const [importData, setImportData] = useState("");

  // Loading states
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const orgId = user?.org_id || (user?.role === "super_admin" ? "all" : null);
  const isSuperAdmin = user?.role === "super_admin";

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!orgId) return;

    try {
      setLoading(true);

      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/api/crm/stats/${orgId}`);
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);

      // Fetch customers
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (statusFilter) params.append("status", statusFilter);
      if (stageFilter) params.append("stage", stageFilter);
      if (stateFilter) params.append("state", stateFilter);
      params.append("limit", "50");

      const customersRes = await fetch(`${API_BASE}/api/crm/customers/${orgId}?${params}`);
      const customersData = await customersRes.json();
      if (customersData.success) {
        setCustomers(customersData.customers);
        setTotalCustomers(customersData.total);
      }

      // Fetch follow-ups
      const followupsRes = await fetch(`${API_BASE}/api/crm/followups/${orgId}?status=pending`);
      const followupsData = await followupsRes.json();
      if (followupsData.success) setFollowups(followupsData.followups);

      // Fetch campaigns
      const campaignsRes = await fetch(`${API_BASE}/api/crm/campaigns/${orgId}`);
      const campaignsData = await campaignsRes.json();
      if (campaignsData.success) setCampaigns(campaignsData.campaigns);

      // Fetch states
      const statesRes = await fetch(`${API_BASE}/api/crm/states/${orgId}`);
      const statesData = await statesRes.json();
      if (statesData.success) setStates(statesData.states);

    } catch (error) {
      console.error("Error fetching CRM data:", error);
      toast({ title: "Error", description: "Failed to load CRM data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, searchQuery, statusFilter, stageFilter, stateFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch customer details
  const fetchCustomerDetails = async (customerId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${orgId}/${customerId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedCustomer(data.customer);
        setCustomerActivities(data.activities);
        setCustomerFollowups(data.followups);
        setShowCustomerDetail(true);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load customer details", variant: "destructive" });
    }
  };

  // Create/Update customer
  const handleSaveCustomer = async () => {
    if (!customerForm.first_name && !customerForm.company_name) {
      toast({ title: "Error", description: "Name or company is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...customerForm,
        estimated_value: customerForm.estimated_value ? parseFloat(customerForm.estimated_value) : null,
        tags: customerForm.tags ? customerForm.tags.split(",").map(t => t.trim()) : [],
        created_by: user?.id,
      };

      let res;
      if (selectedCustomer) {
        res = await fetch(`${API_BASE}/api/crm/customers/${selectedCustomer.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/api/crm/customers/${orgId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: selectedCustomer ? "Customer updated" : "Customer created" });
        setShowCustomerDialog(false);
        resetCustomerForm();
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save customer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;

    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${selectedCustomer.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Customer deleted" });
        setShowDeleteConfirm(false);
        setShowCustomerDetail(false);
        setSelectedCustomer(null);
        fetchData();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
    }
  };

  // Update customer status
  const handleUpdateStatus = async (customerId: string, status: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${customerId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, user_id: user?.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Status updated" });
        fetchData();
        if (selectedCustomer?.id === customerId) {
          setSelectedCustomer(data.customer);
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  // Update customer stage
  const handleUpdateStage = async (customerId: string, stage: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${customerId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, user_id: user?.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Stage updated" });
        fetchData();
        if (selectedCustomer?.id === customerId) {
          setSelectedCustomer(data.customer);
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update stage", variant: "destructive" });
    }
  };

  // Create activity
  const handleCreateActivity = async () => {
    if (!selectedCustomer || !activityForm.subject) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/crm/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: selectedCustomer.org_id,
          customer_id: selectedCustomer.id,
          ...activityForm,
          duration_minutes: activityForm.duration_minutes ? parseInt(activityForm.duration_minutes) : null,
          created_by: user?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Activity logged" });
        setShowActivityDialog(false);
        resetActivityForm();
        fetchCustomerDetails(selectedCustomer.id);
        fetchData();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to log activity", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Create follow-up
  const handleCreateFollowup = async () => {
    if (!selectedCustomer || !followupForm.title || !followupForm.due_date) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/crm/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: selectedCustomer.org_id,
          customer_id: selectedCustomer.id,
          ...followupForm,
          assigned_to: user?.id,
          created_by: user?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Follow-up scheduled" });
        setShowFollowupDialog(false);
        resetFollowupForm();
        fetchCustomerDetails(selectedCustomer.id);
        fetchData();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to create follow-up", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Complete follow-up
  const handleCompleteFollowup = async (followupId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/crm/followups/${followupId}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_by: user?.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Follow-up completed" });
        fetchData();
        if (selectedCustomer) fetchCustomerDetails(selectedCustomer.id);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to complete follow-up", variant: "destructive" });
    }
  };

  // Send email
  const handleSendEmail = async () => {
    if (!selectedCustomer || !emailForm.subject || !emailForm.html_content) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${selectedCustomer.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...emailForm,
          user_id: user?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Success", description: "Email sent" });
        setShowEmailDialog(false);
        setEmailForm({ subject: "", html_content: "" });
        fetchCustomerDetails(selectedCustomer.id);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send email", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Import CSV
  const handleImportCSV = async () => {
    if (!importData.trim()) {
      toast({ title: "Error", description: "Please paste CSV data or upload a file", variant: "destructive" });
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/crm/import/${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_data: importData,
          user_id: user?.id,
          skip_duplicates: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Import Complete",
          description: data.message,
        });
        setShowImportDialog(false);
        setImportData("");
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to import", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportData(text);
    };
    reader.readAsText(file);
  };

  // Export CSV
  const handleExport = () => {
    const params = new URLSearchParams();
    if (stateFilter) params.append("state", stateFilter);
    if (statusFilter) params.append("status", statusFilter);
    if (stageFilter) params.append("stage", stageFilter);

    window.open(`${API_BASE}/api/crm/export/${orgId}?${params}`, "_blank");
  };

  // Reset forms
  const resetCustomerForm = () => {
    setCustomerForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      company_name: "",
      website: "",
      address_line1: "",
      city: "",
      postal_code: "",
      australian_state: "",
      mayor_name: "",
      ceo_name: "",
      status: "lead",
      stage: "new",
      estimated_value: "",
      tags: "",
    });
    setSelectedCustomer(null);
  };

  const resetActivityForm = () => {
    setActivityForm({
      activity_type: "call",
      subject: "",
      description: "",
      outcome: "",
      duration_minutes: "",
    });
  };

  const resetFollowupForm = () => {
    setFollowupForm({
      title: "",
      description: "",
      due_date: "",
      priority: "medium",
    });
  };

  // Open edit dialog
  const openEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerForm({
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      company_name: customer.company_name || "",
      website: customer.website || "",
      address_line1: customer.address_line1 || "",
      city: customer.city || "",
      postal_code: customer.postal_code || "",
      australian_state: customer.australian_state || "",
      mayor_name: customer.mayor_name || "",
      ceo_name: customer.ceo_name || "",
      status: customer.status || "lead",
      stage: customer.stage || "new",
      estimated_value: customer.estimated_value?.toString() || "",
      tags: customer.tags?.join(", ") || "",
    });
    setShowCustomerDialog(true);
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusConfig = CUSTOMER_STATUSES.find(s => s.value === status);
    return (
      <Badge className={`${statusConfig?.color || "bg-gray-500"} text-white`}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  // Get stage badge
  const getStageBadge = (stage: string) => {
    const stageConfig = PIPELINE_STAGES.find(s => s.value === stage);
    return (
      <Badge variant="outline" className="border-current">
        {stageConfig?.label || stage}
      </Badge>
    );
  };

  if (loading && !stats) {
    return (
      <DashboardLayout userRole={user?.role as "super_admin" | "org_admin"}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={user?.role as "super_admin" | "org_admin"}>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Users className="w-8 h-8" />
              CRM
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage customers, track communications, and run email campaigns
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => { resetCustomerForm(); setShowCustomerDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Customers</span>
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">Pipeline</span>
            </TabsTrigger>
            <TabsTrigger value="followups" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Follow-ups</span>
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">Campaigns</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Customers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats?.totalCustomers || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Pipeline Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    ${(stats?.totalPipelineValue || 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Pending Follow-ups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold flex items-center gap-2">
                    {stats?.pendingFollowups || 0}
                    {(stats?.overdueFollowups || 0) > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {stats?.overdueFollowups} overdue
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent Activities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats?.recentActivities || 0}</div>
                  <p className="text-xs text-muted-foreground">Last 7 days</p>
                </CardContent>
              </Card>
            </div>

            {/* Status & Stage Distribution */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Customers by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {CUSTOMER_STATUSES.map(status => (
                      <div key={status.value} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${status.color}`} />
                          <span>{status.label}</span>
                        </div>
                        <span className="font-semibold">
                          {stats?.customersByStatus?.[status.value] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Customers by State</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {states.slice(0, 8).map(s => (
                      <div key={s.state} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span>{s.state}</span>
                        </div>
                        <span className="font-semibold">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Follow-ups */}
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Follow-ups</CardTitle>
                <CardDescription>Tasks due soon</CardDescription>
              </CardHeader>
              <CardContent>
                {followups.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No pending follow-ups</p>
                ) : (
                  <div className="space-y-3">
                    {followups.slice(0, 5).map(followup => (
                      <div
                        key={followup.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{followup.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {followup.customer?.company_name || followup.customer?.first_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={new Date(followup.due_date) < new Date() ? "destructive" : "secondary"}>
                            {new Date(followup.due_date).toLocaleDateString()}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCompleteFollowup(followup.id)}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search customers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Status</SelectItem>
                      {CUSTOMER_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Stages</SelectItem>
                      {PIPELINE_STAGES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={stateFilter} onValueChange={setStateFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All States</SelectItem>
                      {AUSTRALIAN_STATES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={fetchData}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Customers Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No customers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      customers.map(customer => (
                        <TableRow
                          key={customer.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => fetchCustomerDetails(customer.id)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {customer.company_name || `${customer.first_name} ${customer.last_name || ""}`}
                              </p>
                              {customer.company_name && (
                                <p className="text-sm text-muted-foreground">
                                  {customer.mayor_name && `Mayor: ${customer.mayor_name}`}
                                  {customer.ceo_name && ` | CEO: ${customer.ceo_name}`}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {customer.email && (
                                <p className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" /> {customer.email}
                                </p>
                              )}
                              {customer.phone && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="w-3 h-3" /> {customer.phone}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {customer.australian_state && (
                              <Badge variant="outline">{customer.australian_state}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(customer.status)}</TableCell>
                          <TableCell>{getStageBadge(customer.stage)}</TableCell>
                          <TableCell>
                            {customer.last_contacted_at ? (
                              <span className="text-sm text-muted-foreground">
                                {new Date(customer.last_contacted_at).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); fetchCustomerDetails(customer.id); }}>
                                  <Eye className="w-4 h-4 mr-2" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditCustomer(customer); }}>
                                  <Edit className="w-4 h-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); setShowDeleteConfirm(true); }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              {totalCustomers > 50 && (
                <div className="p-4 border-t">
                  <p className="text-sm text-muted-foreground text-center">
                    Showing {customers.length} of {totalCustomers} customers
                  </p>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {PIPELINE_STAGES.map(stage => {
                const count = stats?.pipelineByStage?.[stage.value] || 0;
                const stageCustomers = customers.filter(c => c.stage === stage.value);

                return (
                  <Card key={stage.value} className="min-h-[300px]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{stage.label}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </CardTitle>
                      <div className={`h-1 rounded ${stage.color}`} />
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {stageCustomers.slice(0, 5).map(customer => (
                        <div
                          key={customer.id}
                          className="p-2 bg-muted/50 rounded text-sm cursor-pointer hover:bg-muted"
                          onClick={() => fetchCustomerDetails(customer.id)}
                        >
                          <p className="font-medium truncate">
                            {customer.company_name || customer.first_name}
                          </p>
                          {customer.estimated_value && (
                            <p className="text-xs text-muted-foreground">
                              ${customer.estimated_value.toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                      {stageCustomers.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{stageCustomers.length - 5} more
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Follow-ups Tab */}
          <TabsContent value="followups" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Follow-ups</CardTitle>
                <CardDescription>Tasks that need attention</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No pending follow-ups
                        </TableCell>
                      </TableRow>
                    ) : (
                      followups.map(followup => {
                        const isOverdue = new Date(followup.due_date) < new Date();
                        const priorityConfig = FOLLOWUP_PRIORITIES.find(p => p.value === followup.priority);

                        return (
                          <TableRow key={followup.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{followup.title}</p>
                                {followup.description && (
                                  <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                    {followup.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                className="text-left hover:underline"
                                onClick={() => followup.customer && fetchCustomerDetails(followup.customer.id)}
                              >
                                {followup.customer?.company_name || followup.customer?.first_name || "Unknown"}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge variant={isOverdue ? "destructive" : "secondary"}>
                                {new Date(followup.due_date).toLocaleDateString()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${priorityConfig?.color} text-white`}>
                                {priorityConfig?.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCompleteFollowup(followup.id)}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Complete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Email Campaigns</CardTitle>
                    <CardDescription>Create and manage email campaigns</CardDescription>
                  </div>
                  <Button disabled>
                    <Plus className="w-4 h-4 mr-2" />
                    New Campaign
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {campaigns.length === 0 ? (
                  <div className="text-center py-12">
                    <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No campaigns yet</p>
                    <p className="text-sm text-muted-foreground">
                      Create your first email campaign to reach your customers
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Opens</TableHead>
                        <TableHead>Clicks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map(campaign => (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={campaign.status === "sent" ? "default" : "secondary"}>
                              {campaign.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{campaign.recipient_count}</TableCell>
                          <TableCell>{campaign.total_sent}</TableCell>
                          <TableCell>{campaign.total_opened}</TableCell>
                          <TableCell>{campaign.total_clicked}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Customer Dialog */}
        <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
              <DialogDescription>
                {selectedCustomer ? "Update customer information" : "Enter customer details"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Company/Council Name</Label>
                <Input
                  value={customerForm.company_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, company_name: e.target.value })}
                  placeholder="e.g., Brisbane City Council"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select
                  value={customerForm.australian_state}
                  onValueChange={(v) => setCustomerForm({ ...customerForm, australian_state: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUSTRALIAN_STATES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mayor Name</Label>
                <Input
                  value={customerForm.mayor_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, mayor_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CEO Name</Label>
                <Input
                  value={customerForm.ceo_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, ceo_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact First Name</Label>
                <Input
                  value={customerForm.first_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Last Name</Label>
                <Input
                  value={customerForm.last_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, last_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={customerForm.website}
                  onChange={(e) => setCustomerForm({ ...customerForm, website: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estimated Value ($)</Label>
                <Input
                  type="number"
                  value={customerForm.estimated_value}
                  onChange={(e) => setCustomerForm({ ...customerForm, estimated_value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={customerForm.status}
                  onValueChange={(v) => setCustomerForm({ ...customerForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pipeline Stage</Label>
                <Select
                  value={customerForm.stage}
                  onValueChange={(v) => setCustomerForm({ ...customerForm, stage: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={customerForm.tags}
                  onChange={(e) => setCustomerForm({ ...customerForm, tags: e.target.value })}
                  placeholder="e.g., priority, regional, tier-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCustomerDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveCustomer} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedCustomer ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer Detail Dialog */}
        <Dialog open={showCustomerDetail} onOpenChange={setShowCustomerDetail}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedCustomer && (
              <>
                <DialogHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <DialogTitle className="text-xl">
                        {selectedCustomer.company_name || `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`}
                      </DialogTitle>
                      <DialogDescription className="flex items-center gap-2 mt-1">
                        {selectedCustomer.australian_state && (
                          <Badge variant="outline">{selectedCustomer.australian_state}</Badge>
                        )}
                        {getStatusBadge(selectedCustomer.status)}
                        {getStageBadge(selectedCustomer.stage)}
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditCustomer(selectedCustomer)}>
                        <Edit className="w-4 h-4 mr-1" /> Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="grid md:grid-cols-3 gap-6 py-4">
                  {/* Contact Info */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Contact Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {selectedCustomer.mayor_name && (
                        <p><strong>Mayor:</strong> {selectedCustomer.mayor_name}</p>
                      )}
                      {selectedCustomer.ceo_name && (
                        <p><strong>CEO:</strong> {selectedCustomer.ceo_name}</p>
                      )}
                      {selectedCustomer.email && (
                        <p className="flex items-center gap-2">
                          <Mail className="w-4 h-4" /> {selectedCustomer.email}
                        </p>
                      )}
                      {selectedCustomer.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-4 h-4" /> {selectedCustomer.phone}
                        </p>
                      )}
                      {selectedCustomer.website && (
                        <p className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" /> {selectedCustomer.website}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => setShowActivityDialog(true)}
                      >
                        <Activity className="w-4 h-4 mr-2" /> Log Activity
                      </Button>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => setShowFollowupDialog(true)}
                      >
                        <Calendar className="w-4 h-4 mr-2" /> Schedule Follow-up
                      </Button>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => setShowEmailDialog(true)}
                        disabled={!selectedCustomer.email}
                      >
                        <Mail className="w-4 h-4 mr-2" /> Send Email
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Status Updates */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Update Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs">Status</Label>
                        <Select
                          value={selectedCustomer.status}
                          onValueChange={(v) => handleUpdateStatus(selectedCustomer.id, v)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOMER_STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Pipeline Stage</Label>
                        <Select
                          value={selectedCustomer.stage}
                          onValueChange={(v) => handleUpdateStage(selectedCustomer.id, v)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Activities & Follow-ups */}
                <Tabs defaultValue="activities" className="mt-4">
                  <TabsList>
                    <TabsTrigger value="activities">Activities ({customerActivities.length})</TabsTrigger>
                    <TabsTrigger value="followups">Follow-ups ({customerFollowups.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="activities" className="mt-4">
                    {customerActivities.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No activities yet</p>
                    ) : (
                      <div className="space-y-3">
                        {customerActivities.map(activity => {
                          const typeConfig = ACTIVITY_TYPES.find(t => t.value === activity.activity_type);
                          const Icon = typeConfig?.icon || MessageSquare;

                          return (
                            <div key={activity.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                              <div className="p-2 bg-primary/10 rounded">
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium">{activity.subject}</p>
                                {activity.description && (
                                  <p className="text-sm text-muted-foreground">{activity.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(activity.activity_date).toLocaleString()}
                                  {activity.created_by_user && ` by ${activity.created_by_user.full_name}`}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="followups" className="mt-4">
                    {customerFollowups.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No pending follow-ups</p>
                    ) : (
                      <div className="space-y-3">
                        {customerFollowups.map(followup => (
                          <div key={followup.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <p className="font-medium">{followup.title}</p>
                              <p className="text-sm text-muted-foreground">
                                Due: {new Date(followup.due_date).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCompleteFollowup(followup.id)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" /> Complete
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Activity Dialog */}
        <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Activity</DialogTitle>
              <DialogDescription>Record an interaction with this customer</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Activity Type</Label>
                <Select
                  value={activityForm.activity_type}
                  onValueChange={(v) => setActivityForm({ ...activityForm, activity_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={activityForm.subject}
                  onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })}
                  placeholder="e.g., Initial outreach call"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  placeholder="Notes about the interaction..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Outcome</Label>
                  <Select
                    value={activityForm.outcome}
                    onValueChange={(v) => setActivityForm({ ...activityForm, outcome: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="no_answer">No Answer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={activityForm.duration_minutes}
                    onChange={(e) => setActivityForm({ ...activityForm, duration_minutes: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowActivityDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateActivity} disabled={saving || !activityForm.subject}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Log Activity
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Follow-up Dialog */}
        <Dialog open={showFollowupDialog} onOpenChange={setShowFollowupDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Follow-up</DialogTitle>
              <DialogDescription>Create a reminder to follow up with this customer</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={followupForm.title}
                  onChange={(e) => setFollowupForm({ ...followupForm, title: e.target.value })}
                  placeholder="e.g., Follow up on proposal"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={followupForm.description}
                  onChange={(e) => setFollowupForm({ ...followupForm, description: e.target.value })}
                  placeholder="Details about what needs to be done..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date *</Label>
                  <Input
                    type="date"
                    value={followupForm.due_date}
                    onChange={(e) => setFollowupForm({ ...followupForm, due_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={followupForm.priority}
                    onValueChange={(v) => setFollowupForm({ ...followupForm, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOWUP_PRIORITIES.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFollowupDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateFollowup} disabled={saving || !followupForm.title || !followupForm.due_date}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Email Dialog */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send Email</DialogTitle>
              <DialogDescription>
                Send an email to {selectedCustomer?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="Email subject"
                />
              </div>
              <div className="space-y-2">
                <Label>Message *</Label>
                <Textarea
                  value={emailForm.html_content}
                  onChange={(e) => setEmailForm({ ...emailForm, html_content: e.target.value })}
                  placeholder="Email content (supports HTML)"
                  rows={10}
                />
                <p className="text-xs text-muted-foreground">
                  Available placeholders: {"{{first_name}}"}, {"{{last_name}}"}, {"{{company_name}}"}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
              <Button onClick={handleSendEmail} disabled={saving || !emailForm.subject || !emailForm.html_content}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" /> Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import Customers from CSV</DialogTitle>
              <DialogDescription>
                Upload a CSV file with council data. Supported columns: council, mayor, ceo, email, phone, state
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" /> Choose File
                </Button>
                <span className="text-sm text-muted-foreground">or paste CSV data below</span>
              </div>
              <Textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="council,mayor,ceo,email,state
Brisbane City Council,Adrian Schrinner,Colin Jensen,contact@brisbane.qld.gov.au,QLD
..."
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The import will automatically detect columns like: council, council_name, mayor, ceo, email, phone, state, etc.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
              <Button onClick={handleImportCSV} disabled={importing || !importData.trim()}>
                {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {selectedCustomer?.company_name || selectedCustomer?.first_name} and all associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCustomer} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
