import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  LayoutGrid,
  Grid2X2,
  LayoutList,
  List,
  Layout, 
  Search, 
  Calendar, 
  Archive as ArchiveIcon, 
  Zap, 
  Target, 
  Clock, 
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreVertical,
  CheckCircle2,
  Circle,
  X,
  Undo2,
  Redo2,
  ArrowRightLeft,
  ArrowUpRight,
  Trash2,
  Settings as SettingsIcon,
  Activity,
  Download,
  ExternalLink,
  Upload,
  FileText,
  LogOut,
  User as UserIcon,
  LogIn,
  AlertTriangle,
  AlertCircle,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Star,
  StarOff,
  Globe,
  Languages,
  PanelTop,
  Plus,
  Minus,
  RefreshCcw,
  Pin,
  PinOff,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DragDropContext, Droppable, Draggable as DraggableDnd } from '@hello-pangea/dnd';
const Draggable = DraggableDnd as any;
import { 
  format, 
  differenceInDays, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths, 
  addWeeks, 
  subWeeks, 
  addDays, 
  subDays,
  addYears,
  subYears,
  startOfYear,
  endOfYear,
  eachMonthOfInterval
} from 'date-fns';
import { ja, fr, enUS } from 'date-fns/locale';
import { Category, Task } from './types';
import { cn, formatDate } from './lib/utils';
import { auth, db, signIn, logOut, signInWithEmail, signUpWithEmail, linkEmailPasswordToAccount } from './lib/firebase';
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
  { id: 'Urgent', label: 'Focus', icon: Zap, color: 'bg-red-50/50 border-red-100', accent: 'bg-red-500', text: 'text-red-700', badge: 'text-red-400 border-red-100', desc: '3 Slots' },
  { id: 'Focus', label: 'ToDo', icon: Target, color: 'bg-indigo-50/50 border-indigo-100', accent: 'bg-indigo-500', text: 'text-indigo-700', badge: 'text-indigo-500', desc: 'Main' },
];

export default function App() {
  const APP_VERSION = "2.5.13";
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // メール/パスワード認証用の状態
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [linkPassword, setLinkPassword] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskUrls, setNewTaskUrls] = useState<string[]>(['']);
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>('');
  const [isTaskAllDay, setIsTaskAllDay] = useState(true);
  const [viewMode, setViewMode] = useState<'dashboard' | 'archive' | 'settings' | 'trash' | 'calendar'>('dashboard');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'info' } | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [activeSection, setActiveSection] = useState<string>('General');

  const [settings, setSettings] = useState({
    urgentLimit: 3,
    deadlineThreshold: 3,
    archiveThresholdDays: 30,
    doneToTrashThresholdDays: 7,
    trashCleanupThresholdDays: 30,
    archiveDoneToTrashDays: 7,
    archiveInactiveToTrashDays: 99999,
    criticalThreshold: 100,
    isLocalBackupEnabled: false,
    localBackupPath: '',
    displayMode: 'standard' as 'compact' | 'standard' | 'large',
    displayModeFocus: 'standard' as 'compact' | 'standard' | 'large',
    displayModeTodo: 'standard' as 'compact' | 'standard' | 'large',
    language: 'ja' as 'en' | 'ja' | 'fr',
    sections: ['General', 'Work', 'Personal']
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const tasksRef = collection(db, 'users', user.uid, 'tasks');
    const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
      const fetchedTasks: Task[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Task));
      setTasks(fetchedTasks);
    }, (error) => {
      console.error("Error fetching tasks:", error);
      setMessage({ text: "タスクの同期に失敗しました", type: "error" });
    });

    const settingsRef = doc(db, 'users', user.uid, 'settings', 'config');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(prev => ({ ...prev, ...docSnap.data() }));
      }
    });

    return () => {
      unsubscribeTasks();
      unsubscribeSettings();
    };
  }, [user]);

  useEffect(() => {
    if (message && message.type !== 'error') {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmittingAuth(true);
    try {
      if (isSignUpMode) {
        await signUpWithEmail(authEmail, authPassword);
      } else {
        await signInWithEmail(authEmail, authPassword);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError('メールアドレスまたはパスワードが正しくありません。');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('このメールアドレスは既に登録されています。設定画面からパスワードを設定してください。');
      } else {
        setAuthError('認証エラーが発生しました。入力内容を確認してください。');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLinkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLinking(true);
    try {
      await linkEmailPasswordToAccount(linkPassword);
      setMessage({ text: '学内Wi-Fi用パスワードを設定しました！', type: 'info' });
      setLinkPassword('');
    } catch (err: any) {
      console.error("Link error:", err);
      setMessage({ text: 'パスワード設定に失敗しました: ' + err.message, type: 'error' });
    } finally {
      setIsLinking(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !user) return;

    try {
      const taskData: Omit<Task, 'id'> = {
        title: newTaskTitle.trim(),
        project: newTaskProject.trim() || 'General',
        notes: newTaskNotes.trim(),
        urls: newTaskUrls.filter(u => u.trim() !== ''),
        deadline: newTaskDeadline || null,
        isAllDay: isTaskAllDay,
        category: 'Focus',
        completed: false,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'users', user.uid, 'tasks'), taskData);
      setNewTaskTitle('');
      setNewTaskProject('');
      setNewTaskNotes('');
      setNewTaskUrls(['']);
      setNewTaskDeadline('');
      setMessage({ text: 'タスクを追加しました', type: 'info' });
    } catch (err: any) {
      console.error('Task add error:', err);
      setMessage({ text: 'タスクの追加に失敗しました', type: 'error' });
    }
  };

  const handleToggleTask = async (task: Task) => {
    if (!user) return;
    try {
      const newCompleted = !task.completed;
      await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
        completed: newCompleted,
        completedAt: newCompleted ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleTogglePin = async (task: Task) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
        pinned: !task.pinned,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Pin error:', err);
    }
  };

  const handleMoveToTrash = async (task: Task) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
        category: 'Trash',
        updatedAt: new Date().toISOString()
      });
      setMessage({ text: 'ゴミ箱に移動しました', type: 'info' });
    } catch (err) {
      console.error('Trash error:', err);
    }
  };

  const handleSaveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', editingTask.id), {
        title: editingTask.title,
        project: editingTask.project,
        category: editingTask.category,
        deadline: editingTask.deadline || null,
        notes: editingTask.notes || '',
        updatedAt: new Date().toISOString()
      });
      setEditingTask(null);
      setMessage({ text: 'タスクを更新しました', type: 'info' });
    } catch (err) {
      console.error('Edit error:', err);
      setMessage({ text: '更新に失敗しました', type: 'error' });
    }
  };

  const projects = useMemo(() => {
    const set = new Set<string>();
    set.add('All');
    tasks.forEach(t => {
      if (t.project) set.add(t.project);
    });
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (t.notes && t.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesProject = selectedProject === 'All' || t.project === selectedProject;
      return matchesSearch && matchesProject;
    });
  }, [tasks, searchTerm, selectedProject]);

  const urgentTasks = useMemo(() => {
    return filteredTasks.filter(t => (t.category === 'Urgent' || t.category === 'Focus') && t.pinned && !t.completed);
  }, [filteredTasks]);

  const focusTasks = useMemo(() => {
    return filteredTasks.filter(t => !t.completed && t.category !== 'Trash' && !t.pinned);
  }, [filteredTasks]);

  const archiveTasks = useMemo(() => {
    return filteredTasks.filter(t => t.completed || t.category === 'Archive');
  }, [filteredTasks]);

  const trashTasks = useMemo(() => {
    return filteredTasks.filter(t => t.category === 'Trash');
  }, [filteredTasks]);

  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
              <Zap className="w-6 h-6 text-indigo-600 fill-indigo-600" />
              NavFOR
            </h1>
            <p className="text-xs text-slate-500 mt-1">タスク＆プロジェクト管理アプリ</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button
            onClick={() => signIn()}
            type="button"
            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-xl transition-all shadow-sm mb-4 text-sm"
          >
            Googleでログイン (通常環境用)
          </button>

          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setShowEmailForm(!showEmailForm)}
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              {showEmailForm ? 'メールログインを閉じる' : 'Sorbonne/学内Wi-Fi用 メールログインはこちら'}
            </button>
          </div>

          {showEmailForm && (
            <form onSubmit={handleEmailAuthSubmit} className="space-y-3 mt-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">メールアドレス</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">パスワード</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-colors"
              >
                {isSubmittingAuth ? '処理中...' : isSignUpMode ? '新規アカウント作成' : 'メールでログイン'}
              </button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => setIsSignUpMode(!isSignUpMode)}
                  className="text-[11px] text-slate-500 hover:underline"
                >
                  {isSignUpMode ? 'ログインに戻る' : '初めての方（新規メール登録）'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-800">
      {/* Toast Notification Bar */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2 border",
              message.type === 'error' ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-900 text-white border-slate-800"
            )}
          >
            {message.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            <span>{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setViewMode('dashboard')}>
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none text-slate-900">NavFOR</h1>
              <span className="text-[10px] text-slate-400 font-mono">v{APP_VERSION}</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setViewMode('dashboard')}
              className={cn("px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5", viewMode === 'dashboard' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              ダッシュボード
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn("px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5", viewMode === 'calendar' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <Calendar className="w-3.5 h-3.5" />
              カレンダー
            </button>
            <button
              onClick={() => setViewMode('archive')}
              className={cn("px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5", viewMode === 'archive' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <ArchiveIcon className="w-3.5 h-3.5" />
              アーカイブ ({archiveTasks.length})
            </button>
            <button
              onClick={() => setViewMode('trash')}
              className={cn("px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5", viewMode === 'trash' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <Trash2 className="w-3.5 h-3.5" />
              ゴミ箱 ({trashTasks.length})
            </button>
            <button
              onClick={() => setViewMode('settings')}
              className={cn("px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5", viewMode === 'settings' ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              設定
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="max-w-[160px] truncate">{user?.email}</span>
          </div>
          <button
            onClick={() => logOut()}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* DASHBOARD VIEW */}
        {viewMode === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
              <form onSubmit={handleAddTask} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    placeholder="新しいタスクを入力..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <input
                    type="text"
                    placeholder="プロジェクト名 (任意)"
                    value={newTaskProject}
                    onChange={(e) => setNewTaskProject(e.target.value)}
                    className="sm:w-44 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-100 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    追加
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    <input
                      type="date"
                      value={newTaskDeadline}
                      onChange={(e) => setNewTaskDeadline(e.target.value)}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="メモ・補足..."
                    value={newTaskNotes}
                    onChange={(e) => setNewTaskNotes(e.target.value)}
                    className="flex-1 min-w-[180px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </form>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {projects.map(proj => (
                  <button
                    key={proj}
                    onClick={() => setSelectedProject(proj)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                      selectedProject === proj
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {proj === 'All' ? 'すべて' : proj}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Focus List */}
              <div className="bg-white p-4 rounded-2xl border border-red-100 shadow-sm">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-red-50">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-red-500 fill-red-500" />
                    <h3 className="font-bold text-sm text-slate-800">Focus (優先枠)</h3>
                    <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold border border-red-100">
                      {urgentTasks.length} / {settings.urgentLimit}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {urgentTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggleTask}
                      onDelete={handleMoveToTrash}
                      onPin={handleTogglePin}
                      onEdit={setEditingTask}
                    />
                  ))}
                  {urgentTasks.length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      優先タスクはありません
                    </div>
                  )}
                </div>
              </div>

              {/* ToDo List */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-sm text-slate-800">ToDo (通常キュー)</h3>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                      {focusTasks.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {focusTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggleTask}
                      onDelete={handleMoveToTrash}
                      onPin={handleTogglePin}
                      onEdit={setEditingTask}
                    />
                  ))}
                  {focusTasks.length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      タスクはありません
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                {format(calendarDate, 'yyyy年 M月', { locale: ja })}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCalendarDate(subMonths(calendarDate, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                >
                  今日
                </button>
                <button
                  onClick={() => setCalendarDate(addMonths(calendarDate, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, idx) => (
                <div key={day} className={cn("bg-slate-50 py-2 text-center text-xs font-semibold", idx === 0 && "text-red-500", idx === 6 && "text-indigo-500")}>
                  {day}
                </div>
              ))}
              {eachDayOfInterval({
                start: startOfWeek(startOfMonth(calendarDate)),
                end: endOfWeek(endOfMonth(calendarDate))
              }).map((date) => {
                const dayTasks = tasks.filter(t => t.deadline && isSameDay(new Date(t.deadline), date) && !t.completed && t.category !== 'Trash');
                const isCurrentMonth = isSameMonth(date, calendarDate);

                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      "bg-white min-h-[90px] p-1.5 flex flex-col justify-start transition-colors",
                      !isCurrentMonth && "bg-slate-50/50 text-slate-300",
                      isSameDay(date, new Date()) && "bg-indigo-50/30"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full",
                      isSameDay(date, new Date()) && "bg-indigo-600 text-white"
                    )}>
                      {format(date, 'd')}
                    </span>
                    <div className="space-y-1 overflow-y-auto max-h-[60px]">
                      {dayTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={() => setEditingTask(task)}
                          className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 p-1 rounded truncate cursor-pointer hover:bg-indigo-100"
                        >
                          {task.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ARCHIVE VIEW */}
        {viewMode === 'archive' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ArchiveIcon className="w-5 h-5 text-slate-600" />
                完了済み・アーカイブ一覧 ({archiveTasks.length})
              </h2>
            </div>

            <div className="space-y-2">
              {archiveTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onDelete={handleMoveToTrash}
                  onPin={handleTogglePin}
                  onEdit={setEditingTask}
                />
              ))}
              {archiveTasks.length === 0 && (
                <div className="text-center py-12 text-xs text-slate-400">
                  アーカイブされたタスクはありません
                </div>
              )}
            </div>
          </div>
        )}

        {/* TRASH VIEW */}
        {viewMode === 'trash' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                ゴミ箱 ({trashTasks.length})
              </h2>
            </div>

            <div className="space-y-2">
              {trashTasks.map(task => (
                <div key={task.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium line-through text-slate-500">{task.title}</h4>
                    <span className="text-[10px] text-slate-400">{task.project}</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (!user) return;
                      await deleteDoc(doc(db, 'users', user.uid, 'tasks', task.id));
                      setMessage({ text: '完全に削除しました', type: 'info' });
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg text-xs font-medium"
                  >
                    完全削除
                  </button>
                </div>
              ))}
              {trashTasks.length === 0 && (
                <div className="text-center py-12 text-xs text-slate-400">
                  ゴミ箱は空です
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {viewMode === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-indigo-600" />
                学内Wi-Fi（Sorbonne等）用 パスワード設定
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Googleログイン中にここでパスワードを設定しておくと、ポップアップがブロックされる学内環境でもメールログインで同じタスクを開けます。
              </p>
              <form onSubmit={handleLinkPassword} className="max-w-md space-y-3">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="設定するパスワード (6文字以上)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isLinking}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors"
                >
                  {isLinking ? '設定中...' : 'パスワードを連携保存'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Editing Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">タスクの編集</h3>
              <button onClick={() => setEditingTask(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">タイトル</label>
                <input
                  type="text"
                  required
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">プロジェクト</label>
                <input
                  type="text"
                  value={editingTask.project}
                  onChange={(e) => setEditingTask({ ...editingTask, project: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">カテゴリー</label>
                <select
                  value={editingTask.category}
                  onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value as Category })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Focus">ToDo (通常)</option>
                  <option value="Urgent">Focus (優先枠)</option>
                  <option value="Archive">アーカイブ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">期限</label>
                <input
                  type="date"
                  value={editingTask.deadline || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">メモ</label>
                <textarea
                  rows={3}
                  value={editingTask.notes || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onPin?: (task: Task) => void;
  onEdit: (task: Task) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, onToggle, onDelete, onPin, onEdit 
}) => {
  return (
    <div className={cn(
      "p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all shadow-2xs flex items-center justify-between gap-3 group",
      task.completed && "opacity-60 bg-slate-50",
      task.pinned && "border-amber-200 bg-amber-50/30"
    )}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          onClick={() => onToggle(task)}
          className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
        >
          {task.completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(task)}>
          <div className="flex items-center gap-2">
            <h4 className={cn("text-xs font-semibold truncate text-slate-800", task.completed && "line-through text-slate-400")}>
              {task.title}
            </h4>
            {task.project && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium shrink-0">
                {task.project}
              </span>
            )}
          </div>
          {task.notes && (
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{task.notes}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
        {onPin && (
          <button
            onClick={() => onPin(task)}
            className={cn("p-1 rounded-md hover:bg-slate-100", task.pinned ? "text-amber-500" : "text-slate-400")}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(task)}
          className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
