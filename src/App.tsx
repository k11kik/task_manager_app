import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Calendar, 
  Archive as ArchiveIcon, 
  Zap, 
  Target, 
  Clock, 
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  Circle,
  X,
  RefreshCcw,
  ArrowRightLeft,
  Trash2,
  Settings as SettingsIcon,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, isAfter, subMonths } from 'date-fns';
import { Category, Task } from './types';
import { cn, formatDate } from './lib/utils';

const THEME_CATEGORIES = [
  { id: 'Urgent', label: 'Urgent', icon: Zap, color: 'bg-red-50/50 border-red-100', accent: 'bg-red-500', text: 'text-red-700', badge: 'text-red-400 border-red-100', desc: '3 Slots' },
  { id: 'Focus', label: 'Focus', icon: Target, color: 'bg-indigo-50/50 border-indigo-100', accent: 'bg-indigo-500', text: 'text-indigo-700', badge: 'text-indigo-500', desc: 'Main' },
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('');
  const [isPickingDaily, setIsPickingDaily] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'archive' | 'settings'>('dashboard');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [settings, setSettings] = useState({
    urgentLimit: 3,
    archiveThresholdDays: 30,
    warningThreshold: 15,
    criticalThreshold: 30
  });

  // Load from localeStorage
  useEffect(() => {
    const savedTasks = localStorage.getItem('focusflow_tasks');
    const savedSettings = localStorage.getItem('focusflow_settings');

    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      setSettings(parsedSettings);
      
      // Auto-archive sweep based on loaded settings
      if (savedTasks) {
        const parsedTasks = JSON.parse(savedTasks);
        const updatedTasks = parsedTasks.map((t: Task) => {
          if (t.category !== 'Archive' && differenceInDays(Date.now(), t.updatedAt) >= parsedSettings.archiveThresholdDays) {
            return { ...t, category: 'Archive' as Category, updatedAt: Date.now() };
          }
          return t;
        });
        setTasks(updatedTasks);
      }
    } else if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('focusflow_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('focusflow_settings', JSON.stringify(settings));
  }, [settings]);

  const [error, setError] = useState<string | null>(null);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const projects = useMemo(() => {
    const p = Array.from(new Set(tasks.map(t => t.project)));
    return ['All', ...p];
  }, [tasks]);

  const stats = useMemo(() => {
    const activeTasks = tasks.filter(t => t.category !== 'Archive' && !t.isDone);
    const focusTasksCount = tasks.filter(t => t.category === 'Focus' && !t.isDone).length;
    const urgentCount = tasks.filter(t => t.category === 'Urgent').length;
    
    let gaugeColor = 'bg-indigo-400';
    let textColor = 'text-white';
    if (focusTasksCount > settings.criticalThreshold) {
      gaugeColor = 'bg-red-500';
      textColor = 'text-red-400 font-black';
    } else if (focusTasksCount > settings.warningThreshold) {
      gaugeColor = 'bg-amber-400';
      textColor = 'text-amber-400 font-black';
    }

    return {
      active: activeTasks.length,
      archived: tasks.filter(t => t.category === 'Archive').length,
      urgentCount,
      focusTasksCount,
      gaugeColor,
      textColor,
      morningRoutineReady: urgentCount >= settings.urgentLimit,
      loadPercentage: Math.min((focusTasksCount / settings.criticalThreshold) * 100, 100)
    };
  }, [tasks, settings]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             t.project.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesProject = selectedProject === 'All' || t.project === selectedProject;
        return matchesSearch && matchesProject;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [tasks, searchTerm, selectedProject]);

  const groupedFocusTasks = useMemo(() => {
    const focusTasks = filteredTasks.filter(t => t.category === 'Focus');
    const grouped: Record<string, Task[]> = {};
    focusTasks.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return grouped;
  }, [filteredTasks]);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskProject.trim()) return;
    
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle,
      project: newTaskProject,
      category: 'Focus',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDone: false,
      notes: '',
    };
    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskProject('');
    setViewMode('dashboard');
  };

  const moveTask = (id: string, newCategory: Category) => {
    if (newCategory === 'Urgent') {
      const isAlreadyUrgent = tasks.find(t => t.id === id)?.category === 'Urgent';
      if (!isAlreadyUrgent) {
        const urgentCount = tasks.filter(t => t.category === 'Urgent').length;
        if (urgentCount >= settings.urgentLimit) {
          setError(`Urgent Capacity Full: You have reached the ${settings.urgentLimit} task limit. Complete or archive an existing task first.`);
          return;
        }
      }
    }
    setTasks(tasks.map(t => t.id === id ? { ...t, category: newCategory, updatedAt: Date.now() } : t));
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t));
    setEditingTask(null);
  };

  const toggleDone = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, isDone: !t.isDone, updatedAt: Date.now() } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const pickDailyTasks = (selectedIds: string[]) => {
    const currentUrgentCount = tasks.filter(t => t.category === 'Urgent').length;
    if (currentUrgentCount + selectedIds.length > settings.urgentLimit) {
      setError(`Daily Pick Violation: This batch would exceed the ${settings.urgentLimit} slot limit.`);
      return;
    }
    setTasks(tasks.map(t => 
      selectedIds.includes(t.id) 
        ? { ...t, category: 'Urgent' as Category, updatedAt: Date.now() } 
        : t
    ));
    setIsPickingDaily(false);
  };

  return (
    <div className="h-screen w-full bg-[#f8fafc] text-slate-800 flex flex-col font-sans overflow-hidden">
      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-12 left-1/2 z-[100] bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px] max-w-md"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <Zap size={20} className="text-white fill-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-0.5">System Exception</p>
              <p className="text-sm font-bold leading-tight">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Target size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SystematicFlow</h1>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-500">
            <button 
              onClick={() => setViewMode('dashboard')}
              className={cn("pb-4 -mb-4 transition-colors", viewMode === 'dashboard' ? "text-indigo-600 border-b-2 border-indigo-600" : "hover:text-slate-800")}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setViewMode('archive')}
              className={cn("pb-4 -mb-4 transition-colors", viewMode === 'archive' ? "text-indigo-600 border-b-2 border-indigo-600" : "hover:text-slate-800")}
            >
              Archive
            </button>
            <button 
              onClick={() => setViewMode('settings')}
              className={cn("pb-4 -mb-4 transition-colors", viewMode === 'settings' ? "text-indigo-600 border-b-2 border-indigo-600" : "hover:text-slate-800")}
            >
              Settings
            </button>
            <div className="relative group">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-5 bg-transparent border-none focus:ring-0 text-sm w-32 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className={cn(
            "hidden lg:flex px-3 py-1 rounded-full border font-medium transition-colors",
            stats.morningRoutineReady ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-amber-50 text-amber-700 border-amber-200"
          )}>
            Morning Routine: {stats.urgentCount}/{settings.urgentLimit} Slots
          </div>
          <div className="hidden lg:block text-slate-300">|</div>
          <div className="text-slate-400 font-medium italic">Friday Review: Tracking</div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 p-6 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
        
        {/* Sidebar / Input Section */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">New Task Entry</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Project Code</label>
                <div className="relative">
                  <input 
                    list="project-suggestions"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. CORE, DEV"
                    value={newTaskProject}
                    onChange={(e) => setNewTaskProject(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                    }}
                  />
                  <datalist id="project-suggestions">
                    {projects.filter(p => p !== 'All').map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Task Detail</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none" 
                  placeholder="What needs to be done? (Cmd/Ctrl+Enter to save)"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                  }}
                />
              </div>
              <button 
                type="submit"
                disabled={!newTaskTitle.trim() || !newTaskProject.trim()}
                className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg text-sm shadow-md shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Add to Focus
              </button>
            </form>
          </div>

          <div className="bg-slate-800 text-slate-300 rounded-xl p-5 shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Workflow Health</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span>Focus Backlog</span>
                <span className={cn("font-mono transition-colors", stats.textColor)}>{stats.focusTasksCount} items</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>System Archive</span>
                <span className="text-white font-mono">{stats.archived}</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full mt-4 overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-1000", stats.gaugeColor)} 
                  style={{ width: `${stats.loadPercentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-[10px] opacity-60">
                  {stats.focusTasksCount > settings.criticalThreshold ? 'CRITICAL LOAD' : stats.focusTasksCount > settings.warningThreshold ? 'WARNING: HIGH LOAD' : 'SAFE CAPACITY'}
                </p>
                <p className="text-[10px] font-mono opacity-40">{Math.round(stats.loadPercentage)}%</p>
              </div>
            </div>
          </div>
          
          <div className="px-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-slate-400 mb-2 block">Filter View</label>
            <div className="flex flex-wrap gap-1">
              {projects.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedProject(p)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold transition-all",
                    selectedProject === p ? "bg-indigo-100 text-indigo-700" : "bg-white border border-slate-100 text-slate-400 hover:text-slate-600"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Task Columns */}
        <div className="col-span-12 lg:col-span-9 h-full min-h-0 overflow-hidden">
          {viewMode === 'dashboard' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
              {/* Urgent Column */}
              <section className="flex flex-col rounded-2xl border p-4 min-h-0 bg-red-50/50 border-red-100">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="font-bold flex items-center gap-2 text-red-700">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-red-500"></span>
                    Urgent
                  </h3>
                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border uppercase text-red-400 border-red-100">{settings.urgentLimit} Slots</span>
                </div>
                
                <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence mode="popLayout">
                    {filteredTasks
                      .filter(t => t.category === 'Urgent')
                      .map(task => (
                        <TaskCard 
                          key={task.id} 
                          task={task} 
                          onToggle={() => toggleDone(task.id)}
                          onMove={(newCat) => moveTask(task.id, newCat)}
                          onDelete={() => deleteTask(task.id)}
                          onEdit={() => setEditingTask(task)}
                          variant="Urgent"
                        />
                      ))}
                  </AnimatePresence>
                  {filteredTasks.filter(t => t.category === 'Urgent').length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                      <Zap size={48} strokeWidth={1} />
                      <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">No Urgent Tasks</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Focus Column (Spans 2) */}
              <section className="col-span-1 md:col-span-2 flex flex-col rounded-2xl border p-4 min-h-0 bg-indigo-50/50 border-indigo-100">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="font-bold flex items-center gap-2 text-indigo-700">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-indigo-500"></span>
                    Focus (Grouped by Project)
                  </h3>
                  <button 
                    onClick={() => setIsPickingDaily(true)}
                    className="text-[10px] font-bold text-indigo-500 uppercase tracking-tight hover:underline transition-all"
                  >
                    Extract to Urgent &rarr;
                  </button>
                </div>
                
                <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                  {Object.keys(groupedFocusTasks).length > 0 ? (
                    (Object.entries(groupedFocusTasks) as [string, Task[]][]).map(([project, tasks]) => (
                      <div key={project} className="space-y-3">
                        <div className="flex items-center gap-4 px-2">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-white/50 px-2 py-0.5 rounded border border-slate-100">
                            {project}
                          </h4>
                          <div className="h-px flex-1 bg-slate-200"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <AnimatePresence mode="popLayout">
                            {tasks.map(task => (
                              <TaskCard 
                                key={task.id} 
                                task={task} 
                                onToggle={() => toggleDone(task.id)}
                                onMove={(newCat) => moveTask(task.id, newCat)}
                                onDelete={() => deleteTask(task.id)}
                                onEdit={() => setEditingTask(task)}
                                variant="Focus"
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                      <Target size={48} strokeWidth={1} />
                      <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">No Focus Tasks</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : viewMode === 'archive' ? (
            /* Archive Mode */
            <section className="flex flex-col rounded-2xl border p-4 min-h-0 bg-slate-50/50 border-slate-200 h-full">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-bold flex items-center gap-2 text-slate-700">
                  <ArchiveIcon size={20} />
                  System Archive (Reviewing {settings.archiveThresholdDays}-day items)
                </h3>
                <button 
                   onClick={() => setTasks(tasks.filter(t => t.category !== 'Archive'))}
                   className="text-[10px] font-bold text-red-500 uppercase tracking-tight hover:underline transition-all flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear Entire Archive
                </button>
              </div>
              
              <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  <AnimatePresence mode="popLayout">
                    {filteredTasks
                      .filter(t => t.category === 'Archive')
                      .map(task => (
                        <TaskCard 
                          key={task.id} 
                          task={task} 
                          onToggle={() => toggleDone(task.id)}
                          onMove={(newCat) => moveTask(task.id, newCat)}
                          onDelete={() => deleteTask(task.id)}
                          onEdit={() => setEditingTask(task)}
                          variant="Archive"
                        />
                      ))}
                  </AnimatePresence>
                </div>
                {filteredTasks.filter(t => t.category === 'Archive').length === 0 && (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                    <ArchiveIcon size={48} strokeWidth={1} />
                    <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">Archive Empty</span>
                  </div>
                )}
              </div>
            </section>
          ) : (
            /* Settings Mode */
            <section className="flex flex-col rounded-2xl border p-8 min-h-0 bg-white border-slate-200 h-full overflow-y-auto custom-scrollbar">
              <div className="max-w-2xl mx-auto w-full">
                <div className="flex items-center gap-3 mb-10">
                  <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                    <SettingsIcon size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">System Preferences</h2>
                    <p className="text-sm text-slate-500">Tune your focus algorithms and capacity thresholds.</p>
                  </div>
                </div>

                <div className="space-y-12">
                  {/* Urgent Limits */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-4 text-amber-600">
                      <Zap size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Urgent Capacity</h3>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">Urgent Slot Limit</p>
                        <p className="text-xs text-slate-500">Maximum concurrent priority tasks allowed.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSettings(s => ({ ...s, urgentLimit: Math.max(1, s.urgentLimit - 1) }))}
                          className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold shadow-sm"
                        >-</button>
                        <span className="w-10 text-center font-mono font-bold text-xl">{settings.urgentLimit}</span>
                        <button 
                          onClick={() => setSettings(s => ({ ...s, urgentLimit: s.urgentLimit + 1 }))}
                          className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold shadow-sm"
                        >+</button>
                      </div>
                    </div>
                  </div>

                  {/* Health Thresholds */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-6 text-indigo-600">
                      <Activity size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Health Metrics</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <label className="text-xs font-bold text-amber-600 uppercase">Warning Threshold</label>
                          <input 
                            type="number"
                            className="w-16 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-amber-500"
                            value={settings.warningThreshold}
                            onChange={(e) => setSettings(s => ({ ...s, warningThreshold: Math.max(1, parseInt(e.target.value) || 1) }))}
                          />
                        </div>
                        <input 
                          type="range" min="1" max="50" step="1"
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          value={settings.warningThreshold}
                          onChange={(e) => setSettings(s => ({ ...s, warningThreshold: parseInt(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <label className="text-xs font-bold text-red-600 uppercase">Critical Threshold</label>
                          <input 
                            type="number"
                            className="w-16 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-red-500"
                            value={settings.criticalThreshold}
                            onChange={(e) => setSettings(s => ({ ...s, criticalThreshold: Math.max(2, parseInt(e.target.value) || 2) }))}
                          />
                        </div>
                        <input 
                          type="range" min="5" max="100" step="1"
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                          value={settings.criticalThreshold}
                          onChange={(e) => setSettings(s => ({ ...s, criticalThreshold: parseInt(e.target.value) }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Maintenance */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-4 text-slate-600">
                      <ArchiveIcon size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Auto-Archive Sweep</h3>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">Archive Threshold</p>
                        <p className="text-xs text-slate-500">Inactivity period before automatic archiving.</p>
                      </div>
                      <select 
                        className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                        value={settings.archiveThresholdDays}
                        onChange={(e) => setSettings(s => ({ ...s, archiveThresholdDays: parseInt(e.target.value) }))}
                      >
                        <option value={7}>7 Days (Aggressive)</option>
                        <option value={14}>14 Days (Balanced)</option>
                        <option value={30}>30 Days (Standard)</option>
                        <option value={90}>90 Days (Relaxed)</option>
                        <option value={99999}>Never (Manual only)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center sm:flex-row flex-col gap-4">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest italic">System state synced successfully</p>
                  <button 
                    onClick={() => setViewMode('dashboard')}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    Apply & Exit
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer Info Bar */}
      <footer className="bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex gap-6 overflow-x-auto no-scrollbar text-[10px]">
          <span className="font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Operational Status:</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
            <span className="text-slate-600 font-medium font-mono lowercase tracking-tighter">[{viewMode}] REVIEW MODE</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-slate-600 font-medium font-mono lowercase tracking-tighter">SWEEP LOG ACTIVE</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-slate-400 font-extrabold ml-4">
          FOCUSFLOW SYSTEM STACK V2.1
        </div>
      </footer>

      <AnimatePresence>
        {isPickingDaily && (
          <DailyPickModal 
            tasks={tasks.filter(t => t.category === 'Focus' && !t.isDone)} 
            onClose={() => setIsPickingDaily(false)} 
            onPick={pickDailyTasks} 
            currentUrgentCount={stats.urgentCount}
            limit={settings.urgentLimit}
          />
        )}
        {editingTask && (
          <EditTaskModal
            task={editingTask}
            onClose={() => setEditingTask(null)}
            onSave={(updates) => updateTask(editingTask.id, updates)}
            onMove={(newCat) => moveTask(editingTask.id, newCat)}
            onDelete={() => deleteTask(editingTask.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onToggle: () => void;
  onMove: (cat: Category) => void;
  onDelete: () => void;
  onEdit: () => void;
  variant?: 'Urgent' | 'Focus' | 'Archive';
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onToggle, onMove, onDelete, onEdit, variant = 'Focus' }) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={(e) => {
        // Prevent clicking the card from triggering edit if we are clicking a button
        if ((e.target as HTMLElement).closest('button')) return;
        onEdit();
      }}
      className={cn(
        "bg-white rounded-xl p-4 shadow-sm border border-slate-200 group hover:border-indigo-300 transition-all flex flex-col cursor-pointer",
        variant === 'Urgent' && "border-l-4 border-l-red-500",
        variant === 'Archive' && "opacity-70 grayscale",
        task.isDone && "grayscale opacity-50"
      )}
    >
      <div className="flex items-center justify-between mb-1.5 pointer-events-none">
        <p className="text-[9px] font-bold text-slate-400 leading-none tracking-wider uppercase font-mono">
          ({formatDate(task.createdAt)}) <span className="text-indigo-600 opacity-60">[{task.project}]</span>
        </p>
        {variant === 'Archive' && (
          <button 
            onClick={(e) => { e.stopPropagation(); onMove('Focus'); }}
            className="text-[9px] font-black text-indigo-600 hover:underline flex items-center gap-0.5 pointer-events-auto"
            title="Restore to Focus"
          >
            <RefreshCcw size={8} /> RESTORE
          </button>
        )}
      </div>
      <p className={cn("text-sm font-semibold text-slate-800 leading-tight mb-2 break-words", task.isDone && "line-through text-slate-400")}>
        {task.title}
      </p>
      
      {task.notes && (
        <p className="text-[10px] text-slate-400 line-clamp-2 mb-3 leading-relaxed italic">
          {task.notes}
        </p>
      )}
      
      <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-auto">
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={cn(
              "w-4 h-4 rounded border-2 transition-all flex items-center justify-center",
              task.isDone ? "bg-blue-500 border-blue-500" : "border-slate-300 hover:border-blue-400"
            )}
          >
            {task.isDone && <CheckCircle2 size={10} className="text-white" />}
          </button>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{format(task.updatedAt, 'MMM d HH:mm')}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {variant !== 'Urgent' && task.category !== 'Archive' && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); }} className="p-1 hover:bg-red-50 text-red-500 rounded" title="Level to Urgent">
              <Zap size={10} />
            </button>
          )}
          {variant !== 'Focus' && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Focus'); }} className="p-1 hover:bg-indigo-50 text-indigo-500 rounded" title="Level to Focus">
              <Target size={10} />
            </button>
          )}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1 hover:bg-slate-100 text-slate-400 rounded">
              <MoreVertical size={10} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-indigo-200 rounded-xl shadow-2xl z-[70] py-1 font-bold text-[10px] uppercase tracking-wider overflow-hidden">
                  {variant === 'Focus' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 border-b border-slate-50 flex items-center gap-2">
                      <Zap size={12} className="text-red-400" /> Move to Urgent
                    </button>
                  )}
                  {variant !== 'Archive' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Archive'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-600 border-b border-slate-50 flex items-center gap-2">
                      <ArchiveIcon size={12} className="text-slate-400" /> Move to Archive
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                    <Trash2 size={12} className="text-red-400" /> Delete Permanently
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};


function DailyPickModal({ tasks, onClose, onPick, currentUrgentCount, limit }: { tasks: Task[]; onClose: () => void; onPick: (ids: string[]) => void; currentUrgentCount: number; limit: number }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const remainingSlots = limit - currentUrgentCount;

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      if (selectedIds.length >= remainingSlots) {
        alert(`You can only add ${remainingSlots} more task(s) to Urgent.`);
        return;
      }; 
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-orange-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold tracking-tight text-orange-600">Daily Choice</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-6">Select <span className="font-bold text-orange-600">up to {Math.max(0, remainingSlots)}</span> priority tasks from Focus to move to Urgent.</p>
          
          <div className="max-h-96 overflow-y-auto space-y-2 mb-8 pr-2 custom-scrollbar">
            {tasks.map(task => (
              <button
                key={task.id}
                onClick={() => toggleSelect(task.id)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-4",
                  selectedIds.includes(task.id) 
                    ? "bg-orange-50 border-orange-200 ring-2 ring-orange-100" 
                    : "bg-white border-slate-100 hover:border-orange-100"
                )}
              >
                <div className={cn(
                  "mt-1 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                  selectedIds.includes(task.id) ? "bg-orange-600 border-orange-600" : "border-slate-200"
                )}>
                  {selectedIds.includes(task.id) && <CheckCircle2 size={12} className="text-white" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">({formatDate(task.createdAt)})</span>
                    <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded leading-none">[{task.project}]</span>
                  </div>
                  <h3 className="text-sm font-semibold leading-tight">{task.title}</h3>
                </div>
              </button>
            ))}
            {tasks.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Target size={40} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium">No tasks in Focus list.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-slate-500">
              <span className="text-orange-600 font-bold">{selectedIds.length}</span> / {remainingSlots} slots
            </div>
            <button 
              onClick={() => onPick(selectedIds)}
              disabled={selectedIds.length === 0}
              className="px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-orange-100 flex items-center gap-2"
            >
              <Zap size={18} />
              Set Today's Focus
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function EditTaskModal({ task, onClose, onSave, onMove, onDelete }: { task: Task; onClose: () => void; onSave: (updates: Partial<Task>) => void; onMove: (cat: Category) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, notes });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
      >
        <div className="p-8 flex-1">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold tracking-tight">Modify Task</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 md:hidden">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Task Description</label>
              <textarea 
                autoFocus
                className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-lg font-medium outline-none transition-all resize-none h-32"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Memos / Context</label>
              <textarea 
                placeholder="Add details, links, or sub-tasks..."
                className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-sm font-medium outline-none transition-all resize-none h-48"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e);
                }}
              />
            </div>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={!title.trim()}
                className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-indigo-100"
              >
                Commit Changes (Cmd+Enter)
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar Actions */}
        <div className="bg-slate-50 p-8 w-full md:w-64 border-l border-slate-100 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Actions</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hidden md:flex">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-3">
            {task.category === 'Focus' && (
              <button 
                onClick={() => { onMove('Urgent'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600 hover:bg-red-100 transition-all group"
              >
                <Zap size={16} className="text-red-400" />
                Move to Urgent
              </button>
            )}
            {task.category !== 'Archive' && (
              <button 
                onClick={() => { onMove('Archive'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all group"
              >
                <ArchiveIcon size={16} className="text-slate-300 group-hover:text-indigo-400" />
                Archive Task
              </button>
            )}
            <button 
              onClick={() => { if(confirm('Delete this task permanently?')) { onDelete(); onClose(); } }}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
            >
              <Trash2 size={16} className="text-red-300" />
              Delete Permanently
            </button>
          </div>

          <div className="mt-auto pt-8">
            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-2">Metadata</p>
              <div className="space-y-1.5 font-mono text-[9px] text-slate-500">
                <div className="flex justify-between">
                  <span>ID:</span>
                  <span className="text-slate-800">{task.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="text-slate-800">{format(task.createdAt, 'MMM d, HH:mm')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Category:</span>
                  <span className="text-indigo-600 italic font-bold">{task.category}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
