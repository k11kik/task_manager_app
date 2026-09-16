import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutGrid,
  Calendar, 
  Archive as ArchiveIcon, 
  Zap, 
  Target, 
  Clock, 
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  Circle,
  X,
  Trash2,
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
  AlertCircle,
  Link as LinkIcon,
  Pin,
  Plus,
  Sparkles,
  Layers,
  Folder,
  Tag,
  Mail,
  Lock,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { Category, Task } from './types';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  signIn, 
  logOut, 
  signInWithEmail, 
  signUpWithEmail, 
  linkEmailPasswordToAccount 
} from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  addDoc 
} from 'firebase/firestore';

export default function App() {
  const APP_VERSION = "2.5.14";
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

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
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>('');
  const [newTaskCategory, setNewTaskCategory] = useState<Category>('Focus');
  const [viewMode, setViewMode] = useState<'dashboard' | 'archive' | 'settings' | 'trash' | 'calendar'>('dashboard');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'info' } | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  const urgentLimit = 3;

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
      const fetchedTasks: Task[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Task));
      setTasks(fetchedTasks);
    }, (error) => {
      console.error("Error fetching tasks:", error);
      setMessage({ text: "タスクの同期に失敗しました。ネットワーク接続を確認してください。", type: "error" });
    });

    return () => unsubscribeTasks();
  }, [user]);

  useEffect(() => {
    if (message && message.type !== 'error') {
      const timer = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      if (isSignUpMode) {
        if (authPassword.length < 6) {
          setAuthError('パスワードは6文字以上で入力してください。');
          setIsSubmittingAuth(false);
          return;
        }
        await signUpWithEmail(authEmail, authPassword);
        setMessage({ text: 'アカウントを新規作成し、ログインしました！', type: 'info' });
      } else {
        await signInWithEmail(authEmail, authPassword);
        setMessage({ text: 'ログインしました！', type: 'info' });
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError('メールアドレスまたはパスワードが正しくありません。');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('このメールアドレスは既に登録されています。ログインをお試しいただくか、別のメールをご使用ください。');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('有効なメールアドレスを入力してください。');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('パスワードが短すぎます。6文字以上を入力してください。');
      } else {
        setAuthError('認証エラーが発生しました: ' + (err.message || ''));
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLinkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkPassword.length < 6) {
      setMessage({ text: 'パスワードは6文字以上で設定してください。', type: 'error' });
      return;
    }
    setIsLinking(true);
    try {
      await linkEmailPasswordToAccount(linkPassword);
      setMessage({ text: 'パスワードを設定しました！学内Wi-Fi等でメールログインが可能になります。', type: 'info' });
      setLinkPassword('');
    } catch (err: any) {
      console.error("Link error:", err);
      setMessage({ text: 'パスワード連携に失敗しました: ' + err.message, type: 'error' });
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
        urls: [],
        deadline: newTaskDeadline || null,
        isAllDay: true,
        category: newTaskCategory,
        completed: false,
        pinned: newTaskCategory === 'Urgent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'users', user.uid, 'tasks'), taskData);
      setNewTaskTitle('');
      setNewTaskProject('');
      setNewTaskNotes('');
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

  const handleRestoreTask = async (task: Task) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
        category: 'Focus',
        updatedAt: new Date().toISOString()
      });
      setMessage({ text: 'タスクを復元しました', type: 'info' });
    } catch (err) {
      console.error('Restore error:', err);
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
    return filteredTasks.filter(t => (t.category === 'Urgent' || t.pinned) && t.category !== 'Trash' && !t.completed);
  }, [filteredTasks]);

  const focusTasks = useMemo(() => {
    return filteredTasks.filter(t => !t.completed && t.category !== 'Trash' && !t.pinned && t.category !== 'Urgent');
  }, [filteredTasks]);

  const archiveTasks = useMemo(() => {
    return filteredTasks.filter(t => (t.completed || t.category === 'Archive') && t.category !== 'Trash');
  }, [filteredTasks]);

  const trashTasks = useMemo(() => {
    return filteredTasks.filter(t => t.category === 'Trash');
  }, [filteredTasks]);

  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Visual Background Accents */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-slate-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-slate-700/60 relative z-10 text-slate-100">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 mx-auto mb-4 border border-indigo-400/30">
              <Zap className="w-7 h-7 fill-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">NavFOR</h1>
            <p className="text-xs text-indigo-300/80 font-medium mt-1">Next-Gen Focus & Task Navigator</p>
          </div>

          {authError && (
            <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{authError}</span>
            </div>
          )}

          {/* Login Switcher Tabs */}
          <div className="flex bg-slate-900/60 p-1 rounded-2xl mb-6 text-xs font-semibold border border-slate-700/50">
            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              className={cn(
                "flex-1 py-2.5 rounded-xl transition-all text-center flex items-center justify-center gap-2",
                !showEmailForm ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Google ログイン
            </button>
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className={cn(
                "flex-1 py-2.5 rounded-xl transition-all text-center flex items-center justify-center gap-2",
                showEmailForm ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Mail className="w-3.5 h-3.5" />
              メールアドレス
            </button>
          </div>

          {!showEmailForm ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                Google アカウントを使用して迅速に安全ログインができます。
              </p>
              <button
                onClick={() => signIn()}
                type="button"
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold py-3.5 px-4 rounded-2xl transition-all shadow-lg text-sm group"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Googleでログイン
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailAuthSubmit} className="space-y-4">
              <p className="text-[11px] text-indigo-300 bg-indigo-500/10 p-3 rounded-2xl border border-indigo-500/20 leading-relaxed">
                学内Wi-Fi環境等でGoogle認証ポップアップがブロックされる場合や、新規アカウントを作成する場合はこちらをご利用ください。
              </p>
              
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">メールアドレス</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-slate-500"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">パスワード (6文字以上)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-slate-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {isSubmittingAuth ? '処理中...' : isSignUpMode ? '新規アカウント登録' : 'メールアドレスでログイン'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUpMode(!isSignUpMode);
                    setAuthError(null);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-medium transition-colors"
                >
                  {isSignUpMode ? '既存アカウントでログインへ戻る' : '初めての方はこちら（新規アカウント作成）'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification Bar */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-2xl text-xs font-semibold flex items-center gap-2.5 border backdrop-blur-md",
              message.type === 'error' 
                ? "bg-red-500/20 border-red-500/40 text-red-200" 
                : "bg-slate-800/90 border-slate-700 text-slate-100"
            )}
          >
            {message.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span>{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Main Navigation Bar */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 sticky top-0 z-40 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setViewMode('dashboard')}>
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight text-white flex items-center gap-2">
                NavFOR
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v{APP_VERSION}
                </span>
              </h1>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800/80 text-xs font-medium">
            <button
              onClick={() => setViewMode('dashboard')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2",
                viewMode === 'dashboard' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              ダッシュボード
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2",
                viewMode === 'calendar' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              カレンダー
            </button>
            <button
              onClick={() => setViewMode('archive')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2",
                viewMode === 'archive' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <ArchiveIcon className="w-3.5 h-3.5" />
              アーカイブ ({archiveTasks.length})
            </button>
            <button
              onClick={() => setViewMode('trash')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2",
                viewMode === 'trash' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              ゴミ箱 ({trashTasks.length})
            </button>
            <button
              onClick={() => setViewMode('settings')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2",
                viewMode === 'settings' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              設定
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span className="max-w-[180px] truncate">{user?.email}</span>
          </div>
          <button
            onClick={() => logOut()}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors font-medium border border-slate-700/60"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">
        {/* DASHBOARD VIEW */}
        {viewMode === 'dashboard' && (
          <div className="space-y-6">
            {/* Task Creation Component */}
            <div className="bg-slate-900/90 p-5 rounded-3xl shadow-xl border border-slate-800 space-y-4">
              <form onSubmit={handleAddTask} className="space-y-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <input
                    type="text"
                    required
                    placeholder="新しいタスク名を入力..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1 px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="プロジェクト (任意)"
                      value={newTaskProject}
                      onChange={(e) => setNewTaskProject(e.target.value)}
                      className="w-40 px-3.5 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                    <select
                      value={newTaskCategory}
                      onChange={(e) => setNewTaskCategory(e.target.value as Category)}
                      className="px-3 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Focus">ToDo (通常)</option>
                      <option value="Urgent">Focus (優先枠)</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-6 py-3 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    追加
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>期限:</span>
                    <input
                      type="date"
                      value={newTaskDeadline}
                      onChange={(e) => setNewTaskDeadline(e.target.value)}
                      className="bg-transparent text-slate-200 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="メモ・備考..."
                    value={newTaskNotes}
                    onChange={(e) => setNewTaskNotes(e.target.value)}
                    className="flex-1 min-w-[200px] px-3.5 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </form>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="タスクやメモを検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {projects.map(proj => (
                  <button
                    key={proj}
                    onClick={() => setSelectedProject(proj)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border",
                      selectedProject === proj
                        ? "bg-indigo-600 text-white border-indigo-500 shadow-md"
                        : "bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
                    )}
                  >
                    {proj === 'All' ? 'すべてのプロジェクト' : proj}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Task Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Focus List Column */}
              <div className="bg-slate-900/80 p-5 rounded-3xl border border-red-500/20 shadow-xl space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-red-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                      <Zap className="w-4 h-4 text-red-400 fill-red-400" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-100">Focus (最優先枠)</h3>
                    <span className="text-xs bg-red-500/20 text-red-300 px-2.5 py-0.5 rounded-full font-bold border border-red-500/30">
                      {urgentTasks.length} / {urgentLimit}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 min-h-[120px]">
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
                    <div className="text-center py-10 text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-1">
                      <Sparkles className="w-5 h-5 text-slate-600 mb-1" />
                      優先枠に固定されたタスクはありません
                    </div>
                  )}
                </div>
              </div>

              {/* ToDo List Column */}
              <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                      <Target className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-100">ToDo (通常キュー)</h3>
                    <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-bold border border-slate-700">
                      {focusTasks.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 min-h-[120px]">
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
                    <div className="text-center py-10 text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-1">
                      <Layers className="w-5 h-5 text-slate-600 mb-1" />
                      通常タスクはありません
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                {format(calendarDate, 'yyyy年 M月', { locale: ja })}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCalendarDate(subMonths(calendarDate, 1))}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold border border-slate-700"
                >
                  今日
                </button>
                <button
                  onClick={() => setCalendarDate(addMonths(calendarDate, 1))}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-800 rounded-2xl overflow-hidden border border-slate-800">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, idx) => (
                <div key={day} className={cn("bg-slate-950 py-2.5 text-center text-xs font-bold", idx === 0 && "text-red-400", idx === 6 && "text-indigo-400")}>
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
                      "bg-slate-900 min-h-[100px] p-2 flex flex-col justify-start transition-colors border-t border-slate-800/40",
                      !isCurrentMonth && "bg-slate-950/60 text-slate-600",
                      isSameDay(date, new Date()) && "bg-indigo-950/30"
                    )}
                  >
                    <span className={cn(
                      "text-xs font-bold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full",
                      isSameDay(date, new Date()) && "bg-indigo-600 text-white"
                    )}>
                      {format(date, 'd')}
                    </span>
                    <div className="space-y-1 overflow-y-auto max-h-[70px]">
                      {dayTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={() => setEditingTask(task)}
                          className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 p-1 rounded-lg truncate cursor-pointer hover:bg-indigo-500/30"
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
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2.5">
                <ArchiveIcon className="w-5 h-5 text-indigo-400" />
                完了済み・アーカイブ一覧 ({archiveTasks.length})
              </h2>
            </div>

            <div className="space-y-2.5">
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
                <div className="text-center py-12 text-xs text-slate-500">
                  アーカイブされたタスクはありません
                </div>
              )}
            </div>
          </div>
        )}

        {/* TRASH VIEW */}
        {viewMode === 'trash' && (
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 text-red-400" />
                ゴミ箱 ({trashTasks.length})
              </h2>
            </div>

            <div className="space-y-2.5">
              {trashTasks.map(task => (
                <div key={task.id} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold line-through text-slate-400">{task.title}</h4>
                    <span className="text-[10px] text-slate-500">{task.project}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestoreTask(task)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
                    >
                      元に戻す
                    </button>
                    <button
                      onClick={async () => {
                        if (!user) return;
                        await deleteDoc(doc(db, 'users', user.uid, 'tasks', task.id));
                        setMessage({ text: '完全に削除しました', type: 'info' });
                      }}
                      className="px-2.5 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg text-xs font-medium border border-red-500/30"
                    >
                      完全削除
                    </button>
                  </div>
                </div>
              ))}
              {trashTasks.length === 0 && (
                <div className="text-center py-12 text-xs text-slate-500">
                  ゴミ箱は空です
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {viewMode === 'settings' && (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800 space-y-4">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2.5">
                <LinkIcon className="w-5 h-5 text-indigo-400" />
                学内Wi-Fi（Sorbonne等）用 パスワード設定
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Googleでログインしている時に、ここでログインパスワードを設定しておくと、ポップアップがブロックされる学内環境でも同じメールアドレスとパスワードですべてのタスクにアクセスできます。
              </p>
              <form onSubmit={handleLinkPassword} className="max-w-md space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">連携用パスワード (6文字以上)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLinking}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-5 rounded-xl text-xs transition-colors shadow-lg"
                >
                  {isLinking ? '設定中...' : 'パスワードを連携保存'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Editing Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 max-w-lg w-full rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm">タスクの編集</h3>
              <button onClick={() => setEditingTask(null)} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTask} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">タイトル</label>
                <input
                  type="text"
                  required
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">プロジェクト</label>
                <input
                  type="text"
                  value={editingTask.project}
                  onChange={(e) => setEditingTask({ ...editingTask, project: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">カテゴリー</label>
                <select
                  value={editingTask.category}
                  onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value as Category })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                >
                  <option value="Focus">ToDo (通常)</option>
                  <option value="Urgent">Focus (優先枠)</option>
                  <option value="Archive">アーカイブ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">期限</label>
                <input
                  type="date"
                  value={editingTask.deadline || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, deadline: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">メモ</label>
                <textarea
                  rows={3}
                  value={editingTask.notes || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  更新を保存
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
      "p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl hover:border-slate-700 transition-all shadow-md flex items-center justify-between gap-3 group",
      task.completed && "opacity-50 bg-slate-950/40",
      task.pinned && "border-amber-500/40 bg-amber-500/5"
    )}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={() => onToggle(task)}
          className="text-slate-500 hover:text-indigo-400 transition-colors shrink-0"
        >
          {task.completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(task)}>
          <div className="flex items-center gap-2">
            <h4 className={cn("text-xs font-semibold truncate text-slate-100", task.completed && "line-through text-slate-500")}>
              {task.title}
            </h4>
            {task.project && (
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-medium shrink-0 border border-slate-700">
                {task.project}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {task.deadline && (
              <span className="text-[10px] text-indigo-300 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {task.deadline}
              </span>
            )}
            {task.notes && (
              <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{task.notes}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
        {onPin && (
          <button
            onClick={() => onPin(task)}
            className={cn("p-1.5 rounded-lg hover:bg-slate-800 transition-colors", task.pinned ? "text-amber-400" : "text-slate-500")}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(task)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
