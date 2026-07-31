"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Calendar, Building2, AlertTriangle, CheckCircle, Clock, TrendingUp, Filter, RefreshCw } from "lucide-react";
import { api, BudgetProjectResponse, BudgetSummaryResponse } from "@/lib/api";
import BudgetStatCard from "@/components/budget/BudgetStatCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ProjectCard from "@/components/budget/ProjectCard";
import WardFilter from "@/components/budget/WardFilter";
import StatusFilter from "@/components/budget/StatusFilter";
import CategoryFilter from "@/components/budget/CategoryFilter";

export default function BudgetWatchPage() {
  const [projects, setProjects] = useState<BudgetProjectResponse[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<BudgetProjectResponse[]>([]);
  const [summary, setSummary] = useState<BudgetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [projectsData, summaryData] = await Promise.all([
        api.budgetWatch.projects(),
        api.budgetWatch.summary(),
      ]);
      
      setProjects(projectsData);
      setFilteredProjects(projectsData);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budget data");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
  }, []);
  
  // Apply filters
  useEffect(() => {
    let filtered = projects;
    
    if (selectedWard !== null) {
      filtered = filtered.filter(p => p.ward_id === selectedWard);
    }
    
    if (selectedStatus !== null) {
      filtered = filtered.filter(p => p.status === selectedStatus);
    }
    
    if (selectedCategory !== null) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    
    setFilteredProjects(filtered);
  }, [projects, selectedWard, selectedStatus, selectedCategory]);
  
  if (loading) {
    return <LoadingSkeleton />;
  }
  
  if (error) {
    return <DataError message={error} onRetry={loadData} />;
  }
  
  // Extract unique values for filters
  const wards = Array.from(new Set(projects.map(p => p.ward_id))).sort((a, b) => a - b);
  const statuses = Array.from(new Set(projects.map(p => p.status)));
  const categories = Array.from(new Set(projects.map(p => p.category)));
  
  // Format category names for display
  const formatCategory = (category: string) => {
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };
  
  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Civic Budget & Project Watch</h1>
              <p className="text-slate-400">
                Transparency dashboard for municipal spending, project progress, and delay tracking
              </p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
          
          {/* Stats Summary */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <BudgetStatCard
                title="Total Allocated"
                value={`₹${(summary.total_allocated / 10000000).toFixed(1)}Cr`}
                icon={<IndianRupee className="w-5 h-5" />}
                description={`${summary.total_projects} projects`}
                trend="positive"
              />
              <BudgetStatCard
                title="Completion Rate"
                value={`${summary.overall_completion_rate.toFixed(1)}%`}
                icon={<TrendingUp className="w-5 h-5" />}
                description={`${summary.total_projects - summary.projects_delayed} on schedule`}
                trend={summary.overall_completion_rate > 50 ? "positive" : "negative"}
              />
              <BudgetStatCard
                title="Projects Delayed"
                value={summary.projects_delayed.toString()}
                icon={<Clock className="w-5 h-5" />}
                description={`${summary.average_delay_days ? `${summary.average_delay_days} avg days` : 'N/A'}`}
                trend={summary.projects_delayed > 0 ? "negative" : "positive"}
              />
              <BudgetStatCard
                title="Wards Covered"
                value={summary.wards_covered.toString()}
                icon={<Building2 className="w-5 h-5" />}
                description={`${summary.top_categories[0]?.category ? formatCategory(summary.top_categories[0].category) : ''}`}
                trend="positive"
              />
            </div>
          )}
        </div>
        
        {/* Filters */}
        <div className="mb-6 rounded-lg border border-border bg-slate-900/50 p-4">
          <div className="flex items-center gap-4 mb-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-foreground">Filter Projects</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <WardFilter
              wards={wards}
              selectedWard={selectedWard}
              onWardSelect={setSelectedWard}
            />
            
            <StatusFilter
              statuses={statuses}
              selectedStatus={selectedStatus}
              onStatusSelect={setSelectedStatus}
            />
            
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onCategorySelect={setSelectedCategory}
              formatCategory={formatCategory}
            />
          </div>
          
          {/* Active filters */}
          {(selectedWard !== null || selectedStatus !== null || selectedCategory !== null) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedWard !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-3 py-1 text-xs text-blue-400">
                  Ward {selectedWard}
                  <button onClick={() => setSelectedWard(null)} className="hover:text-blue-300">×</button>
                </span>
              )}
              {selectedStatus !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-400">
                  {selectedStatus}
                  <button onClick={() => setSelectedStatus(null)} className="hover:text-green-300">×</button>
                </span>
              )}
              {selectedCategory !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-3 py-1 text-xs text-purple-400">
                  {formatCategory(selectedCategory)}
                  <button onClick={() => setSelectedCategory(null)} className="hover:text-purple-300">×</button>
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Project Count */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">
            Projects ({filteredProjects.length})
            {selectedWard !== null && ` in Ward ${selectedWard}`}
          </h2>
          <div className="text-sm text-slate-400">
            Showing {filteredProjects.length} of {projects.length} total projects
          </div>
        </div>
        
        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center">
            <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">No projects found</h3>
            <p className="text-slate-500 mb-4">Try adjusting your filters or check back later for updates.</p>
            <button
              onClick={() => {
                setSelectedWard(null);
                setSelectedStatus(null);
                setSelectedCategory(null);
              }}
              className="rounded bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                formatCategory={formatCategory}
              />
            ))}
          </div>
        )}
        
        {/* Data Source Info */}
        <div className="mt-8 rounded-lg border border-border bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h3 className="font-medium text-slate-300">About This Data</h3>
          </div>
          <p className="text-sm text-slate-400 mb-2">
            This dashboard shows municipal budget projects with AI-generated plain-language summaries. 
            Data is updated regularly and includes both real municipal data (where available) and realistic mock data for demonstration.
          </p>
          <div className="text-xs text-slate-500">
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                {projects.filter(p => p.data_source === "real_scraped").length} real projects
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-blue-500" />
                {projects.filter(p => p.data_source === "mock_realistic").length} realistic mock projects
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}