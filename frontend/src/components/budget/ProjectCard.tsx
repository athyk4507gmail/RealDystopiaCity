import { useState } from "react";
import { IndianRupee, Calendar, Building2, AlertTriangle, Clock, TrendingUp, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { BudgetProjectResponse } from "@/lib/api";
import { api } from "@/lib/api";

interface ProjectCardProps {
  project: BudgetProjectResponse;
  formatCategory: (category: string) => string;
}

export default function ProjectCard({ project, formatCategory }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  
  const formatAmount = (amount: number) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    }
    return `₹${amount.toLocaleString()}`;
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "active": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "stalled": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "cancelled": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };
  
  const getAnomalyColor = (flag?: string) => {
    if (!flag || flag === "none") return "";
    switch (flag) {
      case "delayed": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "stalled": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "inconsistent": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "over_budget": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };
  
  const getAnomalyIcon = (flag?: string) => {
    if (!flag || flag === "none") return null;
    return <AlertTriangle className="w-4 h-4" />;
  };
  
  const getAnomalyLabel = (flag?: string) => {
    if (!flag || flag === "none") return "";
    switch (flag) {
      case "delayed": return "Delayed";
      case "stalled": return "Stalled";
      case "inconsistent": return "Inconsistent";
      case "over_budget": return "Over Budget";
      default: return flag;
    }
  };
  
  const handleRegenerateSummary = async () => {
    setRegenerating(true);
    try {
      await api.budgetWatch.regenerateSummary(project.id);
      // In a real app, we would update the project data here
      // For now, we'll just show a success message and refresh
      alert("Summary regenerated! Refresh the page to see updates.");
    } catch (error) {
      alert("Failed to regenerate summary. Please try again.");
    } finally {
      setRegenerating(false);
    }
  };
  
  // Calculate spend percentage
  const spendPercentage = (project.spent_amount / project.allocated_amount) * 100;
  const progressWidth = `${project.percent_complete}%`;
  const spendWidth = `${Math.min(spendPercentage, 100)}%`;
  
  return (
    <div className="rounded-lg border border-border bg-slate-900/50 overflow-hidden hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-1">{project.project_name}</h3>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Building2 className="w-4 h-4" />
              <span>Ward {project.ward_id}</span>
              <span className="text-slate-600">•</span>
              <span>{formatCategory(project.category)}</span>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
        
        {/* Status and Anomaly Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs border ${getStatusColor(project.status)}`}>
            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
          
          {project.gemma_anomaly_flag && project.gemma_anomaly_flag !== "none" && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs border ${getAnomalyColor(project.gemma_anomaly_flag)}`}>
              {getAnomalyIcon(project.gemma_anomaly_flag)}
              {getAnomalyLabel(project.gemma_anomaly_flag)}
            </span>
          )}
          
          {project.days_overdue && project.days_overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-1 text-xs text-orange-400 border border-orange-500/30">
              <Clock className="w-3 h-3" />
              {project.days_overdue} days overdue
            </span>
          )}
          
          {project.data_source === "real_scraped" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400 border border-green-500/30">
              Real Data
            </span>
          )}
        </div>
        
        {/* Budget and Progress Bars */}
        <div className="space-y-3 mb-3">
          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Progress</span>
              <span>{project.percent_complete.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
          
          {/* Spend vs Allocation Bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Spent vs Allocated</span>
              <span>{formatAmount(project.spent_amount)} / {formatAmount(project.allocated_amount)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden relative">
              <div 
                className="h-full bg-green-500 rounded-full absolute left-0 transition-all duration-500"
                style={{ width: spendWidth }}
              />
              <div 
                className="h-full bg-slate-600 rounded-full"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <IndianRupee className="w-4 h-4" />
            <span>Allocated: {formatAmount(project.allocated_amount)}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <TrendingUp className="w-4 h-4" />
            <span>Spent: {spendPercentage.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>Started: {new Date(project.start_date).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>Due: {new Date(project.expected_end_date).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-border p-4 bg-slate-900/30">
          {/* Gemma Summary */}
          {project.gemma_summary && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">AI Summary</h4>
              <div className="text-sm text-slate-400 bg-slate-800/50 rounded p-3">
                {showFullSummary || project.gemma_summary.length < 200 
                  ? project.gemma_summary 
                  : `${project.gemma_summary.substring(0, 200)}...`}
                {project.gemma_summary.length > 200 && (
                  <button
                    onClick={() => setShowFullSummary(!showFullSummary)}
                    className="ml-2 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    {showFullSummary ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>Generated by CityPulse AI</span>
                <button
                  onClick={handleRegenerateSummary}
                  disabled={regenerating}
                  className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </button>
              </div>
            </div>
          )}
          
          {/* Anomaly Explanation */}
          {project.gemma_anomaly_explanation && project.gemma_anomaly_flag && project.gemma_anomaly_flag !== "none" && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                Issue Detected
              </h4>
              <div className={`text-sm ${getAnomalyColor(project.gemma_anomaly_flag)} rounded p-3 border`}>
                {project.gemma_anomaly_explanation}
              </div>
            </div>
          )}
          
          {/* Related Complaints */}
          {project.related_complaints && project.related_complaints.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Related Citizen Reports</h4>
              <div className="space-y-2">
                {project.related_complaints.slice(0, 3).map((complaint) => (
                  <div key={complaint.id} className="text-sm text-slate-400 bg-slate-800/30 rounded p-2">
                    <div className="font-medium">{complaint.type}</div>
                    <div className="text-xs truncate">{complaint.description}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(complaint.created_at).toLocaleDateString()} • {complaint.status}
                    </div>
                  </div>
                ))}
              </div>
              {project.related_complaints.length > 3 && (
                <div className="text-xs text-slate-500 mt-2">
                  +{project.related_complaints.length - 3} more complaints in this ward
                </div>
              )}
            </div>
          )}
          
          {/* Timeline */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-2">Timeline</h4>
            <div className="flex items-center justify-between text-sm text-slate-400">
              <div className="text-center">
                <div className="font-medium">Start</div>
                <div>{new Date(project.start_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="h-px flex-1 bg-slate-700 mx-2 relative">
                {project.days_overdue && project.days_overdue > 0 ? (
                  <div className="absolute left-0 top-1/2 w-full h-1 bg-gradient-to-r from-blue-500 via-orange-500 to-red-500 rounded-full -translate-y-1/2" />
                ) : (
                  <div className="absolute left-0 top-1/2 w-full h-1 bg-gradient-to-r from-blue-500 to-green-500 rounded-full -translate-y-1/2" />
                )}
                <div 
                  className="absolute top-1/2 w-3 h-3 rounded-full bg-blue-500 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${Math.min(project.percent_complete, 100)}%` }}
                />
              </div>
              <div className="text-center">
                <div className="font-medium">Due</div>
                <div>{new Date(project.expected_end_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}