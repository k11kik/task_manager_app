import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layout, 
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
  ArrowUpRight,
  Trash2,
  Settings as SettingsIcon,
  Activity,
  Download,
  Upload,
  FileText,
  LogOut,
  User as UserIcon,
  LogIn,
  AlertTriangle,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Star,
  StarOff,
  Globe,
  PanelTop,
  Plus,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays } from 'date-fns';
import { Category, Task } from './types';
import { cn, formatDate } from './lib/utils';
import { auth, db, signIn, logOut } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Papa from 'papaparse';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  addDoc,
  getDocs,
  getDoc,
  writeBatch
} from 'firebase/firestore';

// Add types for File System Access API
declare global {
  interface Window {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const THEME_CATEGORIES = [
  { id: 'Urgent', label: 'Urgent', icon: Zap, color: 'bg-red-50/50 border-red-100', accent: 'bg-red-500', text: 'text-red-700', badge: 'text-red-400 border-red-100', desc: '3 Slots' },
  { id: 'Focus', label: 'Focus', icon: Target, color: 'bg-indigo-50/50 border-indigo-100', accent: 'bg-indigo-500', text: 'text-indigo-700', badge: 'text-indigo-500', desc: 'Main' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskUrls, setNewTaskUrls] = useState<string[]>(['']);
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>('');
  const [newTaskUrl, setNewTaskUrl] = useState(''); // Compatibility check if still used in layout
  const [isPickingDaily, setIsPickingDaily] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'archive' | 'settings' | 'trash'>('dashboard');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'info' } | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>('General');
  const [mobileView, setMobileView] = useState<'summary' | 'urgent' | 'focus' | 'archive' | 'settings'>('summary');

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);

  useEffect(() => {
    if (message && message.type !== 'error') {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const [settings, setSettings] = useState({
    urgentLimit: 3,
    deadlineThreshold: 3,
    archiveThresholdDays: 30,
    criticalThreshold: 100,
    isLocalBackupEnabled: false,
    localBackupPath: '',
    displayMode: 'card' as 'card' | 'list',
    sections: []
  });

  const handleFirestoreError = (err: unknown, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: err instanceof Error ? err.message : String(err),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    
    if (errInfo.error.includes('permissions') || errInfo.error.includes('permission')) {
      setMessage({ 
        text: `Permission Denied: Ensure you are logged in and rules are deployed. Details: ${errInfo.error}`, 
        type: 'error' 
      });
    } else {
      setMessage({ text: `Database Error: ${errInfo.error}`, type: 'error' });
    }
    
    throw new Error(JSON.stringify(errInfo));
  };

  // Browser Exit Confirmation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only show confirmation if no backup path is set
      if (!dirHandle) {
        const msg = "Local backup folder is not configured. Please set a backup path in Settings to ensure your logs are saved locally.";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirHandle]);

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Settings Sync
  useEffect(() => {
    if (!user) return;

    const settingsRef = doc(db, 'settings', user.uid);
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const loadedSections = (data.sections && data.sections.length > 0) ? data.sections : ['General'];
        setSettings({
          urgentLimit: data.urgentLimit || 3,
          deadlineThreshold: data.deadlineThreshold || 3,
          archiveThresholdDays: data.archiveThresholdDays || 30,
          criticalThreshold: data.criticalThreshold || 100,
          isLocalBackupEnabled: data.isLocalBackupEnabled || false,
          localBackupPath: data.localBackupPath || '',
          displayMode: data.displayMode || 'card',
          sections: loadedSections
        });
        
        // Ensure activeSection is valid
        setActiveSection(prev => {
          if (!prev || !loadedSections.includes(prev)) {
            return loadedSections[0];
          }
          return prev;
        });
      } else {
        // Init default settings for new user
        setDoc(settingsRef, {
          userId: user.uid,
          urgentLimit: 3,
          deadlineThreshold: 3,
          archiveThresholdDays: 30,
          criticalThreshold: 100,
          isLocalBackupEnabled: false,
          localBackupPath: '',
          displayMode: 'card',
          sections: ['General']
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `settings/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `settings/${user.uid}`));

    return () => unsubscribe();
  }, [user]);

  // Tasks Sync
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const taskList: Task[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.userId === user.uid) {
          taskList.push({ id: doc.id, ...data } as Task);
        }
      });
      setTasks(taskList);
    }, (err) => {
      console.warn("Tasks listener notice:", err.message);
    });

    return () => unsubscribe();
  }, [user, settings.archiveThresholdDays]);

  // Migration Helper
  useEffect(() => {
    if (!user || authLoading) return;

    const migrate = async () => {
      const savedTasks = localStorage.getItem('focusflow_tasks');
      const savedSettings = localStorage.getItem('focusflow_settings');

      if (savedTasks || savedSettings) {
        const hasData = await getDocs(query(collection(db, 'tasks'), where('userId', '==', user.uid)));
        if (hasData.empty) {
          // Trigger migration
          if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            await setDoc(doc(db, 'settings', user.uid), {
              userId: user.uid,
              ...parsed
            }).catch(e => console.error("Migration settings error", e));
          }

          if (savedTasks) {
            const parsed = JSON.parse(savedTasks);
            const batch = writeBatch(db);
            parsed.forEach((t: any) => {
              const newRef = doc(collection(db, 'tasks'));
              batch.set(newRef, {
                ...t,
                userId: user.uid,
                createdAt: Number(t.createdAt) || Date.now(),
                updatedAt: Number(t.updatedAt) || Date.now(),
              });
            });
            await batch.commit().catch(e => console.error("Migration tasks error", e));
          }
          
          // Clear local storage after migration
          localStorage.removeItem('focusflow_tasks');
          localStorage.removeItem('focusflow_settings');
          setMessage({ text: "Local data has been migrated to the cloud.", type: 'info' });
        }
      }
    };

    migrate();
  }, [user, authLoading]);

  // Save Settings wrapper
  const saveSettings = async (updates: Partial<typeof settings>) => {
    if (!user) return;
    
    setSettings(prev => {
      const next = { ...prev, ...updates };

      // If sync is disabled, clear the directory handle and local path inside the update logic
      if ('isLocalBackupEnabled' in updates && !updates.isLocalBackupEnabled) {
        setDirHandle(null);
      }

      // Trigger Firestore update with the most current state
      setDoc(doc(db, 'settings', user.uid), {
        userId: user.uid,
        ...next
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `settings/${user.uid}`));
      return next;
    });
  };

  const isListMode = settings.displayMode === 'list';

  const projects = useMemo(() => {
    const sectionTasks = tasks.filter(t => t.section === activeSection || (!t.section && activeSection === settings.sections[0]));
    const p = Array.from(new Set(sectionTasks.map(t => t.project)));
    return ['All', ...p];
  }, [tasks, activeSection, settings.sections]);

  const stats = useMemo(() => {
    const activeTasks = tasks.filter(t => t.category !== 'Archive' && !t.isDone);
    const focusTasksCount = tasks.filter(t => t.category === 'Focus' && !t.isDone).length;
    const urgentCount = tasks.filter(t => t.category === 'Urgent').length;
    
    // Per-section metrics
    const sectionMetrics = settings.sections.reduce((acc, sec, idx) => {
      acc[sec] = {
        focus: tasks.filter(t => (t.section === sec || (!t.section && idx === 0)) && t.category === 'Focus' && !t.isDone).length,
        total: tasks.filter(t => (t.section === sec || (!t.section && idx === 0)) && !t.isDone).length
      };
      return acc;
    }, {} as Record<string, { focus: number, total: number }>);
    
    const warningThreshold = Math.floor(settings.criticalThreshold * 0.7);
    let gaugeColor = 'bg-indigo-400';
    let textColor = 'text-white';
    
    if (focusTasksCount >= settings.criticalThreshold) {
      gaugeColor = 'bg-red-600';
      textColor = 'text-red-500 font-black';
    } else if (focusTasksCount >= warningThreshold) {
      gaugeColor = 'bg-orange-400';
      textColor = 'text-orange-400 font-black';
    }

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const doneTodayCount = tasks.filter(t => t.isDone && t.updatedAt >= todayStart.getTime()).length;
    const pendingDeadlinesCount = tasks.filter(t => t.category === 'Focus' && !t.isDone && t.deadline && (t.deadline - now <= settings.deadlineThreshold * 86400000)).length;

    const loadPercentage = Math.round(Math.min((focusTasksCount / settings.criticalThreshold) * 100, 100));

    return {
      active: activeTasks.length,
      doneToday: doneTodayCount,
      pendingDeadlines: pendingDeadlinesCount,
      urgentCount,
      focusTasksCount,
      gaugeColor,
      textColor,
      warningThreshold,
      sectionMetrics,
      morningRoutineReady: urgentCount >= settings.urgentLimit,
      loadPercentage
    };
  }, [tasks, settings, activeSection]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             t.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesProject = selectedProject === 'All' || t.project === selectedProject;
        const matchesSection = t.section === activeSection || (!t.section && activeSection === settings.sections[0]);
        return matchesSearch && matchesProject && matchesSection;
      })
      .sort((a, b) => {
        const now = Date.now();
        const threshold = (settings.deadlineThreshold || 3) * 24 * 60 * 60 * 1000;
        
        // Priority 1: Near Deadline (Focused items only)
        if (a.category === 'Focus' && b.category === 'Focus') {
          const aNear = a.deadline && (a.deadline - now) <= threshold && !a.isDone;
          const bNear = b.deadline && (b.deadline - now) <= threshold && !b.isDone;
          if (aNear && !bNear) return -1;
          if (!aNear && bNear) return 1;
          if (aNear && bNear) return (a.deadline || 0) - (b.deadline || 0);
        }

        // Priority 2: Starred
        const starA = !!a.isStarred;
        const starB = !!b.isStarred;
        if (starA !== starB) return starA ? -1 : 1;
        
        // Priority 3: Deadlines in general
        if (a.deadline && b.deadline) return a.deadline - b.deadline;
        if (a.deadline) return -1;
        if (b.deadline) return 1;

        // Priority 4: Recency (Updated at descending)
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }, [tasks, searchTerm, selectedProject, activeSection, settings.deadlineThreshold]);

  const groupedFocusTasks = useMemo(() => {
    const focusTasks = filteredTasks.filter(t => t.category === 'Focus');
    const threshold = (settings.deadlineThreshold || 3) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Separate near deadline tasks (excluding expired ones) and sort by date
    const nearDeadline = focusTasks
      .filter(t => t.deadline && (t.deadline - now) <= threshold && (t.deadline - now) >= 0 && !t.isDone)
      .sort((a, b) => (a.deadline || 0) - (b.deadline || 0));
      
    // Others includes those without deadlines, far deadlines, or expired deadlines
    const others = focusTasks.filter(t => !t.deadline || (t.deadline - now) > threshold || (t.deadline - now) < 0 || t.isDone);

    const grouped: Record<string, Task[]> = {};
    others.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return { nearDeadline, grouped };
  }, [filteredTasks, settings.deadlineThreshold]);

  const groupedArchiveTasks = useMemo(() => {
    const archiveTasks = filteredTasks.filter(t => t.category === 'Archive');
    const grouped: Record<string, Task[]> = {};
    archiveTasks.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return grouped;
  }, [filteredTasks]);

  const groupedTrashTasks = useMemo(() => {
    const trashTasks = filteredTasks.filter(t => t.category === 'Trash');
    const grouped: Record<string, Task[]> = {};
    trashTasks.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return grouped;
  }, [filteredTasks]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskProject.trim() || !user) return;
    
    const newTask: any = {
      userId: user.uid,
      title: newTaskTitle.trim(),
      project: newTaskProject.trim(),
      notes: newTaskNotes.trim(),
      urls: newTaskUrls.filter(u => u.trim() !== ''),
      section: activeSection,
      category: 'Focus' as Category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDone: false,
      isStarred: false
    };

    if (newTaskDeadline) {
      const deadlineTimestamp = new Date(newTaskDeadline).getTime();
      if (!isNaN(deadlineTimestamp)) {
        newTask.deadline = deadlineTimestamp;
      }
    }

    try {
      await addDoc(collection(db, 'tasks'), newTask);
      setNewTaskTitle('');
      setNewTaskProject('');
      setNewTaskNotes('');
      setNewTaskUrls(['']);
      setNewTaskDeadline('');
      setMessage({ text: "Task added to Focus list.", type: 'info' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tasks');
    }
  };

  const moveTask = async (id: string, newCategory: Category) => {
    if (!user) return;
    if (newCategory === 'Urgent') {
      const isAlreadyUrgent = tasks.find(t => t.id === id)?.category === 'Urgent';
      if (!isAlreadyUrgent) {
        const urgentCount = tasks.filter(t => t.category === 'Urgent').length;
        if (urgentCount >= settings.urgentLimit) {
          setMessage({ 
            text: `Urgent Capacity Full: You have reached the ${settings.urgentLimit} task limit. Complete or archive an existing task first.`,
            type: 'error'
          });
          return;
        }
      }
    }
    try {
      await updateDoc(doc(db, 'tasks', id), { 
        category: newCategory, 
        updatedAt: Date.now() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'tasks', id), { 
        ...updates, 
        updatedAt: Date.now() 
      });
      setEditingTask(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const toggleDone = async (id: string) => {
    if (!user) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      await updateDoc(doc(db, 'tasks', id), { 
        isDone: !task.isDone, 
        updatedAt: Date.now() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const deleteTask = async (id: string) => {
    if (!user) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.category === 'Trash') {
      // If already in trash, perm delete
      try {
        await deleteDoc(doc(db, 'tasks', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
      }
    } else {
      // Move to trash
      try {
        await updateDoc(doc(db, 'tasks', id), { 
          category: 'Trash', 
          updatedAt: Date.now() 
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
      }
    }
  };

  const toggleStar = async (id: string) => {
    if (!user) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      await updateDoc(doc(db, 'tasks', id), { 
        isStarred: !task.isStarred, 
        updatedAt: Date.now() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const addSection = async (name: string) => {
    if (!user || !name.trim()) return;
    const next = [...settings.sections, name.trim()];
    try {
      await updateDoc(doc(db, 'settings', user.uid), { sections: next });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `settings/${user.uid}`);
    }
  };

  const renameSection = async (oldName: string, newName: string) => {
    if (!user || !newName.trim()) return;
    const next = settings.sections.map(s => s === oldName ? newName.trim() : s);
    try {
      // 1. Update settings
      await updateDoc(doc(db, 'settings', user.uid), { sections: next });
      
      // 2. Update all tasks in this section
      const batch = writeBatch(db);
      const affectedTasks = tasks.filter(t => t.section === oldName);
      affectedTasks.forEach(t => {
        batch.update(doc(db, 'tasks', t.id), { section: newName.trim() });
      });
      await batch.commit();

      if (activeSection === oldName) setActiveSection(newName.trim());
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `settings/${user.uid}`);
    }
  };

  const deleteSection = async (name: string) => {
    if (!user) return;
    if (settings.sections.length <= 1) {
      setMessage({ text: "Cannot delete the last workspace. Please add another one first.", type: 'error' });
      return;
    }
    if (!window.confirm(`Delete workspace "${name}" and ALL tasks within it? This cannot be undone.`)) return;

    const next = settings.sections.filter(s => s !== name);
    try {
      // 1. Update settings
      await updateDoc(doc(db, 'settings', user.uid), { sections: next });
      
      // 2. Delete all tasks in this section
      const batch = writeBatch(db);
      const affectedTasks = tasks.filter(t => t.section === name);
      affectedTasks.forEach(t => {
        batch.delete(doc(db, 'tasks', t.id));
      });
      await batch.commit();

      if (activeSection === name) setActiveSection(next[0]);
      setMessage({ text: `Workspace "${name}" and ${affectedTasks.length} tasks deleted.`, type: 'info' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `settings/${user.uid}`);
    }
  };

  const permanentlyDeleteTask = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
    }
  };

  const emptyTrash = async () => {
    if (!user) return;
    const trashTasks = tasks.filter(t => t.category === 'Trash');
    if (trashTasks.length === 0) return;

    if (!window.confirm(`Permanently delete all ${trashTasks.length} items in the trash? This cannot be undone.`)) return;

    try {
      const batch = writeBatch(db);
      trashTasks.forEach(t => {
        batch.delete(doc(db, 'tasks', t.id));
      });
      await batch.commit();
      setMessage({ text: `${trashTasks.length} items permanently deleted.`, type: 'info' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'batch/empty-trash');
    }
  };

  const pickDailyTasks = async (selectedIds: string[]) => {
    if (!user) return;
    const currentUrgentCount = tasks.filter(t => t.category === 'Urgent').length;
    if (currentUrgentCount + selectedIds.length > settings.urgentLimit) {
      setMessage({ 
        text: `Daily Pick Violation: This batch would exceed the ${settings.urgentLimit} slot limit.`,
        type: 'error'
      });
      return;
    }

    try {
      const batch = writeBatch(db);
      const now = Date.now();
      selectedIds.forEach(id => {
        batch.update(doc(db, 'tasks', id), { 
          category: 'Urgent', 
          updatedAt: now 
        });
      });
      await batch.commit();
      setIsPickingDaily(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'batch/tasks');
    }
  };

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (err) {
      setMessage({ text: "Sign in failed.", type: 'error' });
    }
  };

  const getCSVData = () => {
    const headers = ['ID', 'Category', 'Workspace', 'Project', 'Title', 'Notes', 'URLs', 'IsDone', 'IsStarred', 'Deadline', 'CreatedAt', 'UpdatedAt', 'UserID'];
    const rows = tasks.map(t => [
      t.id,
      t.category,
      t.section || settings.sections[0] || 'General',
      t.project,
      t.title,
      t.notes || '',
      (t.urls || []).join('; '),
      t.isDone ? 'Yes' : 'No',
      t.isStarred ? 'Yes' : 'No',
      t.deadline ? new Date(t.deadline).toISOString() : '',
      new Date(t.createdAt).toISOString(),
      new Date(t.updatedAt).toISOString(),
      t.userId || 'N/A'
    ]);

    const quote = (val: string) => `"${val.toString().replace(/"/g, '""')}"`;

    return [
      headers.map(quote).join(','),
      ...rows.map(r => r.map(quote).join(','))
    ].join('\n');
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.replace(/^["']|["']$/g, '').trim().toLowerCase(),
      complete: async (results) => {
        try {
          if (results.errors.length > 0) {
            console.error('PapaParse Errors:', results.errors);
          }

          const batch = writeBatch(db);
          let count = 0;
          const foundWorkspaces = new Set<string>();

          for (const row of results.data as any[]) {
            // Helper to get value by case-insensitive key
            const getVal = (key: string) => {
              const val = row[key.toLowerCase()];
              if (val === undefined || val === null) return '';
              return val.toString().replace(/^["']|["']$/g, '').replace(/""/g, '"').trim();
            };

            const title = getVal('title');
            if (!title) continue;

            const sectionName = getVal('workspace') || getVal('section') || settings.sections[0] || 'General';
            foundWorkspaces.add(sectionName);

            const taskData: any = {
              userId: user.uid,
              category: (getVal('category') as Category) || 'Focus',
              section: sectionName,
              project: getVal('project') || 'Imported',
              title,
              notes: getVal('notes'),
              urls: getVal('urls') ? getVal('urls').split(';').map(u => u.trim()).filter(Boolean) : [],
              isDone: getVal('isdone').toLowerCase() === 'yes',
              isStarred: getVal('isstarred').toLowerCase() === 'yes',
              createdAt: (() => {
                const val = getVal('createdat');
                const t = val ? new Date(val).getTime() : Date.now();
                return isNaN(t) ? Date.now() : t;
              })(),
              updatedAt: (() => {
                const val = getVal('updatedat');
                const t = val ? new Date(val).getTime() : Date.now();
                return isNaN(t) ? Date.now() : t;
              })(),
            };

            const d = getVal('deadline');
            if (d) {
              const t = new Date(d).getTime();
              if (!isNaN(t)) {
                taskData.deadline = t;
              }
            }

            const newTaskRef = doc(collection(db, 'tasks'));
            batch.set(newTaskRef, taskData);
            count++;

            if (count >= 499) break;
          }

          if (count === 0) {
            setMessage({ text: "No valid tasks were found in the CSV. Please check the column headers.", type: 'error' });
            return;
          }

          // Update settings with new workspaces if any
          const missingWorkspaces = Array.from(foundWorkspaces).filter(s => s && !settings.sections.includes(s));
          if (missingWorkspaces.length > 0) {
            const updatedSections = [...settings.sections, ...missingWorkspaces];
            await updateDoc(doc(db, 'settings', user.uid), { sections: updatedSections });
          }

          await batch.commit();
          setMessage({ text: `Successfully imported ${count} tasks.`, type: 'info' });
          e.target.value = '';
        } catch (err) {
          console.error('Import processing error:', err);
          setMessage({ text: `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
        }
      },
      error: (err) => {
        setMessage({ text: `CSV Parse Error: ${err.message}`, type: 'error' });
      }
    });
  };

  const selectBackupFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        setMessage({ 
          text: "Your browser does not support the File System Access API. Please use a Chromium-based browser (Chrome, Edge) on Desktop.",
          type: 'error'
        });
        return;
      }
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      setDirHandle(handle);
      
      await saveSettings({ 
        localBackupPath: handle.name, 
        isLocalBackupEnabled: true 
      });
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.message?.includes('Cross origin sub frames')) {
        setMessage({ 
          text: "Security Restriction: Local folder access is blocked in the preview window. Please click 'Open in New Tab' to use this feature.",
          type: 'error'
        });
      } else if (err.name !== 'AbortError') {
        setMessage({ text: `Folder selection failed: ${err.message}`, type: 'error' });
      }
    }
  };

  const syncToLocalSystem = async (manual = false) => {
    if (!settings.isLocalBackupEnabled || tasks.length === 0 || !dirHandle) return;

    setIsSyncing(true);
    try {
      const csvContent = getCSVData();
      const fileName = `TriFocus_Log_${user?.email?.split('@')[0] || 'local'}.csv`;
      
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(csvContent);
      await writable.close();
      
      setLastSyncTime(Date.now());
      if (manual) setMessage({ text: "Log saved to selected folder.", type: 'info' });
    } catch (err: any) {
      console.error("Local backup failed", err);
      setMessage({ 
        text: `Local Backup Error: ${err.message}. You may need to grant permission again.`,
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync effect
  useEffect(() => {
    if (settings.isLocalBackupEnabled && tasks.length > 0 && dirHandle) {
      const timer = setTimeout(() => {
        syncToLocalSystem();
      }, 5000); // 5s debounce
      return () => clearTimeout(timer);
    }
  }, [tasks, settings.isLocalBackupEnabled, dirHandle]);

  // Trash Auto-Cleanup Effect (30 days)
  useEffect(() => {
    if (!user || tasks.length === 0) return;

    const cleanupTrash = async () => {
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const expiredTrash = tasks.filter(t => t.category === 'Trash' && (now - t.updatedAt) > thirtyDaysMs);
      
      if (expiredTrash.length > 0) {
        try {
          const batch = writeBatch(db);
          expiredTrash.forEach(t => {
            batch.delete(doc(db, 'tasks', t.id));
          });
          await batch.commit();
          console.log(`Auto-cleaned ${expiredTrash.length} expired trash items.`);
        } catch (err) {
          console.error("Auto-cleanup trash failed", err);
        }
      }
    };

    const timer = setTimeout(cleanupTrash, 10000); // Run once shortly after load
    return () => clearTimeout(timer);
  }, [user, tasks]);

  const cleanupArchive = async (thresholdDays?: number) => {
    if (!user) return;
    try {
      const now = Date.now();
      const cutoff = thresholdDays ? now - (thresholdDays * 24 * 60 * 60 * 1000) : null;
      
      const archiveTasks = tasks.filter(t => {
        if (t.category !== 'Archive') return false;
        if (!cutoff) return true; // Delete all
        return t.updatedAt < cutoff;
      });

      if (archiveTasks.length === 0) {
        setMessage({ text: "No tasks match the cleanup criteria.", type: 'info' });
        return;
      }

      if (!window.confirm(`Are you sure you want to move ${archiveTasks.length} archived tasks to the Trash?`)) return;

      const batch = writeBatch(db);
      archiveTasks.forEach(task => {
        batch.update(doc(db, 'tasks', task.id), {
          category: 'Trash',
          updatedAt: now
        });
      });
      await batch.commit();
      setMessage({ text: `Archive Updated: Moved ${archiveTasks.length} entries to Trash.`, type: 'info' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'batch/cleanup-archive');
    }
  };

  const purgeAllData = async () => {
    if (!user) return;
    if (!window.confirm("CRITICAL: FULL CLOUD PURGE. This will try to delete EVERY task in the 'tasks' collection for your ID. Proceed?")) return;

    try {
      setMessage({ text: "Purge started. Clearing cloud data...", type: 'info' });
      
      const snap = await getDocs(query(collection(db, 'tasks'), where('userId', '==', user.uid)));
      
      let successCount = 0;
      let failCount = 0;

      for (const d of snap.docs) {
        try {
          await deleteDoc(d.ref);
          successCount++;
        } catch (err) {
          console.error(`Failed to delete doc ${d.id}:`, err);
          failCount++;
        }
      }

      localStorage.clear();
      sessionStorage.clear();
      
      setMessage({ text: `Purge ended: ${successCount} deleted, ${failCount} failed. Resetting local cache...`, type: 'info' });
      
      setTimeout(async () => {
        const { clearFirestoreCache } = await import('./lib/firebase');
        await clearFirestoreCache();
        window.location.reload();
      }, 3000);
      
    } catch (err: any) {
      console.error("Purge Error:", err);
      setMessage({ text: `Purge Error: ${err.message}`, type: 'error' });
    }
  };

  const forceResetSettings = async () => {
    if (!user) return;
    if (!window.confirm("CRITICAL: SETTINGS RESET. This will delete your custom workspaces and system preferences, returning the app to factory defaults. Your tasks will NOT be deleted. Proceed?")) return;

    try {
      setMessage({ text: "Resetting settings document...", type: 'info' });
      await deleteDoc(doc(db, 'settings', user.uid));
      localStorage.clear();
      sessionStorage.clear();
      
      setTimeout(async () => {
        const { clearFirestoreCache } = await import('./lib/firebase');
        await clearFirestoreCache();
        window.location.reload();
      }, 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `settings/${user.uid}`);
    }
  };

  const exportTasks = () => {
    try {
      const csvContent = getCSVData();

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `TaskManager_Export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage({ text: 'Export Failed: An error occurred while generating the CSV.', type: 'error' });
    }
  };

  const toggleProjectCollapse = (project: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  return (
    <div className="h-screen w-full bg-[#f8fafc] text-slate-800 flex flex-col font-sans overflow-hidden">
      {/* Toast Messages */}
      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={cn(
              "fixed bottom-12 left-1/2 z-[100] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px] max-w-md transition-colors",
              message.type === 'error' ? "bg-red-600" : "bg-indigo-600 shadow-indigo-200/50"
            )}
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              {message.type === 'error' ? <Zap size={20} className="text-white fill-white" /> : <CheckCircle2 size={20} className="text-white" />}
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-0.5">
                {message.type === 'error' ? 'System Exception' : 'Notification'}
              </p>
              <p className="text-sm font-bold leading-tight">{message.text}</p>
              {message.text.toLowerCase().includes("open in new tab") && (
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="mt-2 px-3 py-1 bg-white text-indigo-600 text-[10px] font-black uppercase rounded shadow-sm hover:bg-slate-50 transition-all font-mono"
                >
                  Open in New Tab
                </button>
              )}
            </div>
            <button onClick={() => setMessage(null)} className="p-1 hover:bg-white/10 rounded">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Navigation */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="relative">
            <button 
              onClick={() => setShowSectionMenu(!showSectionMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer group"
            >
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center transition-transform shadow-lg shadow-indigo-100 group-active:scale-95 overflow-hidden border border-slate-100">
                <img src="/trifocus_icon.png" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <div className="flex flex-col items-start leading-none">
                <h1 className="text-sm font-black tracking-tighter text-slate-800 uppercase">
                  TriFocus <span className="text-indigo-600">v2.2</span>
                </h1>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-0.5">
                  <span className="truncate max-w-[80px]">{activeSection}</span> <ChevronDown size={10} className={cn("transition-transform", showSectionMenu && "rotate-180")} />
                </p>
              </div>
            </button>
            {showSectionMenu && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => setShowSectionMenu(false)} />
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[60] py-2 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Workspaces</p>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const name = window.prompt("New Workspace Name?");
                        if (name) addSection(name);
                        setShowSectionMenu(false);
                      }}
                      className="text-indigo-600 hover:text-indigo-700 p-1 bg-white rounded-lg border border-indigo-100 shadow-sm"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                    {settings.sections.map(s => (
                      <div key={s} className="group/item flex items-center border-b border-slate-50 last:border-0">
                        <button 
                          onClick={() => {
                            setActiveSection(s);
                            setShowSectionMenu(false);
                          }}
                          className={cn(
                            "flex-1 text-left px-4 py-3.5 text-xs font-bold transition-all flex items-center justify-between",
                            activeSection === s ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <span className="flex items-center gap-2">
                             <div className={cn("w-1.5 h-1.5 rounded-full", activeSection === s ? "bg-indigo-500" : "bg-slate-200")} />
                             {s}
                          </span>
                          {activeSection === s && <CheckCircle2 size={12} />}
                        </button>
                        <div className="flex px-2 md:opacity-0 group-hover/item:opacity-100 transition-opacity gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const name = window.prompt("Rename Workspace?", s);
                              if (name) renameSection(s, name);
                            }}
                            className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-slate-300 rounded"
                          >
                            <SettingsIcon size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSection(s);
                              if (activeSection === s) setShowSectionMenu(false);
                            }}
                            className="p-1.5 hover:bg-red-50 hover:text-red-600 text-slate-300 rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <nav className="hidden lg:flex gap-6 text-sm font-medium text-slate-500">
            <button 
              onClick={() => { setViewMode('dashboard'); setMobileView('summary'); }}
              className={cn("pb-4 -mb-4 transition-colors", viewMode === 'dashboard' ? "text-indigo-600 border-b-2 border-indigo-600" : "hover:text-slate-800")}
            >
              Dashboard
            </button>
            <button 
              onClick={() => { setViewMode('archive'); setMobileView('archive'); }}
              className={cn("pb-4 -mb-4 transition-colors", viewMode === 'archive' ? "text-indigo-600 border-b-2 border-indigo-600" : "hover:text-slate-800")}
            >
              Archive
            </button>
            <button 
              onClick={() => { setViewMode('trash'); setMobileView('archive'); }}
              className={cn("pb-4 -mb-4 transition-colors uppercase text-[10px] font-black tracking-widest", viewMode === 'trash' ? "text-red-600 border-b-2 border-red-600" : "hover:text-slate-800")}
            >
              Trash
            </button>
            <button 
              onClick={() => { setViewMode('settings'); setMobileView('settings'); }}
              className={cn("pb-4 -mb-4 transition-colors", viewMode === 'settings' ? "text-indigo-600 border-b-2 border-indigo-600" : "hover:text-slate-800")}
            >
              Settings
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 mr-2">
            <div className="relative">
              <button 
                onClick={() => {
                  if (!dirHandle) {
                    selectBackupFolder();
                  } else {
                    syncToLocalSystem(true);
                    setShowSyncDetails(!showSyncDetails);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all",
                  dirHandle ? "bg-emerald-50 border-emerald-100" : "bg-slate-50/50 border-slate-100 hover:bg-white"
                )}
              >
                <Globe size={12} className={cn(isSyncing ? "text-indigo-500 animate-spin" : (dirHandle ? "text-emerald-500" : "text-slate-300"))} />
                <span className={cn("text-[10px] font-bold uppercase tracking-tighter", dirHandle ? "text-emerald-600" : "text-slate-500")}>
                  {isSyncing ? 'Syncing...' : (dirHandle ? 'Sync Active' : 'Sync Off')}
                </span>
              </button>
              
              {showSyncDetails && dirHandle && (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => setShowSyncDetails(false)} />
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[60] p-4">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-50">
                      <div className="flex items-center gap-2 text-slate-800">
                        <Activity size={12} className="text-indigo-500" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Automated Sync Status</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); syncToLocalSystem(true); }}
                        className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-indigo-600"
                        title="Force Backup Now"
                        disabled={isSyncing}
                      >
                        <RefreshCcw size={12} className={cn(isSyncing && "animate-spin")} />
                      </button>
                    </div>
                    <div className="space-y-3">
                       <div className="bg-slate-50 rounded-lg p-2.5">
                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Local Directory Path</label>
                        <p className="text-[10px] font-mono break-all text-slate-600 leading-tight">
                          {settings.localBackupPath || 'Authorized Local Folder'}
                        </p>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                        <span>Last Successful Log:</span>
                        <span className="text-slate-900 border-b border-indigo-100">
                          {lastSyncTime ? format(lastSyncTime, 'HH:mm:ss') : 'Waiting...'}
                        </span>
                      </div>
                      {isSyncing && (
                        <div className="flex items-center gap-1 text-[9px] text-indigo-600 font-bold animate-pulse">
                          <RefreshCcw size={10} className="animate-spin" /> Committing changes to local disk...
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {user ? (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="text-right flex flex-col items-end leading-none hidden sm:flex">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500/50 mb-0.5">Authenticated</span>
                <span className="text-xs font-bold text-slate-700">{user.displayName || user.email?.split('@')[0]}</span>
              </div>
              <div className="w-9 h-9 rounded-xl overflow-hidden border-2 border-white shadow-xl shadow-indigo-100/50 bg-indigo-50 flex items-center justify-center text-indigo-400 shrink-0">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={18} />
                )}
              </div>
              <button 
                onClick={logOut}
                className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-all group shrink-0"
                title="Log Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => handleSignIn()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <LogIn size={16} />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-12 gap-6 min-h-0 overflow-hidden relative">
        {/* Mobile Navigation (Bottom) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 z-[70] flex items-center justify-around px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <button 
            onClick={() => { setViewMode('dashboard'); setMobileView('summary'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'dashboard' && mobileView === 'summary' ? "text-indigo-600" : "text-slate-400")}
          >
            <Plus size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Entry</span>
          </button>
          <button 
            onClick={() => { setViewMode('dashboard'); setMobileView('urgent'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'dashboard' && mobileView === 'urgent' ? "text-red-500" : "text-slate-400")}
          >
            <Zap size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Urgent</span>
          </button>
          <button 
            onClick={() => { setViewMode('dashboard'); setMobileView('focus'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'dashboard' && mobileView === 'focus' ? "text-indigo-600" : "text-slate-400")}
          >
            <Target size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Focus</span>
          </button>
          <button 
            onClick={() => { setViewMode('archive'); setMobileView('archive'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'archive' ? "text-indigo-600" : "text-slate-400")}
          >
            <ArchiveIcon size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Arch</span>
          </button>
          <button 
            onClick={() => { setViewMode('settings'); setMobileView('settings'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'settings' ? "text-indigo-600" : "text-slate-400")}
          >
            <SettingsIcon size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Set</span>
          </button>
        </div>

        {/* Sidebar / Input Section */}
        <aside className={cn(
          "col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar pb-20 lg:pb-0",
          (viewMode !== 'dashboard' || mobileView !== 'summary') && "hidden lg:flex"
        )}>
          {!user ? (
            <div className="bg-indigo-600 rounded-2xl p-8 text-white flex flex-col items-center text-center gap-6 shadow-xl shadow-indigo-100">
              <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center">
                <Target size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Sync to Cloud</h3>
                <p className="text-sm opacity-80 leading-relaxed">Sign in to securely access your TriFocus system across all devices with real-time sync.</p>
              </div>
              <button 
                onClick={() => handleSignIn()}
                className="w-full py-4 bg-white text-indigo-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                <LogIn size={18} />
                Continue with Google
              </button>
            </div>
          ) : (
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none" 
                    placeholder="Details... (Cmd/Ctrl+Enter to save)"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest text-[9px] opacity-60">Memos (Optional)</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-16 resize-none" 
                    placeholder="Context, sub-tasks... (Cmd/Ctrl+Enter to save)"
                    value={newTaskNotes}
                    onChange={(e) => setNewTaskNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest opacity-60"><LinkIcon size={12} /> URLs</span>
                    <button type="button" onClick={() => setNewTaskUrls([...newTaskUrls, ''])} className="text-[9px] text-indigo-600 hover:underline">+ Add</button>
                  </label>
                  {newTaskUrls.map((u, i) => (
                    <div key={i} className="flex gap-1">
                      <input 
                        type="url"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="https://... (Cmd/Ctrl+Enter to save)"
                        value={u}
                        onChange={(e) => {
                          const next = [...newTaskUrls];
                          next[i] = e.target.value;
                          setNewTaskUrls(next);
                        }}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 uppercase tracking-widest text-[9px] opacity-60">
                    <Calendar size={12} className="text-slate-400" />
                    Deadline (Optional)
                  </label>
                  <input 
                    type="date"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-400 font-medium [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:invert-[0.2] [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
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
          )}

          <div className="bg-slate-800 text-slate-300 rounded-xl p-5 shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between">
              Workflow Health
              <Activity size={14} className="text-indigo-400" />
            </h2>
            <div className="space-y-4">
              <div className="space-y-2 pb-4 border-b border-slate-700/50">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-40">
                  <span>Global Load</span>
                  <span>{stats.focusTasksCount} / {settings.criticalThreshold}</span>
                </div>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all duration-1000", stats.gaugeColor)} 
                    style={{ width: `${stats.loadPercentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-2.5">
                {settings.sections.map(sec => (
                  <div key={sec} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className={cn(
                        "font-bold uppercase tracking-tight",
                        activeSection === sec ? "text-indigo-400" : "text-slate-500"
                      )}>
                        {sec}
                      </span>
                      <div className="flex gap-2 font-mono">
                        <span className="text-white">{stats.sectionMetrics[sec]?.focus || 0}</span>
                        <span className="opacity-30">/</span>
                        <span className="opacity-40">{stats.sectionMetrics[sec]?.total || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-700/50 flex justify-between items-start pt-3">
                <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-tighter text-slate-500">System State</p>
                  <p className={cn("text-[10px] font-bold uppercase leading-none flex items-baseline gap-1", stats.textColor)}>
                    <span>{stats.focusTasksCount >= settings.criticalThreshold ? 'CRITICAL LOAD' : stats.focusTasksCount >= stats.warningThreshold ? 'WARNING: HIGH LOAD' : 'SAFE CAPACITY'}</span>
                    <span className="text-[9px] opacity-70">({stats.loadPercentage}%)</span>
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <div className="flex flex-col items-end">
                    <p className="text-[9px] font-black uppercase tracking-tighter text-slate-500">Done Today</p>
                    <p className="text-[10px] font-bold text-emerald-400 font-mono">{stats.doneToday}</p>
                  </div>
                  {stats.pendingDeadlines > 0 && (
                    <div className="flex flex-col items-end">
                      <p className="text-[9px] font-black uppercase tracking-tighter text-red-500">Approaching</p>
                      <p className="text-[10px] font-bold text-red-500 font-mono">{stats.pendingDeadlines}</p>
                    </div>
                  )}
                </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full pb-20 lg:pb-0">
              {/* Urgent Column */}
              <section className={cn(
                "flex flex-col rounded-2xl border p-4 min-h-0 bg-red-50/50 border-red-100 transition-all",
                mobileView === 'urgent' ? "flex fixed inset-0 z-[50] bg-red-50 p-4 md:p-6 pt-16 md:pt-20" : "hidden lg:flex"
              )}>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="font-bold flex items-center gap-2 text-red-700">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-red-500"></span>
                    Urgent
                  </h3>
                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border uppercase text-red-400 border-red-100">
                    <span className="md:inline hidden">Slots: </span> {settings.urgentLimit}
                  </span>
                </div>
                
                <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar pb-24 lg:pb-10">
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
                          onStar={() => toggleStar(task.id)}
                          variant="Urgent"
                          displayMode={settings.displayMode}
                          deadlineThreshold={settings.deadlineThreshold}
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
              <section className={cn(
                "col-span-1 md:col-span-2 flex flex-col rounded-2xl border p-4 min-h-0 bg-indigo-50/50 border-indigo-100 transition-all",
                mobileView === 'focus' ? "flex fixed inset-0 z-[50] bg-indigo-50 p-4 md:p-6 pt-16 md:pt-20" : "hidden lg:flex"
              )}>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="font-bold flex items-center gap-2 text-indigo-700">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-indigo-500"></span>
                    Focus (Projected)
                  </h3>
                  <button 
                    onClick={() => setIsPickingDaily(true)}
                    className="text-[10px] font-bold text-indigo-500 uppercase tracking-tight hover:underline transition-all"
                  >
                    Extract &rarr;
                  </button>
                </div>
                
                <div className="flex-1 space-y-6 overflow-y-auto pr-1 custom-scrollbar pb-24 lg:pb-10">
                  {groupedFocusTasks.nearDeadline.length > 0 && (
                    <div className="space-y-2 mb-8">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 bg-red-50/50 px-2 py-1.5 rounded-lg border border-red-100 flex items-center gap-2">
                        <AlertTriangle size={12} strokeWidth={3} />
                        Approach Deadlines (Global)
                      </h4>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        !isListMode && "md:grid-cols-2"
                      )}>
                        <AnimatePresence mode="popLayout">
                          {groupedFocusTasks.nearDeadline.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              variant="Focus"
                              displayMode={settings.displayMode}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {Object.keys(groupedFocusTasks.grouped).length > 0 ? (
                    (Object.entries(groupedFocusTasks.grouped) as [string, Task[]][]).map(([project, tasks]) => {
                      const isCollapsed = collapsedProjects.has(project);
                      return (
                        <div key={project} className="space-y-2">
                          <button 
                            onClick={() => toggleProjectCollapse(project)}
                            className="w-full flex items-center gap-4 px-2 hover:opacity-70 transition-opacity"
                          >
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-white/50 px-2 py-0.5 rounded border border-slate-100 flex items-center gap-1.5">
                              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                              {project}
                            </h4>
                            <div className="h-px flex-1 bg-slate-200"></div>
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">
                              {tasks.length} item{tasks.length > 1 ? 's' : ''}
                            </span>
                          </button>
                          
                          {!isCollapsed && (
                            <div className={cn(
                              "grid grid-cols-1 gap-2.5",
                              !isListMode && "md:grid-cols-2"
                            )}>
                              <AnimatePresence mode="popLayout">
                                {tasks.map(task => (
                                  <TaskCard 
                                    key={task.id} 
                                    task={task} 
                                    onToggle={() => toggleDone(task.id)}
                                    onMove={(newCat) => moveTask(task.id, newCat)}
                                    onDelete={() => deleteTask(task.id)}
                                    onEdit={() => setEditingTask(task)}
                                    onStar={() => toggleStar(task.id)}
                                    variant="Focus"
                                    displayMode={settings.displayMode}
                                    deadlineThreshold={settings.deadlineThreshold}
                                  />
                                ))}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    groupedFocusTasks.nearDeadline.length === 0 && (
                      <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                        <Target size={48} strokeWidth={1} />
                        <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">No Focus Tasks</span>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>
          ) : viewMode === 'archive' ? (
            /* Archive Mode */
            <section className="flex flex-col rounded-2xl border p-4 min-h-0 bg-slate-50/50 border-slate-200 h-full overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 px-2 gap-4">
                <div>
                  <h3 className="font-bold flex items-center gap-2 text-slate-700 text-lg">
                    <ArchiveIcon size={22} className="text-slate-400" />
                    System Archive
                  </h3>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mt-1">
                    Reviewing items archived within {settings.archiveThresholdDays} days
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button 
                      onClick={() => setShowCleanupMenu(!showCleanupMenu)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-red-200 hover:text-red-500 transition-all shadow-sm"
                    >
                      <Trash2 size={12} />
                      Cleanup Options
                    </button>
                    {showCleanupMenu && (
                      <>
                        <div className="fixed inset-0 z-[75]" onClick={() => setShowCleanupMenu(false)} />
                        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 min-w-[200px] z-[80] transition-all">
                          <button 
                            onClick={(e) => { e.stopPropagation(); cleanupArchive(30); setShowCleanupMenu(false); }}
                            className="w-full text-left px-4 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-red-500 transition-colors flex flex-col"
                          >
                            <span>Older than 1 Month</span>
                            <span className="text-[9px] opacity-50 font-normal normal-case">Items inactive for 30+ days</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); cleanupArchive(7); setShowCleanupMenu(false); }}
                            className="w-full text-left px-4 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-red-500 transition-colors flex flex-col"
                          >
                            <span>Older than 1 Week</span>
                            <span className="text-[9px] opacity-50 font-normal normal-case">Items inactive for 7+ days</span>
                          </button>
                          <div className="h-px bg-slate-100 my-1 mx-2"></div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); cleanupArchive(); setShowCleanupMenu(false); }}
                            className="w-full text-left px-4 py-2 text-[10px] font-black text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                          >
                            <Zap size={10} strokeWidth={3} />
                            Purge All Archive
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 space-y-6 overflow-y-auto pr-1 custom-scrollbar pb-32">
                {Object.keys(groupedArchiveTasks).length > 0 ? (
                  (Object.entries(groupedArchiveTasks) as [string, Task[]][]).map(([project, tasks]) => (
                    <div key={project} className="space-y-3">
                      <div className="flex items-center gap-4 px-2">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-white/50 px-2 py-0.5 rounded border border-slate-100">
                          {project}
                        </h4>
                        <div className="h-px flex-1 bg-slate-200"></div>
                      </div>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        !isListMode && "md:grid-cols-3 xl:grid-cols-4"
                      )}>
                        <AnimatePresence mode="popLayout">
                          {tasks.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              variant="Archive"
                              displayMode={settings.displayMode}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                    <ArchiveIcon size={48} strokeWidth={1} />
                    <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">Archive Empty</span>
                  </div>
                )}
              </div>
            </section>
          ) : viewMode === 'trash' ? (
            /* Trash Mode */
            <section className="flex flex-col rounded-2xl border p-4 min-h-0 bg-red-50/30 border-red-100 h-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 px-2 gap-4">
                <div>
                  <h3 className="font-bold flex items-center gap-2 text-red-700 text-lg">
                    <Trash2 size={22} className="text-red-400" />
                    Trash Bin
                  </h3>
                  <p className="text-[10px] uppercase font-black tracking-widest text-red-400 mt-1">
                    Items will be permanently deleted after 30 days
                  </p>
                </div>
                
                <button 
                  onClick={emptyTrash}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 rounded-xl text-[10px] font-black text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm uppercase tracking-wider"
                >
                  <Zap size={12} />
                  Empty Trash
                </button>
              </div>
              
              <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar pb-40">
                {Object.keys(groupedTrashTasks).length > 0 ? (
                  (Object.entries(groupedTrashTasks) as [string, Task[]][]).map(([project, tasks]) => (
                    <div key={project} className="space-y-3">
                      <div className="flex items-center gap-4 px-2">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 bg-white/50 px-2 py-0.5 rounded border border-red-100">
                          {project}
                        </h4>
                        <div className="h-px flex-1 bg-red-100"></div>
                      </div>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        !isListMode && "md:grid-cols-3 xl:grid-cols-4"
                      )}>
                        <AnimatePresence mode="popLayout">
                          {tasks.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              variant="Trash"
                              displayMode={settings.displayMode}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                    <Trash2 size={48} strokeWidth={1} />
                    <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">Trash Bin is Empty</span>
                  </div>
                )}
              </div>
            </section>
          ) : (
            /* Settings Mode */
            <section className="flex flex-col rounded-2xl border p-4 md:p-8 min-h-0 bg-white border-slate-200 h-full overflow-hidden">
              <div className="max-w-2xl mx-auto w-full flex-1 overflow-y-auto custom-scrollbar pb-32">
                <div className="flex items-center gap-3 mb-10">
                  <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                    <SettingsIcon size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">System Preferences</h2>
                    <p className="text-sm text-slate-500">Tune your focus algorithms and capacity thresholds.</p>
                  </div>
                </div>

                <div className="space-y-8 md:space-y-12">
                   {/* Data Synchronization & Import */}
                  <div className="bg-slate-50 rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Download size={20} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Data Lifecycle</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-800 mb-1">Export Data</p>
                        <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-tighter">Backup to TriFocus CSV</p>
                        <button 
                          onClick={() => {
                            const blob = new Blob([getCSVData()], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `trifocus-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                            a.click();
                          }}
                          className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={14} /> Download CSV
                        </button>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-800 mb-1">Import Data</p>
                        <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-tighter">Restore from TriFocus CSV</p>
                        <label className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all cursor-pointer">
                          <Upload size={14} /> Import CSV
                          <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Account Information */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-4 text-slate-600">
                      <UserIcon size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Account Information</h3>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm bg-indigo-50 flex items-center justify-center text-indigo-400">
                          {user?.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <UserIcon size={24} />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 truncate max-w-[200px]">{user?.displayName || 'Personal Account'}</p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{user?.email || 'Not signed in'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col md:items-end gap-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border self-start md:self-auto",
                          user ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
                        )}>
                          {user ? 'Cloud Synced' : 'Local Only'}
                        </span>
                        {user && (
                          <button 
                            onClick={logOut}
                            className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1"
                          >
                            <LogOut size={10} /> Disconnect account
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

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
                          onClick={() => saveSettings({ ...settings, urgentLimit: Math.max(1, settings.urgentLimit - 1) })}
                          className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold shadow-sm"
                        >-</button>
                        <span className="w-10 text-center font-mono font-bold text-xl">{settings.urgentLimit}</span>
                        <button 
                          onClick={() => saveSettings({ ...settings, urgentLimit: settings.urgentLimit + 1 })}
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
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="font-bold text-slate-900">Critical Threshold</p>
                            <p className="text-xs text-slate-500">Maximum focus tasks before critical alert. Warning is at 70%.</p>
                          </div>
                          <div className="flex items-center gap-2">
                             <input 
                              type="number"
                              className="w-16 bg-white border border-slate-200 rounded px-2 py-1 text-sm font-mono font-bold outline-none focus:ring-1 focus:ring-red-500 text-center"
                              value={settings.criticalThreshold}
                              onChange={(e) => saveSettings({ ...settings, criticalThreshold: Math.max(5, parseInt(e.target.value) || 5) })}
                            />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Items</span>
                          </div>
                        </div>
                        <input 
                          type="range" min="5" max="100" step="5"
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                          value={settings.criticalThreshold}
                          onChange={(e) => saveSettings({ ...settings, criticalThreshold: parseInt(e.target.value) })}
                        />
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <span>5 items</span>
                          <span>100 items</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/60">
                        <div className="bg-white p-3 rounded-xl border border-slate-100 flex flex-col items-center">
                          <span className="text-[9px] font-black uppercase text-orange-400 tracking-tighter mb-1">Warning (70%)</span>
                          <span className="text-lg font-mono font-bold text-orange-400">{Math.floor(settings.criticalThreshold * 0.7)}</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 flex flex-col items-center">
                          <span className="text-[9px] font-black uppercase text-red-500 tracking-tighter mb-1">Critical (100%)</span>
                          <span className="text-lg font-mono font-bold text-red-600">{settings.criticalThreshold}</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-200/60">
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <p className="font-bold text-slate-900">Deadline Threshold</p>
                            <p className="text-xs text-slate-500">Days before deadline to prioritize task in Focus list.</p>
                          </div>
                          <div className="flex items-center gap-2">
                             <input 
                              type="number"
                              className="w-16 bg-white border border-slate-200 rounded px-2 py-1 text-sm font-mono font-bold outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                              value={settings.deadlineThreshold}
                              onChange={(e) => saveSettings({ ...settings, deadlineThreshold: Math.max(1, parseInt(e.target.value) || 1) })}
                            />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Days</span>
                          </div>
                        </div>
                        <input 
                          type="range" min="1" max="14" step="1"
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={settings.deadlineThreshold}
                          onChange={(e) => saveSettings({ ...settings, deadlineThreshold: parseInt(e.target.value) })}
                        />
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          <span>1 day</span>
                          <span>14 days</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Maintenance */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-4 text-slate-600">
                      <Layout size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Display Options</h3>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">Task Layout</p>
                        <p className="text-xs text-slate-500">Choose between detailed icons or compact list view.</p>
                      </div>
                      <div className="flex p-1 bg-white border border-slate-200 rounded-xl gap-1">
                        <button 
                          onClick={() => saveSettings({ displayMode: 'card' })}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5",
                            settings.displayMode === 'card' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          <Layout size={12} /> Cards
                        </button>
                        <button 
                          onClick={() => saveSettings({ displayMode: 'list' })}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5",
                            settings.displayMode === 'list' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          <CheckCircle2 size={12} /> List
                        </button>
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
                        onChange={(e) => saveSettings({ archiveThresholdDays: parseInt(e.target.value) })}
                      >
                        <option value={7}>7 Days (Aggressive)</option>
                        <option value={14}>14 Days (Balanced)</option>
                        <option value={30}>30 Days (Standard)</option>
                        <option value={90}>90 Days (Relaxed)</option>
                        <option value={99999}>Never (Manual only)</option>
                      </select>
                    </div>
                  </div>

                  {/* Data Management */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-6 text-emerald-600">
                      <Download size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Sync & Backup</h3>
                    </div>
                    
                    <div className="space-y-6">
                      {/* Local Backup */}
                      <div className="pb-6 border-b border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="font-bold text-slate-900">Local Folder Log</p>
                            <p className="text-xs text-slate-500">Continuous CSV snapshots to your machine.</p>
                          </div>
                          <button 
                            onClick={() => saveSettings({ isLocalBackupEnabled: !settings.isLocalBackupEnabled })}
                            disabled={!dirHandle}
                            className={cn(
                                "w-12 h-6 rounded-full p-1 transition-all duration-300",
                                settings.isLocalBackupEnabled ? "bg-indigo-600" : "bg-slate-300",
                                !dirHandle && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300",
                              settings.isLocalBackupEnabled ? "translate-x-6" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                        
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-inner">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Local Directory Path</label>
                              <div className="text-xs font-mono break-all py-1.5 text-slate-600 bg-slate-50 px-2 rounded border border-slate-100 flex items-center gap-2">
                                <Activity size={10} className="shrink-0 opacity-50" />
                                {settings.localBackupPath || 'No folder selected'}
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0 pt-5">
                              <button 
                                onClick={selectBackupFolder}
                                className={cn(
                                  "p-1.5 px-3 rounded text-[10px] font-bold transition-colors",
                                  !dirHandle && settings.localBackupPath 
                                    ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse" 
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                )}
                              >
                                {!dirHandle && settings.localBackupPath ? 'Authorize Session' : 'Select Folder'}
                              </button>
                              {window.self !== window.top && (
                                <button 
                                  onClick={() => window.open(window.location.href, '_blank')}
                                  className="p-1.5 px-2 bg-slate-100 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-200 transition-colors"
                                  title="Open in new tab to enable"
                                >
                                  <ArrowUpRight size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          {settings.localBackupPath && !dirHandle && (
                            <p className="text-[9px] text-amber-600 mt-2 font-bold flex items-center gap-1">
                              <Zap size={10} /> Permission needed to resume logging after browser refresh.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-200">
                        <p className="font-bold text-red-600 flex items-center gap-2 mb-1">
                          <AlertTriangle size={16} /> Danger Zone
                        </p>
                        <p className="text-[10px] text-slate-500 mb-4 uppercase font-black tracking-widest">Database Maintenance & Repair</p>
                        
                        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                          <p className="text-[11px] text-red-800 font-bold mb-3 leading-relaxed">
                            Reset your custom workspaces and system preferences to factory defaults.
                          </p>
                          <button 
                            onClick={forceResetSettings}
                            className="w-full py-2.5 mb-3 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-200 transition-all flex items-center justify-center gap-2 border border-red-200"
                          >
                            <RefreshCcw size={14} /> Force Reset Settings to Defaults
                          </button>
                          
                          <div className="h-px bg-red-200/50 my-4" />
                          
                          <p className="text-[11px] text-red-800 font-bold mb-3 leading-relaxed">
                            CRITICAL: Delete ALL tasks in the cloud. This cannot be undone. Use only for full data clearing.
                          </p>
                          <button 
                            onClick={purgeAllData}
                            className="w-full py-3 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                          >
                            <Trash2 size={14} /> Purge All Database Content
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                <div className="mt-8 border-t border-slate-100 flex items-center py-4">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest italic">System state synced successfully</p>
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
        <div className="text-[10px] font-mono text-slate-400 font-extrabold ml-4 uppercase">
          TriFocus V2.2
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
  onStar: () => void;
  variant?: 'Urgent' | 'Focus' | 'Archive' | 'Trash';
  displayMode?: 'card' | 'list';
  deadlineThreshold?: number;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, onToggle, onMove, onDelete, onEdit, onStar, 
  variant = 'Focus',
  displayMode = 'card',
  deadlineThreshold = 3
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const buttonRef = React.useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpwards(spaceBelow < 180); 
    }
    setShowMenu(!showMenu);
  };

  if (displayMode === 'list') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          onEdit();
        }}
        className={cn(
          "bg-white rounded-lg p-2.5 shadow-sm border border-slate-100 group hover:border-indigo-300 transition-all flex items-center gap-3 cursor-pointer",
          variant === 'Urgent' && "border-l-4 border-l-red-500",
          task.isDone && "grayscale opacity-50 shadow-none"
        )}
      >
        <button 
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={cn(
            "w-5 h-5 rounded border-2 transition-all flex items-center justify-center shrink-0",
            task.isDone ? "bg-blue-500 border-blue-500" : "border-slate-300 hover:border-blue-400"
          )}
        >
          {task.isDone && <CheckCircle2 size={12} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-mono font-bold text-slate-400">
               ({formatDate(task.createdAt)})
            </span>
            {task.deadline && (
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded leading-none flex items-center gap-1",
                (task.deadline - Date.now() <= deadlineThreshold * 86400000) 
                  ? "bg-red-50 text-red-600 border border-red-100" 
                  : "bg-slate-100 text-slate-500"
              )}>
                <Clock size={10} />
                {format(task.deadline, 'MM/dd')}
              </span>
            )}
            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded leading-none shrink-0 truncate max-w-[80px]">
              [{task.project}]
            </span>
          </div>
          <p className={cn(
            "text-xs font-semibold text-slate-800 truncate",
            task.isDone && "line-through text-slate-400"
          )}>
            {task.title}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden md:inline text-[9px] font-black text-slate-300 tabular-nums">
            {format(task.updatedAt, 'MM/dd HH:mm')}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            className={cn(
              "p-1 rounded transition-colors",
              task.isStarred ? "text-amber-500" : "text-slate-200 hover:text-amber-400"
            )}
          >
            <Star size={14} className={task.isStarred ? "fill-amber-500" : ""} />
          </button>
          
          <div className="relative" ref={buttonRef}>
            <button onClick={toggleMenu} className="p-1 hover:bg-slate-100 text-slate-400 rounded">
              <MoreVertical size={14} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                <div className={cn(
                  "absolute right-0 w-44 bg-white border border-indigo-200 rounded-xl shadow-2xl z-[70] py-1 font-bold text-[10px] uppercase tracking-wider overflow-hidden",
                  openUpwards ? "bottom-full mb-1" : "top-full mt-1"
                )}>
                  {variant !== 'Urgent' && variant !== 'Archive' && variant !== 'Trash' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 border-b border-slate-50 flex items-center gap-2">
                      <Zap size={12} className="text-red-400" /> Mark Urgent
                    </button>
                  )}
                  {variant !== 'Archive' && variant !== 'Trash' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Archive'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-600 border-b border-slate-50 flex items-center gap-2">
                      <ArchiveIcon size={12} className="text-slate-400" /> Move to Archive
                    </button>
                  )}
                  {variant !== 'Trash' ? (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Trash'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                       <Trash2 size={12} className="text-red-400" /> Move to Trash
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                      <Trash2 size={12} className="text-red-400" /> Delete Permanently
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

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
        "bg-white rounded-xl p-3 md:p-4 shadow-sm border border-slate-200 group hover:border-indigo-300 transition-all flex flex-col cursor-pointer",
        variant === 'Urgent' && "border-l-4 border-l-red-500",
        variant === 'Archive' && "opacity-70 grayscale",
        task.isDone && "grayscale opacity-50",
        showMenu && "relative z-30 shadow-xl border-indigo-200"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 pointer-events-none">
          {task.isStarred && (
            <Star size={10} className="text-amber-500 fill-amber-500" />
          )}
          {task.deadline && (
            <div className={cn(
              "flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-sm",
              (task.deadline - Date.now() <= deadlineThreshold * 86400000)
                ? "bg-red-50 text-red-600 border-red-100"
                : "bg-slate-50 text-slate-500 border-slate-100"
            )}>
              <Clock size={10} />
              {format(task.deadline, 'MM/dd')}
            </div>
          )}
          <p className="text-[9px] font-bold text-slate-400 leading-none tracking-wider uppercase font-mono">
            ({formatDate(task.createdAt)}) <span className="text-indigo-600 opacity-60">[{task.project}]</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            className={cn(
              "p-1 rounded transition-colors group/star",
              task.isStarred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
            )}
            title={task.isStarred ? "Unstar task" : "Star task"}
          >
            {task.isStarred ? <Star size={12} className="fill-amber-500" /> : <Star size={12} />}
          </button>
          {(variant === 'Archive' || variant === 'Trash') && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMove('Focus'); }}
              className="text-[9px] font-black text-indigo-600 hover:underline flex items-center gap-0.5"
              title="Restore to Focus"
            >
              <RefreshCcw size={8} /> RESTORE
            </button>
          )}
        </div>
      </div>
      <p className={cn("text-xs md:text-sm font-semibold text-slate-800 leading-tight mb-2 break-words", task.isDone && "line-through text-slate-400")}>
        {task.title}
      </p>

      {task.urls && task.urls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {task.urls.map((url, idx) => (
            <a 
              key={idx}
              href={url.startsWith('http') ? url : `https://${url}`} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors group/link bg-indigo-50/50 px-2 py-0.5 rounded border border-indigo-100/50 max-w-full"
            >
              <LinkIcon size={10} className="shrink-0 group-hover/link:rotate-12 transition-transform" />
              <span className="truncate max-w-[120px]">{url.replace(/^https?:\/\//, '')}</span>
              <ArrowUpRight size={10} className="shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      )}
      
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
          {variant !== 'Urgent' && variant !== 'Archive' && variant !== 'Trash' && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); }} className="p-1 hover:bg-red-50 text-red-500 rounded" title="Level to Urgent">
              <Zap size={10} />
            </button>
          )}
          {(variant === 'Archive' || variant === 'Trash' || variant === 'Urgent') && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Focus'); }} className="p-1 hover:bg-indigo-50 text-indigo-500 rounded" title="Move to Focus">
              <Target size={10} />
            </button>
          )}
          <div className="relative" ref={buttonRef}>
            <button onClick={toggleMenu} className="p-1 hover:bg-slate-100 text-slate-400 rounded">
              <MoreVertical size={10} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                <div className={cn(
                  "absolute right-0 w-44 bg-white border border-indigo-200 rounded-xl shadow-2xl z-[70] py-1 font-bold text-[10px] uppercase tracking-wider overflow-hidden",
                  openUpwards ? "bottom-full mb-1" : "top-full mt-1"
                )}>
                  {variant === 'Focus' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 border-b border-slate-50 flex items-center gap-2">
                      <Zap size={12} className="text-red-400" /> Move to Urgent
                    </button>
                  )}
                  {variant !== 'Archive' && variant !== 'Trash' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Archive'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-600 border-b border-slate-50 flex items-center gap-2">
                      <ArchiveIcon size={12} className="text-slate-400" /> Move to Archive
                    </button>
                  )}
                  {variant !== 'Trash' ? (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Trash'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                       <Trash2 size={12} className="text-red-400" /> Move to Trash
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                      <Trash2 size={12} className="text-red-400" /> Delete Permanently
                    </button>
                  )}
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
  const [urls, setUrls] = useState<string[]>(task.urls && task.urls.length > 0 ? task.urls : ['']);
  const [isStarred, setIsStarred] = useState(task.isStarred || false);
  const [deadline, setDeadline] = useState(task.deadline ? format(task.deadline, 'yyyy-MM-dd') : '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ 
      title, 
      notes, 
      urls: urls.filter(u => u.trim() !== ''),
      isStarred,
      deadline: deadline ? new Date(deadline).getTime() : null as any // Using null to clear
    });
  };

  const addUrlField = () => setUrls([...urls, '']);
  const updateUrlField = (index: number, val: string) => {
    const next = [...urls];
    next[index] = val;
    setUrls(next);
  };
  const removeUrlField = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
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
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
      >
        <div className="p-4 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold tracking-tight">Modify Task</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 md:hidden">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Task Description</label>
                <textarea 
                  autoFocus
                  className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-lg font-medium outline-none transition-all resize-none h-24"
                  placeholder="Task detail... (Cmd/Ctrl+Enter to save)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e);
                  }}
                />
              </div>
              <div className="shrink-0 flex flex-col items-center gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Star</label>
                <button 
                  type="button"
                  onClick={() => setIsStarred(!isStarred)}
                  className={cn(
                    "w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all",
                    isStarred ? "bg-amber-50 border-amber-200 text-amber-500" : "bg-slate-50 border-transparent text-slate-300 hover:border-slate-200"
                  )}
                >
                  <Star size={24} className={isStarred ? "fill-amber-500" : ""} />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Memos / Context</label>
              <textarea 
                placeholder="Memos / context... (Cmd/Ctrl+Enter to save)"
                className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-sm font-medium outline-none transition-all resize-none h-32"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e);
                }}
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center gap-1.5 opacity-60">
                <Calendar size={12} />
                Task Deadline
              </label>
              <input 
                type="date"
                className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-sm font-medium outline-none transition-all text-slate-400 [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:invert-[0.2] [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><LinkIcon size={10} /> Links / URLs</span>
                <button 
                  type="button" 
                  onClick={addUrlField}
                  className="text-indigo-600 hover:underline px-2"
                >
                  + Add Link
                </button>
              </label>
              <div className="space-y-2">
                {urls.map((u, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      type="url"
                      placeholder="https://... (Cmd/Ctrl+Enter to save)"
                      className="flex-1 px-5 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl text-sm font-medium outline-none transition-all"
                      value={u}
                      onChange={(e) => updateUrlField(idx, e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e);
                      }}
                    />
                    {urls.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => removeUrlField(idx)}
                        className="p-3 bg-red-50 text-red-400 hover:text-red-500 rounded-xl"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
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
        <div className="bg-slate-50 p-6 md:p-8 w-full md:w-64 border-l border-slate-100 flex flex-col overflow-y-auto custom-scrollbar pb-24 md:pb-8">
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
            {task.category === 'Archive' && (
              <button 
                onClick={() => { onMove('Focus'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-600 hover:bg-emerald-100 transition-all group"
              >
                <RefreshCcw size={16} className="text-emerald-400" />
                Restore to Focus
              </button>
            )}
            {task.category !== 'Archive' && task.category !== 'Trash' && (
              <button 
                onClick={() => { onMove('Archive'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all group"
              >
                <ArchiveIcon size={16} className="text-slate-300 group-hover:text-indigo-400" />
                Archive Task
              </button>
            )}
            {task.category !== 'Trash' ? (
              <button 
                onClick={() => { onMove('Trash'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
              >
                <Trash2 size={16} className="text-red-300" />
                Move to Trash
              </button>
            ) : (
              <div className="space-y-2">
                <button 
                  onClick={() => { onMove('Focus'); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-all"
                >
                  <RefreshCcw size={16} className="text-indigo-400" />
                  Restore to Focus
                </button>
                <button 
                  onClick={() => { if(confirm('Delete this task permanently?')) { onDelete(); onClose(); } }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-lg shadow-red-100"
                >
                  <Trash2 size={16} />
                  Delete Permanently
                </button>
              </div>
            )}
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
