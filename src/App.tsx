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
  GripVertical,
  KeyRound,
  Shield,
  Mail,
  Lock
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
import { 
  auth, 
  db, 
  signIn, 
  logOut,
  checkRedirectResult,
  linkEmailPasswordToCurrentUser,
  hasPasswordAuth,
  hasGoogleAuth
} from './lib/firebase';
import { AuthModal } from './components/AuthModal';
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
  { id: 'Urgent', label: 'Focus', icon: Zap, color: 'bg-red-50/50 border-red-100', accent: 'bg-red-500', text: 'text-red-700', badge: 'text-red-400 border-red-100', desc: '3 Slots' },
  { id: 'Focus', label: 'ToDo', icon: Target, color: 'bg-indigo-50/50 border-indigo-100', accent: 'bg-indigo-500', text: 'text-indigo-700', badge: 'text-indigo-500', desc: 'Main' },
];

export default function App() {
  const APP_VERSION = "2.6.1";
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
  const [isTaskAllDay, setIsTaskAllDay] = useState(true);
  const [newTaskUrl, setNewTaskUrl] = useState(''); // Compatibility check if still used in layout
  const [isPickingDaily, setIsPickingDaily] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'archive' | 'settings' | 'trash' | 'calendar'>('dashboard');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'info' } | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>('General');
  const [mobileView, setMobileView] = useState<'summary' | 'urgent' | 'focus' | 'calendar' | 'archive' | 'trash' | 'settings'>('urgent');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialTab, setAuthModalInitialTab] = useState<'google' | 'email' | 'signup' | 'reset'>('google');
  const [linkingPassword, setLinkingPassword] = useState('');
  const [isLinkingLoading, setIsLinkingLoading] = useState(false);
  const [linkingMessage, setLinkingMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  
  // Track swipe cooldown
  const lastSwipeTime = React.useRef(0);
  const touchStart = React.useRef({ x: 0, y: 0 });
  const accumulatedX = React.useRef(0);
  const swipeLocked = React.useRef(false);
  const lockTimer = React.useRef<NodeJS.Timeout | null>(null);

  const handleSwipe = (direction: 'left' | 'right') => {
    const now = Date.now();
    // クールダウン時間を少し短めに設定 (PCの操作感を考慮)
    if (now - lastSwipeTime.current < 350) return;
    lastSwipeTime.current = now;
    accumulatedX.current = 0;

    const modes: ('dashboard' | 'archive' | 'trash' | 'calendar' | 'settings')[] = ['dashboard', 'calendar', 'archive', 'trash', 'settings'];
    const currentIndex = modes.indexOf(viewMode);
    
    const mobileViews: ('summary' | 'urgent' | 'focus' | 'calendar' | 'archive' | 'trash' | 'settings')[] = ['summary', 'urgent', 'focus', 'calendar', 'archive', 'trash', 'settings'];
    const currentMobileIndex = mobileViews.indexOf(mobileView as any);

    if (window.innerWidth >= 1024) {
      if (direction === 'right' && currentIndex > 0) setViewMode(modes[currentIndex - 1]);
      if (direction === 'left' && currentIndex < modes.length - 1) setViewMode(modes[currentIndex + 1]);
    } else {
      if (mobileView === 'calendar' || viewMode === 'calendar') return;
      if (direction === 'right' && currentMobileIndex > 0) setMobileView(mobileViews[currentMobileIndex - 1] as any);
      if (direction === 'left' && currentMobileIndex < mobileViews.length - 1) setMobileView(mobileViews[currentMobileIndex + 1] as any);
      
      const nextIndex = direction === 'right' ? currentMobileIndex - 1 : currentMobileIndex + 1;
      if (nextIndex >= 0 && nextIndex < mobileViews.length) {
        const mv = mobileViews[nextIndex];
        if (mv === 'calendar') setViewMode('calendar');
        else if (mv === 'archive') setViewMode('archive');
        else if (mv === 'trash') setViewMode('trash');
        else if (mv === 'settings') setViewMode('settings');
        else setViewMode('dashboard');
      }
    }
  };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // モバイル版のカレンダー表示中のみ、独自のスワイプ処理を行わずにブラウザに任せる（重さを解消）
      if (window.innerWidth < 1024 && (viewMode === 'calendar' || mobileView === 'calendar')) return;

      // 垂直スクロールが支配的な場合は無視
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        accumulatedX.current = 0;
        return;
      }

      // 横スクロール検知
      if (Math.abs(e.deltaX) > 2) {
        // ブラウザの「戻る/進む」ジェスチャーを防止（可能な場合）
        if (Math.abs(e.deltaX) > 10 && e.cancelable) {
          e.preventDefault();
        }

        // ロック中の処理
        if (swipeLocked.current) {
          // 逆方向に強く回された場合はロックを解除して即座に反応できるようにする
          if ((accumulatedX.current > 0 && e.deltaX < -10) || (accumulatedX.current < 0 && e.deltaX > 10)) {
            swipeLocked.current = false;
            accumulatedX.current = 0;
          } else {
            return;
          }
        }

        accumulatedX.current += e.deltaX;

        // PCでの閾値を調整 (15-20程度でより軽く)
        const threshold = 18;
        if (Math.abs(accumulatedX.current) > threshold) {
          handleSwipe(accumulatedX.current > 0 ? 'left' : 'right');
          
          // ロック開始
          swipeLocked.current = true;
          
          // タイマーによる強制ロック解除 (慣性が止まらない場合への備え)
          if (lockTimer.current) clearTimeout(lockTimer.current);
          lockTimer.current = setTimeout(() => {
            swipeLocked.current = false;
            accumulatedX.current = 0;
          }, 350); // 0.35秒後に自動解放
        }
      } else {
        // 微小な動きになったら蓄積をリセットし、ロックを解除
        if (Math.abs(e.deltaX) < 1.5) {
          accumulatedX.current = 0;
          swipeLocked.current = false;
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStart.current.x;
      const diffY = Math.abs(touchEndY - touchStart.current.y);
      
      if (Math.abs(diffX) > 40 && Math.abs(diffX) > diffY * 1.5) {
        handleSwipe(diffX > 0 ? 'right' : 'left');
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [viewMode, mobileView]);
  
  // Undo/Redo state
  const [history, setHistory] = useState<{tasks: Task[], settings: any}[]>([]);
  const [redoStack, setRedoStack] = useState<{tasks: Task[], settings: any}[]>([]);
  const [isUndoing, setIsUndoing] = useState(false);

  const [isNewTaskMemoExpanded, setIsNewTaskMemoExpanded] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<number>(() => {
    return Number(localStorage.getItem('trifocus_last_backup')) || 0;
  });
  const [archiveFilter, setArchiveFilter] = useState<'all' | '1m' | '3m' | '6m' | '1y'>('all');
  const [trashFilter, setTrashFilter] = useState<'all' | '1w' | '2w'>('all');

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [showTrashMenu, setShowTrashMenu] = useState(false);
  const [showProjectFilter, setShowProjectFilter] = useState(false);

  useEffect(() => {
    if (message && message.type !== 'error') {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
    language: 'en' as 'en' | 'ja' | 'fr',
    sections: []
  });

  const t = (key: string, data?: Record<string, string | number>) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        'Done': 'Done',
        'TotalLabel': 'Total',
        'Urgent': 'Focus',
        'Focus': 'ToDo',
        'Archive': 'Archive',
        'Trash': 'Trash Bin',
        'Settings': 'Settings',
        'Dashboard': 'Dashboard',
        'Calendar': 'Calendar',
        'Entry': 'Entry',
        'Language': 'Language',
        'English': 'English',
        'Japanese': 'Japanese',
        'French': 'French',
        'StandardView': 'Standard View',
        'LargeView': 'Grand View',
        'CompactView': 'List View',
        'InactiveMoveToTrash': 'Inactive items archived after',
        'PermanentDeleteAfter': 'Items will be deleted after',
        'EmptyTrash': 'Empty Trash',
        'Reset': 'Reset',
        'FilterProjects': 'Filter Projects',
        'Days': 'days',
        'MovingSoon': 'Moving to Trash Soon',
        'DeletingSoon': 'Deleting Soon',
        'ArchiveEmpty': 'Archive Empty',
        'TrashEmpty': 'Trash Bin is Empty',
        'NoUrgent': 'No Focus Tasks',
        'NoFocus': 'No ToDo Tasks',
        'Expired': 'Expired Deadlines',
        'Approaching': 'Approaching Deadlines',
        'Pinned': 'Pinned',
        'PinnedGlobal': 'Pinned (Global)',
        'ExpiredGlobal': 'Expired Deadlines (Global)',
        'ApproachingGlobal': 'Approaching Deadlines (Global)',
        'Extract': 'Extract',
        'SystemArchive': 'System Archive',
        'TaskEntry': 'New Task Entry',
        'WorkflowHealth': 'Working Status',
        'Status': 'Working Status',
        'DoneToday': 'Done Today',
        'Authenticated': 'Authenticated',
        'DataLifecycle': 'Data Lifecycle',
        'ExportData': 'Export Data',
        'ImportData': 'Import Data',
        'DownloadCSV': 'Download CSV',
        'ImportCSV': 'Import CSV',
        'AccountInformation': 'Account Information',
        'CloudSynced': 'Cloud Synced',
        'LocalOnly': 'Local Only',
        'UrgentCapacity': 'Focus Capacity',
        'HealthMetrics': 'ToDo Limit Settings',
        'CriticalThreshold': 'Critical Threshold',
        'DeadlineThreshold': 'Deadline Threshold',
        'DoneTrashLifecycle': 'Done & Trash Lifecycle',
        'GlobalLoad': 'Global Load',
        'CriticalLoad': 'Critical Load',
        'WarningHighLoad': 'Warning High Load',
        'SafeCapacity': 'Safe Capacity',
        'AutomatedSyncStatus': 'Automated Sync Status',
        'TaskDetail': 'Task Detail',
        'PersonalAccount': 'Personal Account',
        'NotSignedIn': 'Not signed in',
        'DisconnectAccount': 'Disconnect account',
        'Items': 'Items',
        'SystemState': 'System State',
        'Search': 'Search',
        'All': 'All',
        'AllItems': 'All Items',
        'Older1m': '1 Month Ago',
        'Older3m': '3 Months Ago',
        'Older6m': '6 Months Ago',
        'Older1y': '1 Year Ago',
        'TimeFilter': 'Time Filter',
        'UrgentSlotLimit': 'Focus Slot Limit',
        'MaxConcurrentUrgent': 'Maximum concurrent priority tasks allowed.',
        'CriticalAlertDesc': 'Maximum ToDo tasks before critical alert. Warning is at 70%.',
        'DeadlineThresholdDesc': 'Days before deadline to prioritize task in ToDo list.',
        'DoneToTrash': 'Done to Trash',
        'DoneToTrashDesc': 'How long to keep completed tasks in ToDo before Trashing.',
        'TrashAutoCleanup': 'Trash Auto-Cleanup',
        'TrashAutoCleanupDesc': 'Permanently delete items in Trash after this period.',
        'AutoArchiveSweep': 'Auto Archive Sweep',
        'ArchiveThreshold': 'Archive Threshold',
        'ArchiveThresholdDesc': 'Move items to archive after specified inactivity period.',
        'ArchiveDoneToTrash': 'Auto-trash completed archive items',
        'ArchiveDoneToTrashDesc': 'Move completed tasks in archive to trash after specified period.',
        'ArchiveInactiveToTrash': 'Auto-trash inactive archive items',
        'ArchiveInactiveToTrashDesc': 'Move inactive tasks in archive to trash after specified period.',
        'MovingToTrashSoon': 'Moving soon to Trash',
        'SyncToCloud': 'Sync to Cloud',
        'SyncToCloudDesc': 'Sign in to sync across all devices in real-time.',
        'ContinueWithGoogle': 'Continue with Google',
        'ResetSettingsDesc': 'Reset all app settings to default.',
        'PermissionNeeded': 'Permission needed to continue saving after refresh.',
        'Syncing': 'Syncing...',
        'BackupNeeded': 'Backup Needed',
        'BackedUp': 'Backed Up',
        'LastSuccessfulLog': 'Last Successful Log',
        'SelectLanguageDesc': 'Select your preferred interface language.',
        'ProjectFilter': 'Project Filter',
        'SyncActive': 'Sync Active',
        'SyncOff': 'Sync Off',
        'Today': 'Today',
        'WeekOf': 'Week of',
        'year': 'Year',
        'month': 'Month',
        'week': 'Week',
        'day': 'Day',
        'AddToFocus': 'Add ToDo',
        'SyncAndBackup': 'Sync & Backup',
        'LocalFolderLog': 'Local Folder Log',
        'LocalDirectoryPath': 'Local Directory Path',
        'NoFolderSelected': 'No Folder Selected',
        'AuthorizeSession': 'Authorize Session',
        'SelectFolder': 'Select Folder',
        'ManualLocalBackup': 'Manual Local Backup',
        'SaveBackupToLocal': 'Save Backup to Local',
        'DangerZone': 'Danger Zone',
        'ForceResetSettings': 'Force Reset Settings',
        'CommittingChanges': 'Committing Changes...',
        'AuthorizedLocalFolder': 'Authorized Local Folder',
        'RenameWorkspace': 'Rename Workspace?',
        'ForceBackupNow': 'Force Backup Now',
        'Star': 'Important',
        'Maximize': 'Maximize',
        'SystemActions': 'System Actions',
        'MoveToUrgent': 'Move to Focus',
        'RestoreToFocus': 'Move to ToDo',
        'ArchiveTask': 'Archive Task',
        'MoveToTrash': 'Move to Trash',
        'DeletePermanently': 'Delete Permanently',
        'General': 'General',
        'WorkspaceLabel': 'workspace',
        'Metadata': 'Metadata',
        'Cancel': 'Cancel',
        'CommitChanges': 'Commit Changes',
        'DeleteConfirm': 'Delete this task permanently?',
        'ProjectCode': 'Project Code',
        'SafeCapacityUppercase': 'SAFE CAPACITY',
        'GeneralProjectOverview': 'General Project Overview',
        'ProjectOverview': 'Project Overview',
        'NoTasks': 'No tasks found.',
        'SyncOffUppercase': 'SYNC OFF',
        'DailyChoice': 'Daily Choice',
        'ExtractDesc': 'Select up to {n} priority tasks from ToDo to move to Focus.',
        'ExtractLimitAlert': 'You can only add {n} more task(s) to Focus.',
        'NoFocusTasks': 'No tasks in ToDo list.',
        'SetDailyFocus': "Set Today's Focus",
        'Slots': 'slots',
        'ContextSubtasks': 'Context Subtasks',
        'UrlPlaceholder': 'URL Placeholder',
        'DetailsPlaceholder': 'Task detail... (Cmd/Ctrl+Enter to save)',
        'ExampleProjects': 'e.g. CORE, DEV',
        'BroadViewMemoPlaceholder': 'Deep dive into context, sub-tasks, or brainstorm ideas here...',
        'Clear': 'Clear',
        'Pin': 'Pin',
        'TaskDescription': 'Task Description',
        'LastUpdatedLabel': 'Last updated',
        'StatusNever': 'Never',
        'MarkDone': 'Mark as Done',
        'MarkUndone': 'Mark as ToDo',
      },
      ja: {
        'TotalLabel': '計',
        'Urgent': 'フォーカス',
        'Focus': 'ToDo',
        'Archive': 'アーカイブ',
        'Trash': 'ゴミ箱',
        'Settings': '設定',
        'Dashboard': 'ダッシュボード',
        'Calendar': 'カレンダー',
        'Entry': '入力',
        'Language': '言語設定',
        'English': '英語 (English)',
        'Japanese': '日本語 (Japanese)',
        'French': 'フランス語 (Français)',
        'StandardView': 'グリッド (標準)',
        'LargeView': 'グリッド (大きく表示)',
        'CompactView': 'リスト表示',
        'Done': '完了',
        'Pending': '未完了',
        'Filters': 'フィルター',
        'Reset': 'リセット',
        'NoTasks': 'タスクがありません',
        'NoProjectsTracked': 'まだプロジェクトが管理されていません。',
        'InactiveMoveToTrash': '非アクティブなアイテムは自動的にアーカイブされます - 期間:',
        'PermanentDeleteAfter': 'ゴミ箱のアイテムは自動的に消去されます - 期間:',
        'EmptyTrash': 'ゴミ箱を空にする',
        'FilterProjects': 'プロジェクトでフィルタ',
        'Days': '日',
        'MovingSoon': 'まもなくゴミ箱へ移動',
        'DeletingSoon': 'まもなく完全に消去',
        'ArchiveEmpty': 'アーカイブは空です',
        'TrashEmpty': 'ゴミ箱は空です',
        'NoUrgent': 'フォーカスはありません',
        'NoFocus': 'ToDoはありません',
        'Expired': '期限切れ',
        'Approaching': 'まもなく期限',
        'Pinned': 'ピン留め',
        'PinnedGlobal': 'ピン留め (全体)',
        'ExpiredGlobal': '期限切れ (全体)',
        'ApproachingGlobal': 'まもなく期限 (全体)',
        'Extract': '抽出',
        'SystemArchive': 'アーカイブ',
        'TaskEntry': 'タスクの追加',
        'WorkflowHealth': 'ワークステータス',
        'Status': 'ワークステータス',
        'DoneToday': '本日の完了',
        'Authenticated': 'ログイン中',
        'DataLifecycle': 'データ管理',
        'ExportData': 'データのエクスポート',
        'ImportData': 'データのインポート',
        'DownloadCSV': 'CSVをダウンロード',
        'ImportCSV': 'CSVをインポート',
        'AccountInformation': 'アカウント情報',
        'CloudSynced': 'クラウド同期中',
        'LocalOnly': 'ローカル保存のみ',
        'UrgentCapacity': 'フォーカス容量',
        'HealthMetrics': 'ToDo上限設定',
        'CriticalThreshold': '限界しきい値',
        'DeadlineThreshold': '締切しきい値',
        'DoneTrashLifecycle': '完了したタスクの処理',
        'PersonalAccount': '共有なし',
        'NotSignedIn': 'ログインしていません',
        'DisconnectAccount': 'アカウントの連携解除',
        'Items': '件',
        'SystemState': 'System State',
        'Search': '検索',
        'All': 'すべて',
        'AllItems': 'すべてのアイテム',
        'Older1m': '1ヶ月以上前',
        'Older3m': '3ヶ月以上前',
        'Older6m': '6ヶ月以上前',
        'Older1y': '1年以上前',
        'TimeFilter': '時間フィルター',
        'UrgentSlotLimit': 'フォーカス枠の上限',
        'MaxConcurrentUrgent': '同時に進められる優先タスクの最大数です。',
        'CriticalAlertDesc': 'ToDoタスクの許容量。70%で警告、100%で限界。',
        'DeadlineThresholdDesc': '締切の何日前からToDoリストで優先するか設定します。',
        'DoneToTrash': '完了からゴミ箱へ',
        'DoneToTrashDesc': '完了したタスクをゴミ箱に送るまでの日数。',
        'TrashAutoCleanup': 'ゴミ箱の自動整理',
        'TrashAutoCleanupDesc': 'ゴミ箱に入ったアイテムを完全に削除するまでの日数。',
        'MoveToUrgent': 'フォーカスへ移動',
        'RestoreToFocus': 'ToDoへ戻す',
        'ArchiveTask': 'アーカイブする',
        'MoveToTrash': 'ゴミ箱へ移動',
        'DeletePermanently': '完全に削除',
        'General': '一般',
        'WorkspaceLabel': 'ワークスペース',
        'SelectLanguageDesc': 'インターフェースの表示言語を設定します。',
        'GlobalLoad': '全体の負荷',
        'CriticalLoad': 'CRITICAL LOAD',
        'WarningHighLoad': 'HIGH LOAD',
        'SafeCapacity': 'SAFE CAPACITY',
        'GeneralProjectOverview': 'プロジェクト概況',
        'ProjectOverview': 'のプロジェクト概況',
        'Total': '件',
        'Slots': '最大枠',
        'SyncToCloud': 'クラウド同期',
        'SyncToCloudDesc': 'ログインすると、全てのデバイスでタスクをリアルタイムに同期できます。',
        'ContinueWithGoogle': 'Googleでログイン',
        'ProjectCode': 'プロジェクト名',
        'TaskDetail': 'タスク内容',
        'ContextSubtasks': '背景やサブタスクなど... (Ctrl+Enterで保存)',
        'DetailsPlaceholder': '詳細を入力... (Ctrl+Enterで保存)',
        'ExampleProjects': '例: CORE, DEV',
        'Memos': 'メモ',
        'Expand': '広げる',
        'Shrink': '閉じる',
        'Urls': 'リンク',
        'Add': '追加',
        'UrlPlaceholder': 'https://... (Ctrl+Enterで保存)',
        'BroadViewMemoPlaceholder': '詳細なコンテキスト、サブタスク、アイデアのメモなど...',
        'AddToFocus': 'ToDoに追加',
        'TaskDescription': 'タスク内容',
        'Clear': 'クリア',
        'Pin': 'ピン留め',
        'SignIn': 'ログイン',
        'LogOut': 'ログアウト',
        'Deadline': '締切',
        'Never': '自動削除なし (手動のみ)',
        'NeverCleanup': '自動整理なし',
        'AutoArchiveSweep': 'アーカイブの自動整理',
        'ArchiveThreshold': 'アーカイブへの移動',
        'ArchiveThresholdDesc': '最後に操作してからアーカイブに移動するまでの期間を設定します。',
        'ArchiveDoneToTrash': 'アーカイブ内完了タスクのごみ箱移動',
        'ArchiveDoneToTrashDesc': 'アーカイブ内で完了(Done)にしたタスクを自動でゴミ箱へ移動する期間を設定します。',
        'ArchiveInactiveToTrash': 'アーカイブ内非アクティブタスクのごみ箱移動',
        'ArchiveInactiveToTrashDesc': 'アーカイブ内の未完了かつ非アクティブなタスクを自動でゴミ箱へ移動する期間を設定します。',
        'MovingToTrashSoon': 'もうすぐゴミ箱へ移動',
        'SyncAndBackup': '同期とバックアップ',
        'LocalFolderLog': 'ローカル保存ログ',
        'LocalFolderLogDesc': 'PCへの自動CSVバックアップを有効にします。',
        'LocalDirectoryPath': '保存先フォルダ',
        'NoFolderSelected': 'フォルダが選択されていません',
        'AuthorizeSession': '許可のリクエスト',
        'SelectFolder': 'フォルダを選択',
        'ManualLocalBackup': '手動でバックアップ',
        'SaveBackupToLocal': 'ローカルに保存',
        'LastSaved': '最終保存',
        'DailyUpdateRecommendation': '推奨: 1日1回の更新',
        'DangerZone': '危険な操作',
        'ResetSettingsDesc': 'CRITICAL: Cloud上の全タスクを削除します。この操作は取り消せません。同期が有効な場合、まず緊急バックアップが作成されます。',
        'ForceResetSettings': 'クラウドタスクを完全に消去',
        'PermissionNeeded': 'ブラウザの更新後、保存を再開するには許可が必要です。',
        'ProjectFilter': 'プロジェクト',
        'FilterByProject': 'プロジェクトで絞り込み',
        'Syncing': '同期中...',
        'SyncActive': '同期有効',
        'BackupNeeded': '要バックアップ',
        'Today': '今日',
        'WeekOf': '週:',
        'BackedUp': 'バックアップ済み',
        'SyncOff': '同期オフ',
        'SyncOffUppercase': '同期オフ',
        'year': '年',
        'month': '月',
        'week': '週',
        'day': '日',
        'AutomatedSyncStatus': '自動同期ステータス',
        'LastSuccessfulLog': '最終ログ保存',
        'CommittingChanges': '保存中...',
        'AuthorizedLocalFolder': '認証済みフォルダ',
        'RenameWorkspace': 'ワークスペース名を変更しますか？',
        'ForceBackupNow': '今すぐバックアップ',
        'Star': '重要',
        'Maximize': '最大化',
        'SystemActions': '操作',
        'Metadata': 'メタデータ',
        'Cancel': 'キャンセル',
        'CommitChanges': '変更を保存',
        'DeleteConfirm': 'このタスクを完全に削除しますか？',
        'DailyChoice': '本日の抽出',
        'ExtractDesc': 'ToDoから最大 {n} 件の優先タスクを選択して、フォーカスに移動します。',
        'ExtractLimitAlert': 'フォーカスにはあと {n} 件しか追加できません。',
        'NoFocusTasks': 'ToDoリストにタスクがありません。',
        'SetDailyFocus': '本日のフォーカスを設定',
        'LastUpdatedLabel': '最終更新',
        'StatusNever': '未更新',
        'MarkDone': '完了にする',
        'MarkUndone': '未完了に戻す',
      },
      fr: {
        'TotalLabel': 'Total',
        'Urgent': 'Focus',
        'Focus': 'ToDo',
        'Archive': 'Archives',
        'Trash': 'Corbeille',
        'Settings': 'Paramètres',
        'Dashboard': 'Tableau de bord',
        'Calendar': 'Calendrier',
        'Entry': 'Saisie',
        'Language': 'Langue',
        'English': 'Anglais (English)',
        'Japanese': 'Japonais (Japanese)',
        'French': 'Français (French)',
        'StandardView': 'Vue Standard',
        'LargeView': 'Grande Vue',
        'CompactView': 'Vue Liste',
        'Done': 'Terminé',
        'Pending': 'En attente',
        'Filters': 'Filtres',
        'Reset': 'Réinitialiser',
        'NoTasks': 'Aucune tâche trouvée',
        'NoProjectsTracked': 'Aucun projet suivi pour le moment.',
        'InactiveMoveToTrash': 'Articles inactifs archivés après',
        'PermanentDeleteAfter': 'Les articles seront supprimés après',
        'EmptyTrash': 'Vider la corbeille',
        'FilterProjects': 'Filtrer par projet',
        'Days': 'jours',
        'MovingSoon': 'Bientôt dans la corbeille',
        'DeletingSoon': 'Suppression imminente',
        'ArchiveEmpty': 'Archives vides',
        'TrashEmpty': 'La corbeille est vide',
        'NoUrgent': 'Aucune tâche prioritaire',
        'NoFocus': 'Aucune tâche ToDo',
        'Expired': 'Échéances dépassées',
        'Approaching': 'Échéances proches',
        'Pinned': 'Épinglés',
        'PinnedGlobal': 'Épinglés (Global)',
        'ExpiredGlobal': 'Échéances dépassées (Global)',
        'ApproachingGlobal': 'Échéances proches (Global)',
        'Extract': 'Extraire',
        'SystemArchive': 'Archives Système',
        'TaskEntry': 'Nouvelle tâche',
        'WorkflowHealth': 'État de travail',
        'Status': 'Statut',
        'DoneToday': 'Terminé aujourd\'hui',
        'Authenticated': 'Authentifié',
        'DataLifecycle': 'Cycle de vie des données',
        'ExportData': 'Exporter les données',
        'ImportData': 'Importer les données',
        'DownloadCSV': 'Télécharger CSV',
        'ImportCSV': 'Importer CSV',
        'AccountInformation': 'Informations du compte',
        'CloudSynced': 'Synchronisé avec le Cloud',
        'LocalOnly': 'Local uniquement',
        'UrgentCapacity': 'Capacité Focus',
        'HealthMetrics': 'Paramètres ToDo',
        'CriticalThreshold': 'Seuil critique',
        'DeadlineThreshold': 'Seuil d\'échéance',
        'DoneTrashLifecycle': 'Cycle de vie Terminé & Corbeille',
        'PersonalAccount': 'Compte personnel',
        'NotSignedIn': 'Non connecté',
        'DisconnectAccount': 'Déconnecter le compte',
        'Items': 'Articles',
        'SystemState': 'État du système',
        'Search': 'Recherche',
        'All': 'Tout',
        'AllItems': 'Tous les éléments',
        'Older1m': 'Plus de 1 mois',
        'Older3m': 'Plus de 3 mois',
        'Older6m': 'Plus de 6 mois',
        'Older1y': 'Plus de 1 an',
        'TimeFilter': 'Filtre de temps',
        'UrgentSlotLimit': 'Limite de slots Focus',
        'MaxConcurrentUrgent': 'Nombre maximum de tâches prioritaires autorisées.',
        'CriticalAlertDesc': 'Nombre maximum de tâches ToDo avant alerte critique. Alerte à 70%.',
        'DeadlineThresholdDesc': 'Jours avant l\'échéance pour prioriser la tâche.',
        'DoneToTrash': 'Terminé vers Corbeille',
        'DoneToTrashDesc': 'Temps de conservation des tâches terminées.',
        'TrashAutoCleanup': 'Nettoyage automatique Corbeille',
        'TrashAutoCleanupDesc': 'Suppression définitive après cette période.',
        'MoveToUrgent': 'Déplacer vers Focus',
        'RestoreToFocus': 'Remettre dans ToDo',
        'ArchiveTask': 'Archiver la tâche',
        'MoveToTrash': 'Mettre à la corbeille',
        'DeletePermanently': 'Supprimer définitivement',
        'General': 'Général',
        'WorkspaceLabel': 'workspace',
        'SelectLanguageDesc': 'Choisissez votre langue d\'interface.',
        'GlobalLoad': 'Charge globale',
        'CriticalLoad': 'CHARGE CRITIQUE',
        'WarningHighLoad': 'CHARGE ÉLEVÉE',
        'SafeCapacity': 'CAPACITÉ SÛRE',
        'GeneralProjectOverview': 'Aperçu général du projet',
        'ProjectOverview': 'Aperçu du projet',
        'Total': 'Total',
        'Slots': 'Slots',
        'SyncToCloud': 'Synchro Cloud',
        'SyncToCloudDesc': 'Connectez-vous pour synchroniser en temps réel.',
        'ContinueWithGoogle': 'Continuer avec Google',
        'ProjectCode': 'Code projet',
        'TaskDetail': 'Détails de la tâche',
        'ContextSubtasks': 'Contexte, sous-tâches... (Cmd/Ctrl+Entrée pour enregistrer)',
        'DetailsPlaceholder': 'Détails... (Cmd/Ctrl+Entrée pour enregistrer)',
        'ExampleProjects': 'Ex: CORE, DEV',
        'Memos': 'Mémos',
        'Expand': 'Agrandir',
        'Shrink': 'Réduire',
        'Urls': 'Liens',
        'Add': 'Ajouter',
        'UrlPlaceholder': 'https://... (Cmd/Ctrl+Entrée pour enregistrer)',
        'BroadViewMemoPlaceholder': 'Approfondissez le contexte, les sous-tâches ou les idées ici...',
        'Clear': 'Effacer',
        'Pin': 'Épingler',
        'TaskDescription': 'Description de la tâche',
        'AddToFocus': 'Ajouter à ToDo',
        'SignIn': 'Connexion',
        'LogOut': 'Déconnexion',
        'Deadline': 'Date limite',
        'Never': 'Jamais',
        'NeverCleanup': 'Pas de nettoyage',
        'AutoArchiveSweep': 'Balayage automatique Archive',
        'ArchiveThreshold': 'Seuil d\'archivage',
        'ArchiveThresholdDesc': 'Déplacer vers les archives après inactivité.',
        'ArchiveDoneToTrash': 'Mise à la corbeille auto (terminées)',
        'ArchiveDoneToTrashDesc': 'Déplacer les tâches terminées de l\'archive vers la corbeille après la période spécifiée.',
        'ArchiveInactiveToTrash': 'Mise à la corbeille auto (inactives)',
        'ArchiveInactiveToTrashDesc': 'Déplacer les tâches inactives de l\'archive vers la corbeille après la période spécifiée.',
        'MovingToTrashSoon': 'Bientôt à la corbeille',
        'SyncAndBackup': 'Synchro & Sauvegarde',
        'LocalFolderLog': 'Log dossier local',
        'LocalFolderLogDesc': 'Active la sauvegarde CSV automatique.',
        'LocalDirectoryPath': 'Chemin dossier local',
        'NoFolderSelected': 'Aucun dossier sélectionné',
        'AuthorizeSession': 'Autoriser la session',
        'SelectFolder': 'Choisir dossier',
        'ManualLocalBackup': 'Sauvegarde locale manuelle',
        'SaveBackupToLocal': 'Enregistrer la sauvegarde',
        'LastSaved': 'Dernière sauvegarde',
        'DailyUpdateRecommendation': 'Recommandé : 1 mise à jour par jour',
        'DangerZone': 'Zone de danger',
        'ResetSettingsDesc': 'CRITICAL: Supprime TOUTES les tâches du cloud.',
        'ForceResetSettings': 'Effacer les données cloud',
        'PermissionNeeded': 'Autorisation requise pour continuer.',
        'ProjectFilter': 'Filtre projet',
        'FilterByProject': 'Filtrer par projet',
        'Syncing': 'Synchronisation...',
        'SyncActive': 'Synchro Active',
        'BackupNeeded': 'Sauvegarde requise',
        'Today': "Aujourd'hui",
        'WeekOf': 'Semaine du',
        'BackedUp': 'Sauvegardé',
        'SyncOff': 'Synchro Off',
        'SyncOffUppercase': 'SYNCHRO OFF',
        'year': 'Année',
        'month': 'Mois',
        'week': 'Semaine',
        'day': 'Jour',
        'AutomatedSyncStatus': 'Statut Synchro Auto',
        'LastSuccessfulLog': 'Dernier log réussi',
        'CommittingChanges': 'Enregistrement...',
        'AuthorizedLocalFolder': 'Dossier local autorisé',
        'RenameWorkspace': 'Renommer l\'espace de travail ?',
        'ForceBackupNow': 'Forcer sauvegarde',
        'Star': 'Important',
        'Maximize': 'Agrandir',
        'SystemActions': 'Actions système',
        'Metadata': 'Métadonnées',
        'Cancel': 'Annuler',
        'CommitChanges': 'Enregistrer',
        'DeleteConfirm': 'Supprimer définitivement ?',
        'DailyChoice': 'Choix quotidien',
        'ExtractDesc': 'Sélectionnez jusqu\'à {n} tâches prioritaires de ToDo pour les déplacer vers Focus.',
        'ExtractLimitAlert': 'Vous ne pouvez ajouter que {n} tâche(s) supplémentaire(s) à Focus.',
        'NoFocusTasks': 'Aucune tâche dans la liste ToDo.',
        'SetDailyFocus': 'Fixer le Focus du jour',
        'LastUpdatedLabel': 'Dernière mise à jour',
        'StatusNever': 'Jamais',
        'MarkDone': 'Marquer comme terminé',
        'MarkUndone': 'Remettre en attente',
      }
    };
    const lang = settings.language || 'en';
    let text = translations[lang]?.[key] || key;
    if (data) {
      Object.entries(data).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

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
    checkRedirectResult().catch((e) => {
      console.warn("Redirect check error:", e);
    });
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setMessage(null);
      }
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
          doneToTrashThresholdDays: data.doneToTrashThresholdDays || 7,
          trashCleanupThresholdDays: data.trashCleanupThresholdDays || 30,
          archiveDoneToTrashDays: data.archiveDoneToTrashDays !== undefined ? data.archiveDoneToTrashDays : 7,
          archiveInactiveToTrashDays: data.archiveInactiveToTrashDays !== undefined ? data.archiveInactiveToTrashDays : 99999,
          criticalThreshold: data.criticalThreshold || 100,
          isLocalBackupEnabled: data.isLocalBackupEnabled || false,
          localBackupPath: data.localBackupPath || '',
          displayMode: data.displayMode === 'card' ? 'standard' : (data.displayMode === 'list' ? 'compact' : (data.displayMode || 'standard')),
          displayModeFocus: data.displayModeFocus || 'standard',
          displayModeTodo: data.displayModeTodo || 'standard',
          language: data.language || 'en',
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
          doneToTrashThresholdDays: 7,
          trashCleanupThresholdDays: 30,
          archiveDoneToTrashDays: 7,
          archiveInactiveToTrashDays: 99999,
          criticalThreshold: 100,
          isLocalBackupEnabled: false,
          localBackupPath: '',
          displayMode: 'standard',
          displayModeFocus: 'standard',
          displayModeTodo: 'standard',
          language: 'en',
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

  const isListMode = settings.displayMode === 'compact';

  const projects = useMemo(() => {
    const sectionTasks = tasks.filter(t => t.section === activeSection || (!t.section && activeSection === settings.sections[0]));
    const p = Array.from(new Set(sectionTasks.map(t => t.project)));
    return ['All', ...p];
  }, [tasks, activeSection, settings.sections]);

  const stats = useMemo(() => {
    // Current workspace filter
    const isInActiveSection = (t: Task) => t.section === activeSection || (!t.section && activeSection === settings.sections[0]);
    
    // Global metrics (Urgent + Focus) - include all for threshold comparison but count active for load
    const priorityTasks = tasks.filter(t => (t.category === 'Focus' || t.category === 'Urgent'));
    const combinedCount = priorityTasks.filter(t => !t.isDone).length;
    
    const urgentCount = tasks.filter(t => t.category === 'Urgent' && !t.isDone).length;
    const activeTasksCount = tasks.filter(t => (t.category === 'Focus' || t.category === 'Urgent') && !t.isDone).length;
    
    // Per-section metrics (Urgent, Focus, Archive and Total in section)
    const sectionMetrics = settings.sections.reduce((acc, sec, idx) => {
      const sectionTasks = tasks.filter(t => (t.section === sec || (!t.section && idx === 0)));
      acc[sec] = {
        urgent: sectionTasks.filter(t => t.category === 'Urgent' && !t.isDone).length,
        focus: sectionTasks.filter(t => t.category === 'Focus' && !t.isDone).length,
        archive: sectionTasks.filter(t => t.category === 'Archive' && !t.isDone).length,
        total: sectionTasks.length
      };
      return acc;
    }, {} as Record<string, { urgent: number, focus: number, archive: number, total: number }>);
    
    const warningThreshold = Math.floor(settings.criticalThreshold * 0.7);
    let gaugeColor = 'bg-indigo-400';
    let textColor = 'text-white';
    
    if (combinedCount >= settings.criticalThreshold) {
      gaugeColor = 'bg-red-600';
      textColor = 'text-red-500 font-black';
    } else if (combinedCount >= warningThreshold) {
      gaugeColor = 'bg-orange-400';
      textColor = 'text-orange-400 font-black';
    }

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // Done today (Urgent + Focus)
    const doneTodayCount = tasks.filter(t => 
      t.isDone && 
      (t.category === 'Urgent' || t.category === 'Focus') && 
      t.updatedAt >= todayStart.getTime()
    ).length;
    
    let expiredCount = 0;
    let approachingCount = 0;
    
    priorityTasks.forEach(t => {
      if (t.deadline && !t.isDone) {
        if (t.deadline < now) {
          expiredCount++;
        } else if (t.deadline - now <= settings.deadlineThreshold * 86400000) {
          approachingCount++;
        }
      }
    });

    const loadPercentage = Math.round(Math.min((combinedCount / settings.criticalThreshold) * 100, 100));

    // Project distribution (filtered by active workspace)
    const projectStats: Record<string, { 
      urgent: { todo: number, done: number }, 
      focus: { todo: number, done: number }, 
      archive: { todo: number, done: number }, 
      trash: { todo: number, done: number },
      total: number,
      lastUpdated: number
    }> = {};

    tasks.filter(t => isInActiveSection(t)).forEach(t => {
      if (!projectStats[t.project]) {
        projectStats[t.project] = { 
          urgent: { todo: 0, done: 0 }, 
          focus: { todo: 0, done: 0 }, 
          archive: { todo: 0, done: 0 }, 
          trash: { todo: 0, done: 0 },
          total: 0,
          lastUpdated: 0
        };
      }
      
      const s = projectStats[t.project];
      s.total++;
      if ((t.updatedAt || 0) > s.lastUpdated) s.lastUpdated = t.updatedAt || 0;

      if (t.category === 'Urgent') {
        if (t.isDone) s.urgent.done++; else s.urgent.todo++;
      } else if (t.category === 'Focus') {
        if (t.isDone) s.focus.done++; else s.focus.todo++;
      } else if (t.category === 'Archive') {
        if (t.isDone) s.archive.done++; else s.archive.todo++;
      } else if (t.category === 'Trash') {
        if (t.isDone) s.trash.done++; else s.trash.todo++;
      }
    });

    return {
      active: activeTasksCount,
      doneToday: doneTodayCount,
      pendingDeadlines: approachingCount,
      expiredDeadlines: expiredCount,
      urgentCount,
      focusTasksCount: combinedCount,
      gaugeColor,
      textColor,
      warningThreshold,
      sectionMetrics,
      morningRoutineReady: urgentCount >= settings.urgentLimit,
      loadPercentage,
      projectStats
    };
  }, [tasks, settings, activeSection]);

  const pushToHistory = () => {
    if (isUndoing) return;
    // Deep clone tasks and settings, but wrap in try-catch to ensure consistency
    try {
      const tasksSnapshot = JSON.parse(JSON.stringify(tasks));
      const settingsSnapshot = JSON.parse(JSON.stringify(settings));
      setHistory(prev => [{ tasks: tasksSnapshot, settings: settingsSnapshot }, ...prev].slice(0, 50));
      setRedoStack([]);
    } catch (e) {
      console.warn("History push failed", e);
    }
  };

  const undo = async () => {
    if (history.length === 0 || !user || isUndoing) return;
    setIsUndoing(true);
    
    try {
      const prevState = history[0];
      const newHistory = history.slice(1);
      
      const currentTasksSnapshot = JSON.parse(JSON.stringify(tasks));
      const currentSettingsSnapshot = JSON.parse(JSON.stringify(settings));
      setRedoStack(prev => [{ tasks: currentTasksSnapshot, settings: currentSettingsSnapshot }, ...prev]);
      
      // Handle large batches by splitting
      const chunk = <T,>(arr: T[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      // 1. Delete tasks that exist now but not in previous state
      const prevIds = new Set(prevState.tasks.map((t: any) => t.id));
      const tasksToDelete = tasks.filter(t => !prevIds.has(t.id));
      const deleteChunks = chunk(tasksToDelete, 400);
      for (const c of deleteChunks) {
        const b = writeBatch(db);
        c.forEach(t => b.delete(doc(db, 'tasks', t.id)));
        await b.commit();
      }
      
      // 2. Restore previous state tasks
      const restoreChunks = chunk(prevState.tasks, 400);
      for (const c of restoreChunks) {
        const b = writeBatch(db);
        c.forEach((t: any) => {
          const { id, ...data } = t;
          b.set(doc(db, 'tasks', id), data);
        });
        await b.commit();
      }
      
      // 3. Restore settings
      await setDoc(doc(db, 'settings', user.uid), {
        userId: user.uid,
        ...prevState.settings
      });
      
      setHistory(newHistory);
    } catch (err) {
      console.error("Undo failed details:", err);
      setMessage({ text: `Undo failed: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
    } finally {
      setTimeout(() => setIsUndoing(false), 500);
    }
  };

  const redo = async () => {
    if (redoStack.length === 0 || !user || isUndoing) return;
    setIsUndoing(true);
    
    try {
      const nextState = redoStack[0];
      const newRedoStack = redoStack.slice(1);
      
      const currentTasksSnapshot = JSON.parse(JSON.stringify(tasks));
      const currentSettingsSnapshot = JSON.parse(JSON.stringify(settings));
      setHistory(prev => [{ tasks: currentTasksSnapshot, settings: currentSettingsSnapshot }, ...prev]);
      
      const chunk = <T,>(arr: T[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      const nextIds = new Set(nextState.tasks.map((t: any) => t.id));
      const tasksToDelete = tasks.filter(t => !nextIds.has(t.id));
      const deleteChunks = chunk(tasksToDelete, 400);
      for (const c of deleteChunks) {
        const b = writeBatch(db);
        c.forEach(t => b.delete(doc(db, 'tasks', t.id)));
        await b.commit();
      }
      
      const restoreChunks = chunk(nextState.tasks, 400);
      for (const c of restoreChunks) {
        const b = writeBatch(db);
        c.forEach((t: any) => {
          const { id, ...data } = t;
          b.set(doc(db, 'tasks', id), data);
        });
        await b.commit();
      }
      
      await setDoc(doc(db, 'settings', user.uid), {
        userId: user.uid,
        ...nextState.settings
      });
      
      setRedoStack(newRedoStack);
    } catch (err) {
      console.error("Redo failed details:", err);
      setMessage({ text: 'Redo failed', type: 'error' });
    } finally {
      setTimeout(() => setIsUndoing(false), 500);
    }
  };

  const dateLocale = useMemo(() => {
    if (settings.language === 'ja') return ja;
    if (settings.language === 'fr') return fr;
    return enUS;
  }, [settings.language]);

  const searchAndProjectFilteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           t.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject = selectedProject === 'All' ? true : (t.project === selectedProject);
      return matchesSearch && matchesProject;
    });
  }, [tasks, searchTerm, selectedProject]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             t.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        // Pinned tasks should respect project filter if one is active
        const matchesProject = selectedProject === 'All' ? true : (t.project === selectedProject);
        
        const matchesSection = t.section === activeSection || (!t.section && activeSection === settings.sections[0]);
        return matchesSearch && matchesProject && matchesSection;
      })
      .sort((a, b) => {
        // Universal Priority 1: Done state (lowest priority)
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;

        // If both are done, sort UNCONDITIONALLY by recency
        if (a.isDone && b.isDone) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        }

        // Universal Priority 2: Starred (starred first)
        const starA = !!a.isStarred;
        const starB = !!b.isStarred;
        if (starA !== starB) return starA ? -1 : 1;

        // Universal Priority 3: Recency (updatedAt descending)
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }, [tasks, searchTerm, selectedProject, activeSection, settings.sections]);

  const groupedFocusTasks = useMemo(() => {
    const focusTasks = filteredTasks.filter(t => t.category === 'Focus');
    const threshold = (settings.deadlineThreshold || 3) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Separate expired tasks (top priority)
    const expired = focusTasks
      .filter(t => t.deadline && (t.deadline - now) < 0 && !t.isDone);

    // Separate near deadline tasks (excluding expired ones) and sort by date
    const nearDeadline = focusTasks
      .filter(t => t.deadline && (t.deadline - now) <= threshold && (t.deadline - now) >= 0 && !t.isDone);
    
    // Separate pinned tasks (excluding those already in expired or near deadline)
    const pinned = focusTasks
      .filter(t => t.isPinned && !t.isDone && 
                   !(t.deadline && (t.deadline - now) < 0) &&
                   !(t.deadline && (t.deadline - now) <= threshold && (t.deadline - now) >= 0));
      
    // Others includes those without deadlines, far deadlines, non-pinned, or done tasks
    const others = focusTasks.filter(t => {
       const isExpired = t.deadline && (t.deadline - now) < 0 && !t.isDone;
       const isNear = t.deadline && (t.deadline - now) <= threshold && (t.deadline - now) >= 0 && !t.isDone;
       const isPinnedNotHandled = t.isPinned && !t.isDone && !isExpired && !isNear;
       return !isExpired && !isNear && !isPinnedNotHandled;
    });

    const grouped: Record<string, Task[]> = {};
    others.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return { expired, nearDeadline, pinned, grouped };
  }, [filteredTasks, settings.deadlineThreshold]);

  const groupedArchiveTasks = useMemo(() => {
    const now = Date.now();
    const oneMonth = 30 * 86400000;
    const threeMonths = 90 * 86400000;
    const sixMonths = 180 * 86400000;
    const oneYear = 365 * 86400000;
    
    const archiveTasks = filteredTasks.filter(t => {
      if (t.category !== 'Archive') return false;
      const age = now - (t.updatedAt || t.createdAt);
      if (archiveFilter === '1m') return age >= oneMonth;
      if (archiveFilter === '3m') return age >= threeMonths;
      if (archiveFilter === '6m') return age >= sixMonths;
      if (archiveFilter === '1y') return age >= oneYear;
      return true;
    });

    const isNearingTrash = (t: Task) => {
      const inactiveDays = differenceInDays(now, t.updatedAt || t.createdAt);
      const isDoneNearing = t.isDone && settings.archiveDoneToTrashDays !== 99999 && (settings.archiveDoneToTrashDays - inactiveDays <= 3);
      const isInactiveNearing = settings.archiveInactiveToTrashDays !== 99999 && (settings.archiveInactiveToTrashDays - inactiveDays <= 3);
      return isDoneNearing || isInactiveNearing;
    };

    // Special category for items nearing auto-move to trash (3 days)
    const nearingPurge = archiveTasks
      .filter(isNearingTrash)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const nonNearing = archiveTasks.filter(t => !isNearingTrash(t));

    // Separate pinned tasks
    const pinned = nonNearing
      .filter(t => t.isPinned)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const others = nonNearing.filter(t => !t.isPinned);

    const grouped: Record<string, Task[]> = {};
    others.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return { nearingPurge, pinned, grouped };
  }, [filteredTasks, settings.archiveDoneToTrashDays, settings.archiveInactiveToTrashDays, archiveFilter]);

  const groupedTrashTasks = useMemo(() => {
    const now = Date.now();
    const oneWeek = 7 * 86400000;
    const twoWeeks = 14 * 86400000;

    const trashTasks = filteredTasks.filter(t => {
      if (t.category !== 'Trash') return false;
      const age = now - (t.updatedAt || t.createdAt);
      if (trashFilter === '1w') return age >= oneWeek;
      if (trashFilter === '2w') return age >= twoWeeks;
      return true;
    });

    // Special category for items nearing auto-purge (3 days)
    const nearingPurge = trashTasks
      .filter(t => {
        if (settings.trashCleanupThresholdDays === 99999) return false;
        const inactiveDays = differenceInDays(now, t.updatedAt || t.createdAt);
        return settings.trashCleanupThresholdDays - inactiveDays <= 3;
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const others = trashTasks.filter(t => {
      if (settings.trashCleanupThresholdDays === 99999) return true;
      const inactiveDays = differenceInDays(now, t.updatedAt || t.createdAt);
      return settings.trashCleanupThresholdDays - inactiveDays > 3;
    });

    const grouped: Record<string, Task[]> = {};
    others.forEach(t => {
      if (!grouped[t.project]) grouped[t.project] = [];
      grouped[t.project].push(t);
    });
    return { nearingPurge, grouped };
  }, [filteredTasks, trashFilter, settings.trashCleanupThresholdDays]);

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
      isStarred: false,
      isAllDay: isTaskAllDay
    };

    if (newTaskDeadline) {
      let deadlineTimestamp = new Date(newTaskDeadline).getTime();
      if (isTaskAllDay) {
        const d = new Date(newTaskDeadline);
        d.setHours(23, 59, 59, 999);
        deadlineTimestamp = d.getTime();
      }
      if (!isNaN(deadlineTimestamp)) {
        newTask.deadline = deadlineTimestamp;
      }
    }

    try {
      pushToHistory();
      await addDoc(collection(db, 'tasks'), newTask);
      setNewTaskTitle('');
      setNewTaskProject('');
      setNewTaskNotes('');
      setNewTaskUrls(['']);
      setNewTaskDeadline('');
      setIsTaskAllDay(true);
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
          const errMsg = `Urgent Capacity Full: You have reached the ${settings.urgentLimit} task limit. Complete or archive an existing task first.`;
          alert(errMsg); // More prominent alert
          setMessage({ 
            text: errMsg,
            type: 'error'
          });
          return;
        }
      }
    }
    try {
      pushToHistory();
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
      pushToHistory();
      await updateDoc(doc(db, 'tasks', id), { 
        ...updates, 
        updatedAt: Date.now() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const toggleDone = async (id: string) => {
    if (!user) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      pushToHistory();
      const isBecomingDone = !task.isDone;
      const updates: any = { 
        isDone: isBecomingDone, 
        updatedAt: Date.now() 
      };

      // Auto-move from Focus (Urgent) to ToDo (Focus) if checked
      if (isBecomingDone && task.category === 'Urgent') {
        updates.category = 'Focus';
      }

      await updateDoc(doc(db, 'tasks', id), updates);
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
        pushToHistory();
        await deleteDoc(doc(db, 'tasks', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
      }
    } else {
      // Move to trash
      try {
        pushToHistory();
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
      pushToHistory();
      await updateDoc(doc(db, 'tasks', id), { 
        isStarred: !task.isStarred, 
        updatedAt: Date.now() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const togglePin = async (id: string) => {
    if (!user) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      pushToHistory();
      await updateDoc(doc(db, 'tasks', id), { 
        isPinned: !task.isPinned, 
        updatedAt: Date.now() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const addSection = async (name: string) => {
    if (!user || !name.trim()) return;
    const trimmedName = name.trim();
    const next = [...settings.sections, trimmedName];
    try {
      await updateDoc(doc(db, 'settings', user.uid), { sections: next });
      setActiveSection(trimmedName);
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

  const onSectionDragEnd = async (result: any) => {
    if (!result.destination || !user) return;
    const items = Array.from(settings.sections);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    try {
      await updateDoc(doc(db, 'settings', user.uid), { sections: items });
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
    
    // Respect active filters (Project, Section, and Time Filter)
    const now = Date.now();
    const oneWeek = 7 * 86400000;
    const twoWeeks = 14 * 86400000;

    const trashTasksVisible = filteredTasks.filter(t => {
      if (t.category !== 'Trash') return false;
      const age = now - (t.updatedAt || t.createdAt);
      if (trashFilter === '1w') return age >= oneWeek;
      if (trashFilter === '2w') return age >= twoWeeks;
      return true;
    });

    if (trashTasksVisible.length === 0) {
      setMessage({ text: "No trash items match current filter criteria.", type: 'info' });
      return;
    }

    if (!window.confirm(`Permanently delete ${trashTasksVisible.length} items matching current filters? This cannot be undone.`)) return;

    try {
      pushToHistory();
      const batch = writeBatch(db);
      trashTasksVisible.forEach(t => {
        batch.delete(doc(db, 'tasks', t.id));
      });
      await batch.commit();
      setMessage({ text: `${trashTasksVisible.length} items permanently deleted.`, type: 'info' });
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

  const handleSignIn = (tab: 'google' | 'email' | 'signup' | 'reset' = 'google') => {
    setAuthModalInitialTab(tab);
    setIsAuthModalOpen(true);
  };

  const handleLinkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingPassword || linkingPassword.length < 6) {
      setLinkingMessage({ 
        text: settings.language === 'ja' 
          ? 'パスワードは6文字以上で入力してください。' 
          : 'Password must be at least 6 characters.',
        type: 'error' 
      });
      return;
    }
    setIsLinkingLoading(true);
    setLinkingMessage(null);
    try {
      await linkEmailPasswordToCurrentUser(linkingPassword);
      setLinkingMessage({ 
        text: settings.language === 'ja'
          ? 'メールとパスワードを正常に連携しました！大学Wi-Fi等の制限環境でも、このメールアドレスと設定したパスワードでログインできます。'
          : 'Successfully linked password! You can now log in via email and this password on campus Wi-Fi.',
        type: 'success' 
      });
      setLinkingPassword('');
      setShowPasswordChange(false);
      if (auth.currentUser) {
        await auth.currentUser.reload();
        setUser({ ...auth.currentUser });
      }
    } catch (err: any) {
      setLinkingMessage({ 
        text: err?.message || (settings.language === 'ja' ? '連携に失敗しました。' : 'Failed to link password.'),
        type: 'error' 
      });
    } finally {
      setIsLinkingLoading(false);
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

    // Automatic backup before import
    await triggerEmergencyBackup();

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

  const downloadBackup = async () => {
    const csv = getCSVData();
    const userPart = user?.email?.split('@')[0] || 'local';
    const fileName = `NavFOR_Log_${userPart}_Manual.csv`;
    const now = Date.now();

    try {
      if ((window as any).showSaveFilePicker) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'CSV File',
            accept: { 'text/csv': ['.csv'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(csv);
        await writable.close();
      } else {
        // Fallback for older browsers or restricted environments
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      
      setLastBackupTime(now);
      localStorage.setItem('trifocus_last_backup', now.toString());
      setMessage({ text: "Backup saved successfully.", type: 'info' });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Backup Save Error", err);
        setMessage({ text: `Save Failed: ${err.message}`, type: 'error' });
      }
    }
  };

  const selectBackupFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        setMessage({ 
          text: "Safari Notice: Full folder sync is not supported by Safari yet. Please use Chrome/Edge for auto-sync, or use 'Manual Local Backup' below to save your data.",
          type: 'info'
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

  const syncToLocalSystem = async (manual = false, customName?: string) => {
    if (!settings.isLocalBackupEnabled || tasks.length === 0 || !dirHandle) {
      if (manual && !dirHandle) setMessage({ text: "Please select a backup folder first.", type: 'error' });
      return;
    }

    setIsSyncing(true);
    try {
      const csvContent = getCSVData();
      const userPart = user?.email?.split('@')[0] || 'local';
      const fileName = customName || `NavFOR_Log_${userPart}.csv`;
      
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(csvContent);
      await writable.close();
      
      setLastSyncTime(Date.now());
      if (manual) setMessage({ text: customName ? `Emergency backup created: ${fileName}` : "Log saved to selected folder.", type: 'info' });
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
    if (settings.isLocalBackupEnabled && tasks.length > 0) {
      if (dirHandle) {
        const timer = setTimeout(() => {
          syncToLocalSystem();
        }, 5000); // 5s debounce
        return () => clearTimeout(timer);
      } else if (!window.showDirectoryPicker) {
        // Safari fallback: If it's been more than 4 hours since last backup, 
        // we can't auto-save but we can notify the user more strongly.
        const fourHours = 4 * 60 * 60 * 1000;
        if (Date.now() - lastBackupTime > fourHours) {
          // Just a subtle hint in the state or message if they are active
        }
      }
    }
  }, [tasks, settings.isLocalBackupEnabled, dirHandle, lastBackupTime]);

  // Safari/PWA Persistence Request
  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) console.log("Storage persistence granted");
      });
    }
  }, []);

  // Done to Trash Auto-Move Effect
  useEffect(() => {
    if (!user || settings.doneToTrashThresholdDays === 99999) return;

    const cleanup = async () => {
      const now = Date.now();
      const thresholdMs = settings.doneToTrashThresholdDays * 24 * 60 * 60 * 1000;
      
      const tasksToTrash = tasks.filter(t => 
        t.isDone && 
        t.category !== 'Archive' && 
        t.category !== 'Trash' && 
        (t.updatedAt || t.createdAt) < (now - thresholdMs)
      );

      if (tasksToTrash.length > 0) {
        console.log(`Auto-moving ${tasksToTrash.length} done tasks to trash`);
        try {
          const batch = writeBatch(db);
          tasksToTrash.forEach(t => {
            batch.update(doc(db, 'tasks', t.id), { 
              category: 'Trash',
              updatedAt: now 
            });
          });
          await batch.commit();
        } catch (err) {
          console.error("Auto-trash error", err);
        }
      }
    };

    const timer = setTimeout(cleanup, 10000); // Wait 10s after load/change
    return () => clearTimeout(timer);
  }, [tasks, settings.doneToTrashThresholdDays, user]);

  // ToDo to Archive Auto-Move Effect
  useEffect(() => {
    if (!user || settings.archiveThresholdDays === 99999) return;

    const cleanup = async () => {
      const now = Date.now();
      const thresholdMs = settings.archiveThresholdDays * 24 * 60 * 60 * 1000;
      
      const tasksToArchive = tasks.filter(t => 
        t.category !== 'Archive' && 
        t.category !== 'Trash' && 
        (t.updatedAt || t.createdAt) < (now - thresholdMs)
      );

      if (tasksToArchive.length > 0) {
        console.log(`Auto-archiving ${tasksToArchive.length} inactive tasks`);
        try {
          const batch = writeBatch(db);
          tasksToArchive.forEach(t => {
            batch.update(doc(db, 'tasks', t.id), { 
              category: 'Archive',
              updatedAt: now 
            });
          });
          await batch.commit();
        } catch (err) {
          console.error("Auto-archive error", err);
        }
      }
    };

    const timer = setTimeout(cleanup, 12000); // Wait 12s (staggered with done-to-trash)
    return () => clearTimeout(timer);
  }, [tasks, settings.archiveThresholdDays, user]);

  // Trash Auto-Cleanup Effect
  useEffect(() => {
    if (!user || tasks.length === 0 || settings.trashCleanupThresholdDays === 99999) return;

    const cleanupTrash = async () => {
      const now = Date.now();
      const thresholdMs = settings.trashCleanupThresholdDays * 24 * 60 * 60 * 1000;
      const expiredTrash = tasks.filter(t => t.category === 'Trash' && (now - t.updatedAt) > thresholdMs);
      
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
  }, [user, tasks, settings.trashCleanupThresholdDays]);

  // Archive Done to Trash Auto-Move Effect
  useEffect(() => {
    if (!user || settings.archiveDoneToTrashDays === 99999) return;

    const cleanup = async () => {
      const now = Date.now();
      const thresholdMs = settings.archiveDoneToTrashDays * 24 * 60 * 60 * 1000;
      
      const tasksToTrash = tasks.filter(t => 
        t.category === 'Archive' &&
        t.isDone && 
        (t.updatedAt || t.createdAt) < (now - thresholdMs)
      );

      if (tasksToTrash.length > 0) {
        console.log(`Auto-moving ${tasksToTrash.length} done archive tasks to trash`);
        try {
          const batch = writeBatch(db);
          tasksToTrash.forEach(t => {
            batch.update(doc(db, 'tasks', t.id), { 
              category: 'Trash',
              updatedAt: now 
            });
          });
          await batch.commit();
        } catch (err) {
          console.error("Auto-trash archive error", err);
        }
      }
    };

    const timer = setTimeout(cleanup, 11000); // Staggered timer
    return () => clearTimeout(timer);
  }, [tasks, settings.archiveDoneToTrashDays, user]);

  // Archive Inactive to Trash Auto-Move Effect
  useEffect(() => {
    if (!user || settings.archiveInactiveToTrashDays === 99999) return;

    const cleanup = async () => {
      const now = Date.now();
      const thresholdMs = settings.archiveInactiveToTrashDays * 24 * 60 * 60 * 1000;
      
      const tasksToTrash = tasks.filter(t => 
        t.category === 'Archive' &&
        (t.updatedAt || t.createdAt) < (now - thresholdMs)
      );

      if (tasksToTrash.length > 0) {
        console.log(`Auto-moving ${tasksToTrash.length} inactive archive tasks to trash`);
        try {
          const batch = writeBatch(db);
          tasksToTrash.forEach(t => {
            batch.update(doc(db, 'tasks', t.id), { 
              category: 'Trash',
              updatedAt: now 
            });
          });
          await batch.commit();
        } catch (err) {
          console.error("Auto-trash inactive archive error", err);
        }
      }
    };

    const timer = setTimeout(cleanup, 13000); // Staggered timer
    return () => clearTimeout(timer);
  }, [tasks, settings.archiveInactiveToTrashDays, user]);

  const cleanupArchive = async (thresholdDays?: number) => {
    if (!user) return;
    try {
      const now = Date.now();
      
      let activeThreshold = thresholdDays;
      if (!activeThreshold) {
        if (archiveFilter === '1m') activeThreshold = 30;
        else if (archiveFilter === '3m') activeThreshold = 90;
        else if (archiveFilter === '6m') activeThreshold = 180;
        else if (archiveFilter === '1y') activeThreshold = 365;
      }
      
      const cutoff = activeThreshold ? now - (activeThreshold * 24 * 60 * 60 * 1000) : null;
      
      // Respect project and section filters by using filteredTasks
      const archiveTasks = filteredTasks.filter(t => {
        if (t.category !== 'Archive') return false;
        if (!cutoff) return true;
        return (t.updatedAt || t.createdAt) < cutoff;
      });

      if (archiveTasks.length === 0) {
        setMessage({ text: "No tasks match current filter criteria.", type: 'info' });
        return;
      }

      if (!window.confirm(`Move ${archiveTasks.length} archived items matching current filters to Trash?`)) return;
      
      pushToHistory();

      const batch = writeBatch(db);
      archiveTasks.forEach(task => {
        batch.update(doc(db, 'tasks', task.id), { 
          category: 'Trash',
          updatedAt: Date.now()
        });
      });
      await batch.commit();
      setMessage({ text: `Archive cleanup complete: ${archiveTasks.length} items moved to Trash.`, type: 'info' });
    } catch (err: any) {
      console.error("Archive cleanup error", err);
      setMessage({ text: `Archive Error: ${err.message}`, type: 'error' });
    }
  };

  const triggerEmergencyBackup = async () => {
    const userPart = user?.email?.split('@')[0] || 'user';
    const backupName = `NavFOR_Log_${userPart}_backup.csv`;
    
    if (settings.isLocalBackupEnabled && dirHandle) {
      await syncToLocalSystem(true, backupName);
    } else {
      // Fallback to browser download if sync not active
      exportTasks(backupName);
    }
  };

  const purgeAllData = async () => {
    if (!user) return;
    if (!window.confirm("CRITICAL: FULL CLOUD PURGE. This will delete EVERY task and reset your workspaces to default. A backup will be attempted first. Proceed?")) return;

    try {
      pushToHistory();
      await triggerEmergencyBackup();
      setMessage({ text: "Purge started. Clearing cloud data and resetting workspaces...", type: 'info' });
      
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

      // Reset workspaces/sections to General
      await updateDoc(doc(db, 'settings', user.uid), {
        sections: ['General']
      });

      localStorage.clear();
      sessionStorage.clear();
      
      setMessage({ text: `Purge ended: ${successCount} tasks deleted. Workspaces reset to General.`, type: 'info' });
      
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

  const purgeSectionData = async () => {
    if (!user || !activeSection) return;
    if (!window.confirm(`Are you sure you want to delete ALL tasks in the workspace "${activeSection}"? A backup will be attempted first.`)) return;

    try {
      pushToHistory();
      await triggerEmergencyBackup();
      setMessage({ text: `Purging workspace "${activeSection}"...`, type: 'info' });

      const workspaceTasks = tasks.filter(t => t.section === activeSection || (!t.section && activeSection === settings.sections[0]));
      
      let successCount = 0;
      let failCount = 0;

      for (const t of workspaceTasks) {
        try {
          await deleteDoc(doc(db, 'tasks', t.id));
          successCount++;
        } catch (err) {
          console.error(`Failed to delete task ${t.id}:`, err);
          failCount++;
        }
      }

      setMessage({ text: `Workspace Purge Complete: ${successCount} deleted, ${failCount} failed.`, type: 'info' });
    } catch (err: any) {
      console.error("Workspace Purge Error:", err);
      setMessage({ text: `Purge Error: ${err.message}`, type: 'error' });
    }
  };

  const forceResetSettings = async () => {
    if (!user) return;
    if (!window.confirm("RESET SETTINGS: This will reset all thresholds, limits, and cleanup preferences to factory defaults. Your workspaces and tasks will NOT be affected. Proceed?")) return;

    try {
      setMessage({ text: "Resetting system settings...", type: 'info' });
      
      const defaultThresholds = {
        urgentLimit: 3,
        deadlineThreshold: 3,
        archiveThresholdDays: 30,
        doneToTrashThresholdDays: 7,
        trashCleanupThresholdDays: 30,
        archiveDoneToTrashDays: 7,
        archiveInactiveToTrashDays: 99999,
        criticalThreshold: 100
      };

      await updateDoc(doc(db, 'settings', user.uid), defaultThresholds);
      
      // Update local state too to avoid full reload if possible, but the current code reloads.
      // Let's stick to reload for consistency with how it clear caches.
      
      localStorage.removeItem('trifocus_last_backup');
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `settings/${user.uid}`);
    }
  };

  const exportTasks = (fileName?: string) => {
    try {
      const csvContent = getCSVData();
      const userPart = user?.email?.split('@')[0] || 'user';
      const defaultName = fileName || `TaskManager_Export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', defaultName);
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
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex justify-between items-center shrink-0 relative z-[100]">
        {/* Left Side: Logo & Workspace Menu */}
        <div className="flex items-center gap-4 md:gap-8">
          <div className="relative">
            <button 
              onClick={() => setShowSectionMenu(!showSectionMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer group"
            >
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center transition-transform shadow-lg shadow-indigo-100 group-active:scale-95 overflow-hidden border border-slate-100">
                <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <div className="flex flex-col items-start leading-none">
                <h1 className="text-sm font-black tracking-tighter text-slate-800 uppercase">
                  NavFOR <span className="text-indigo-600">v{APP_VERSION}</span>
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
                  <DragDropContext onDragEnd={onSectionDragEnd}>
                    <Droppable droppableId="sections">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="max-h-[350px] overflow-y-auto custom-scrollbar">
                          {settings.sections.map((s, index) => (
                            <Draggable key={s} draggableId={s} index={index}>
                              {(provided, snapshot) => (
                                <div 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={cn(
                                    "group/item flex items-center border-b border-slate-50 last:border-0",
                                    snapshot.isDragging && "bg-white shadow-xl border border-indigo-200 rounded-lg z-[100]"
                                  )}
                                >
                                  <div {...provided.dragHandleProps} className="pl-3 pr-1 text-slate-300 hover:text-slate-400 cursor-grab active:cursor-grabbing">
                                    <GripVertical size={14} />
                                  </div>
                                  <button 
                                    onClick={() => {
                                      setActiveSection(s);
                                      setShowSectionMenu(false);
                                    }}
                                    className={cn(
                                      "flex-1 text-left px-2 py-3.5 text-xs font-bold transition-all flex items-center justify-between",
                                      activeSection === s ? "text-indigo-600" : "text-slate-600 hover:bg-slate-50"
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
                                        const name = window.prompt(t('RenameWorkspace'), s);
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
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Side: Desktop Nav & Tools & User */}
        <div className="flex items-center gap-2">
          {user && (
            <>
              {/* Desktop Dashboard/Archive/Trash/Settings Buttons */}
              <nav className="hidden lg:flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 mr-2">
                <button 
                  onClick={() => setViewMode('dashboard')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-tighter transition-all",
                    viewMode === 'dashboard' ? "bg-white text-indigo-600 shadow-sm border border-indigo-50" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {t('Dashboard')}
                </button>
                <button 
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-tighter transition-all",
                    viewMode === 'calendar' ? "bg-white text-indigo-600 shadow-sm border border-indigo-50" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {t('Calendar')}
                </button>
                <button 
                  onClick={() => setViewMode('archive')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-tighter transition-all",
                    viewMode === 'archive' ? "bg-white text-indigo-600 shadow-sm border border-indigo-50" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {t('Archive')}
                </button>
                <button 
                  onClick={() => setViewMode('trash')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-tighter transition-all",
                    viewMode === 'trash' ? "bg-white text-red-500 shadow-sm border border-red-50" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {t('Trash')}
                </button>
                <button 
                  onClick={() => setViewMode('settings')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-tighter transition-all",
                    viewMode === 'settings' ? "bg-white text-indigo-600 shadow-sm border border-indigo-50" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {t('Settings')}
                </button>
              </nav>

              <div className="flex items-center gap-2 mr-0 md:mr-2">
                {/* Undo/Redo - Visible on Mobile */}
                <div className="flex bg-slate-50 border border-slate-100 rounded-xl p-0.5 mr-1 max-sm:scale-90">
                  <button 
                    onClick={undo}
                    disabled={history.length === 0 || isUndoing}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      history.length > 0 ? "text-indigo-600 hover:bg-white hover:shadow-sm" : "text-slate-300 cursor-not-allowed"
                    )}
                    title="Undo"
                  >
                    <Undo2 size={14} className={cn(isUndoing && "animate-spin")} />
                  </button>
                  <button 
                    onClick={redo}
                    disabled={redoStack.length === 0 || isUndoing}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      redoStack.length > 0 ? "text-indigo-600 hover:bg-white hover:shadow-sm" : "text-slate-300 cursor-not-allowed"
                    )}
                    title="Redo"
                  >
                    <Redo2 size={14} />
                  </button>
                </div>

                {/* Other Desktop-only tools */}
                <div className="hidden md:flex items-center gap-1">
                  {/* Display Mode Toggle */}
                  <div className="flex bg-slate-50 border border-slate-100 rounded-xl p-0.5 whitespace-nowrap">
                  <button 
                    onClick={() => saveSettings({ displayMode: 'large', displayModeFocus: 'large', displayModeTodo: 'large' })}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      settings.displayMode === 'large' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                    title={t('LargeView')}
                  >
                    <Grid2X2 size={14} />
                  </button>
                  <button 
                    onClick={() => saveSettings({ displayMode: 'standard', displayModeFocus: 'standard', displayModeTodo: 'standard' })}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      settings.displayMode === 'standard' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                    title={t('StandardView')}
                  >
                    <LayoutGrid size={14} />
                  </button>
                  <button 
                    onClick={() => saveSettings({ displayMode: 'compact', displayModeFocus: 'compact', displayModeTodo: 'compact' })}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      settings.displayMode === 'compact' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                    title={t('CompactView')}
                  >
                    <LayoutList size={14} />
                  </button>
                </div>

                {/* Project Filter */}
                <div className="relative">
                  <button 
                    onClick={() => setShowProjectFilter(!showProjectFilter)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all",
                      selectedProject !== 'All' ? "bg-indigo-100 border-indigo-200 text-indigo-700 shadow-sm" : "bg-slate-50/50 border-slate-100 hover:bg-white text-slate-500"
                    )}
                  >
                    <Filter size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                      {selectedProject === 'All' ? t('ProjectFilter') : selectedProject}
                    </span>
                  </button>
                  {showProjectFilter && (
                    <>
                      <div className="fixed inset-0 z-[65]" onClick={() => setShowProjectFilter(false)} />
                      <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[70] py-2 overflow-hidden">
                        <div className="px-4 py-1.5 border-b border-slate-50 mb-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">{t('FilterByProject')}</p>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                          {projects.map(p => (
                            <button
                              key={p}
                              onClick={() => {
                                setSelectedProject(p);
                                setShowProjectFilter(false);
                              }}
                              className={cn(
                                "w-full text-left px-4 py-2.5 text-[10px] font-bold transition-all flex items-center justify-between",
                                selectedProject === p ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              <span className="truncate">{p}</span>
                              {selectedProject === p && <CheckCircle2 size={12} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Sync Toggle */}
                <div className="relative ml-1">
                  <button 
                    onClick={() => {
                      if (!dirHandle) {
                        if (!window.showDirectoryPicker) {
                          downloadBackup();
                        } else {
                          selectBackupFolder();
                        }
                      } else {
                        syncToLocalSystem(true);
                        setShowSyncDetails(!showSyncDetails);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all",
                      dirHandle ? "bg-emerald-50 border-emerald-100" : (
                        !window.showDirectoryPicker && (!lastBackupTime || Date.now() - lastBackupTime > 24*60*60*1000)
                        ? "bg-amber-50 border-amber-100 animate-pulse"
                        : "bg-slate-50/50 border-slate-100 hover:bg-white"
                      )
                    )}
                  >
                    <Globe size={12} className={cn(
                      isSyncing ? "text-indigo-500 animate-spin" : (
                        dirHandle ? "text-emerald-500" : (
                          !window.showDirectoryPicker && (!lastBackupTime || Date.now() - lastBackupTime > 24*60*60*1000)
                          ? "text-amber-500"
                          : "text-slate-300"
                        )
                      )
                    )} />
                    <span className={cn("text-[10px] font-bold uppercase tracking-tighter", 
                      dirHandle ? "text-emerald-600" : (
                        !window.showDirectoryPicker && (!lastBackupTime || Date.now() - lastBackupTime > 24*60*60*1000)
                        ? "text-amber-600"
                        : "text-slate-500"
                      )
                    )}>
                      {isSyncing ? t('Syncing') : (
                        dirHandle ? t('SyncActive') : (
                          !window.showDirectoryPicker ? (
                            !lastBackupTime || Date.now() - lastBackupTime > 24*60*60*1000 ? t('BackupNeeded') : t('BackedUp')
                          ) : t('SyncOffUppercase')
                        )
                      )}
                    </span>
                  </button>
                  
                  {showSyncDetails && dirHandle && (
                    <>
                      <div className="fixed inset-0 z-[55]" onClick={() => setShowSyncDetails(false)} />
                      <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[60] p-4">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-50">
                          <div className="flex items-center gap-2 text-slate-800">
                            <Activity size={12} className="text-indigo-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest">{t('AutomatedSyncStatus')}</p>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); syncToLocalSystem(true); }}
                            className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-indigo-600"
                            title={t('ForceBackupNow')}
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
                            <span>{t('LastSuccessfulLog')}:</span>
                            <span className="text-slate-900 border-b border-indigo-100">
                              {lastSyncTime ? format(lastSyncTime, 'HH:mm:ss') : 'Waiting...'}
                            </span>
                          </div>
                          {isSyncing && (
                            <div className="flex items-center gap-1 text-[9px] text-indigo-600 font-bold animate-pulse">
                              <RefreshCcw size={10} className="animate-spin" /> {t('CommittingChanges')}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Tools (Simplified) */}
              <div className="md:hidden flex items-center gap-2">
                {/* Project Filter (Mobile) */}
                <div className="relative">
                  <button 
                    onClick={() => setShowProjectFilter(!showProjectFilter)}
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center border transition-all shadow-sm",
                      selectedProject !== 'All' ? "bg-indigo-600 border-indigo-700 text-white" : "bg-white border-slate-200 text-slate-400"
                    )}
                  >
                    <Filter size={16} />
                  </button>
                  {showProjectFilter && (
                    <>
                      <div className="fixed inset-0 z-[65]" onClick={() => setShowProjectFilter(false)} />
                      <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[70] py-2 overflow-hidden">
                        <div className="px-4 py-1.5 border-b border-slate-50 mb-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">{t('FilterByProject')}</p>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                          {projects.map(p => (
                            <button
                              key={p}
                              onClick={() => {
                                setSelectedProject(p);
                                setShowProjectFilter(false);
                              }}
                              className={cn(
                                "w-full text-left px-4 py-2.5 text-[10px] font-bold transition-all flex items-center justify-between",
                                selectedProject === p ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              <span className="truncate">{p}</span>
                              {selectedProject === p && <CheckCircle2 size={12} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button 
                  onClick={() => {
                    const next: 'compact' | 'standard' | 'large' = 
                      settings.displayMode === 'standard' ? 'large' : 
                      settings.displayMode === 'large' ? 'compact' : 'standard';
                    saveSettings({ displayMode: next });
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-400 shadow-sm"
                >
                  {settings.displayMode === 'compact' ? <LayoutList size={16} /> : 
                   settings.displayMode === 'large' ? <Grid2X2 size={16} /> : <LayoutGrid size={16} />}
                </button>
              </div>
            </>
          )}

          {/* User Profile / LogOut */}
          <div className="flex items-center gap-2 border-l border-slate-100 pl-4 ml-2">
            {user ? (
              <>
                <div className="text-right flex flex-col items-end leading-none hidden sm:flex">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500/50 mb-0.5">{t('Authenticated')}</span>
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
                  title={t('LogOut')}
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <button 
                onClick={() => handleSignIn('google')}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <LogIn size={16} />
                <span className="hidden sm:inline">{t('Sign In')}</span>
              </button>
            )}
          </div>
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
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Entry')}</span>
          </button>
          <button 
            onClick={() => { setViewMode('dashboard'); setMobileView('urgent'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'dashboard' && mobileView === 'urgent' ? "text-red-500" : "text-slate-400")}
          >
            <Zap size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Urgent')}</span>
          </button>
          <button 
            onClick={() => { setViewMode('dashboard'); setMobileView('focus'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'dashboard' && mobileView === 'focus' ? "text-indigo-600" : "text-slate-400")}
          >
            <Target size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Focus')}</span>
          </button>
          <button 
            onClick={() => { setViewMode('calendar'); setMobileView('calendar'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'calendar' ? "text-indigo-600" : "text-slate-400")}
          >
            <Calendar size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Calendar')}</span>
          </button>
          <button 
            onClick={() => { setViewMode('archive'); setMobileView('archive'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'archive' ? "text-indigo-600" : "text-slate-400")}
          >
            <ArchiveIcon size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Archive')}</span>
          </button>
          <button 
            onClick={() => { setViewMode('trash'); setMobileView('trash'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'trash' ? "text-red-500" : "text-slate-400")}
          >
            <Trash2 size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Trash')}</span>
          </button>
          <button 
            onClick={() => { setViewMode('settings'); setMobileView('settings'); }}
            className={cn("flex flex-col items-center gap-1 transition-colors", viewMode === 'settings' ? "text-indigo-600" : "text-slate-400")}
          >
            <SettingsIcon size={20} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('Settings')}</span>
          </button>
        </div>

        {/* Sidebar / Input Section */}
        <aside className={cn(
          "col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar pb-24 lg:pb-0",
          (viewMode !== 'dashboard' || mobileView !== 'summary') && "hidden lg:flex"
        )}>
          {!user ? (
            <div className="bg-indigo-600 rounded-2xl p-8 text-white flex flex-col items-center text-center gap-6 shadow-xl shadow-indigo-100">
              <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center">
                <Target size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Sync to Cloud</h3>
                <p className="text-sm opacity-80 leading-relaxed">Sign in to securely access your NavFOR system across all devices with real-time sync.</p>
              </div>
              <button 
                onClick={() => handleSignIn('google')}
                className="w-full py-3.5 bg-white text-indigo-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2.5 active:scale-95 shadow-md"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="" />
                <span>{t('ContinueWithGoogle')}</span>
              </button>
              <button 
                onClick={() => handleSignIn('email')}
                className="text-xs text-indigo-100 hover:text-white underline underline-offset-2 transition-colors font-medium -mt-2 flex items-center gap-1.5"
              >
                <Mail size={13} />
                <span>
                  {settings.language === 'ja' 
                    ? 'メールログイン / 連携' 
                    : settings.language === 'fr'
                    ? 'Connexion e-mail / Lier'
                    : 'Email Login / Link'}
                </span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{t('TaskEntry')}</h2>
                {/* Desktop layout title helper */}
                <div className="hidden lg:block h-3" />
              </div>
              <form onSubmit={handleAddTask} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">{t('ProjectCode')} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input 
                      list="project-suggestions"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={t('ExampleProjects')}
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
                  <label className="text-xs font-semibold text-slate-600">{t('TaskDetail')} <span className="text-red-500">*</span></label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none" 
                    placeholder={t('DetailsPlaceholder')}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest text-[9px] opacity-60 flex items-center justify-between">
                    <span>{t('Memos')}</span>
                    <button 
                      type="button" 
                      onClick={() => setIsNewTaskMemoExpanded(!isNewTaskMemoExpanded)}
                      className="text-indigo-600 hover:underline p-1"
                    >
                      {isNewTaskMemoExpanded ? t('Shrink') : t('Expand')}
                    </button>
                  </label>
                  <textarea 
                    className={cn(
                      "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all duration-300",
                      isNewTaskMemoExpanded ? "h-64" : "h-16"
                    )}
                    placeholder={t('ContextSubtasks')}
                    value={newTaskNotes}
                    onChange={(e) => setNewTaskNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddTask(e);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest opacity-60"><LinkIcon size={12} /> {t('Urls')}</span>
                    {newTaskUrls[newTaskUrls.length - 1]?.trim() && (
                      <button type="button" onClick={() => setNewTaskUrls([...newTaskUrls, ''])} className="text-[9px] text-indigo-600 hover:underline">+ {t('Add')}</button>
                    )}
                  </label>
                  {newTaskUrls.map((u, i) => (
                    <div key={i} className="flex gap-1 group">
                      <div className="relative flex-1">
                        <input 
                          type="url"
                          className={cn(
                            "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] focus:ring-2 focus:ring-indigo-500 outline-none",
                            u.trim() && "pr-8"
                          )}
                          placeholder={t('UrlPlaceholder')}
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
                        {u.trim() && (
                          <a 
                            href={u.startsWith('http') ? u : `https://${u}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600 transition-colors"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      {(newTaskUrls.length > 1 || u.trim()) && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const next = newTaskUrls.filter((_, idx) => idx !== i);
                            setNewTaskUrls(next.length === 0 ? [''] : next);
                          }}
                          className="px-1 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 uppercase tracking-widest text-[9px] opacity-60">
                      <Calendar size={12} className="text-slate-400" />
                      {t('Deadline')}
                    </label>
                    {newTaskDeadline && (
                      <button 
                        type="button" 
                        onClick={() => setNewTaskDeadline('')}
                        className="text-[9px] font-bold text-red-500 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
              <div className="flex items-center gap-2">
                <input 
                  type={isTaskAllDay ? "date" : "datetime-local"}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] focus:ring-2 focus:ring-indigo-500 outline-none text-slate-400 font-medium [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:invert-[0.2] [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setIsTaskAllDay(!isTaskAllDay)}
                  className={cn(
                    "px-2.5 py-2 rounded-lg border flex items-center justify-center transition-all shrink-0",
                    isTaskAllDay ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-400"
                  )}
                  title={isTaskAllDay ? "Switch to Time" : "Switch to All Day"}
                >
                  {isTaskAllDay ? <Clock size={14} /> : <span className="text-[10px] font-black">ALL DAY</span>}
                </button>
              </div>
                </div>
                <button 
                  type="submit"
                  disabled={!newTaskTitle.trim() || !newTaskProject.trim()}
                  className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg text-sm shadow-md shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {t('AddToFocus')}
                </button>
              </form>
            </div>
          )}

          <div className="bg-slate-800 text-slate-300 rounded-xl p-5 shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between">
              {t('WorkflowHealth')}
              <Activity size={14} className="text-indigo-400" />
            </h2>
            <div className="space-y-4">
              <div className="space-y-2 pb-4 border-b border-slate-700/50">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-40">
                  <span>{t('GlobalLoad')}</span>
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
                    <div className="flex items-center text-[10px] h-7 gap-2">
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "font-bold uppercase tracking-tight truncate block",
                          activeSection === sec ? "text-indigo-400" : "text-slate-500"
                        )}>
                          {sec}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[8.5px] ml-auto shrink-0">
                        <div className="flex items-center gap-1 bg-rose-500/15 px-1.5 py-0.5 rounded w-[62px]" title="Focus">
                          <span className="text-rose-300/80 font-medium font-sans">Focus</span>
                          <span className="font-bold text-white ml-auto">{stats.sectionMetrics[sec]?.urgent || 0}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-cyan-500/15 px-1.5 py-0.5 rounded w-[62px]" title="ToDo">
                          <span className="text-cyan-300/80 font-medium font-sans">ToDo</span>
                          <span className="font-bold text-white ml-auto">{stats.sectionMetrics[sec]?.focus || 0}</span>
                        </div>
                        <span className="text-slate-500 font-bold ml-1">|</span>
                        <div className="flex items-center gap-1.5 ml-1" title="Active / Total">
                          <div className="w-[20px] flex justify-center">
                            <span className="text-white font-bold">{(stats.sectionMetrics[sec]?.urgent || 0) + (stats.sectionMetrics[sec]?.focus || 0)}</span>
                          </div>
                          <div className="flex items-center gap-0.5 text-slate-500 min-w-[28px] justify-end">
                             <span className="font-bold">/</span>
                             <span>{stats.sectionMetrics[sec]?.total || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

                  <div className="pt-2 border-t border-slate-700/50 flex justify-between items-start pt-3">
                <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-tighter text-slate-500">{t('SystemState')}</p>
                  <p className={cn("text-[10px] font-bold uppercase leading-none flex items-baseline gap-1", stats.textColor)}>
                    <span>{stats.focusTasksCount >= settings.criticalThreshold ? t('CriticalLoad') : stats.focusTasksCount >= stats.warningThreshold ? t('WarningHighLoad') : t('SafeCapacity')}</span>
                    <span className="text-[9px] opacity-70">({stats.loadPercentage}%)</span>
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <div className="flex flex-col items-end">
                    <p className="text-[9px] font-black uppercase tracking-tighter text-slate-500">{t('DoneToday')}</p>
                    <p className="text-[10px] font-bold text-emerald-400 font-mono">{stats.doneToday}</p>
                  </div>
                  <div className="flex gap-3">
                    {stats.pendingDeadlines > 0 && (
                      <div className="flex flex-col items-end">
                        <p className="text-[9px] font-black uppercase tracking-tighter text-amber-500">{t('Approaching')}</p>
                        <p className="text-[10px] font-bold text-amber-500 font-mono">{stats.pendingDeadlines}</p>
                      </div>
                    )}
                    {stats.expiredDeadlines > 0 && (
                      <div className="flex flex-col items-end">
                        <p className="text-[9px] font-black uppercase tracking-tighter text-red-500">{t('Expired')}</p>
                        <p className="text-[10px] font-bold text-red-500 font-mono">{stats.expiredDeadlines}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Distribution Analysis */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 overflow-hidden">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
              <Activity size={12} /> {t('GeneralProjectOverview')} ({activeSection} {t('WorkspaceLabel')})
            </h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {(Object.entries(stats.projectStats) as [string, any][])
                .filter(([proj]) => proj !== 'All' && proj.trim() !== '')
                .sort((a, b) => (b[1].urgent.todo + b[1].focus.todo) - (a[1].urgent.todo + a[1].focus.todo))
                .slice(0, 15)
                .map(([proj, s]) => (
                <div key={proj} className="p-3 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-indigo-100 hover:bg-indigo-50/10 transition-all flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                      <h3 className="text-[11px] font-black uppercase tracking-tight text-slate-700 truncate group-hover:text-indigo-600 transition-colors leading-tight">{proj}</h3>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">{t('LastUpdatedLabel')}: {s.lastUpdated > 0 ? format(s.lastUpdated, 'MM/dd HH:mm') : t('StatusNever')}</p>
                    </div>
                    <div className="bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100 shrink-0">
                      <span className="text-[10px] font-mono font-bold text-slate-500">{s.total} <span className="text-[8px] font-sans font-black opacity-30">{t('TotalLabel')}</span></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { key: 'Urgent', color: 'rose', data: s.urgent },
                      { key: 'Focus', color: 'indigo', data: s.focus },
                      { key: 'Archive', color: 'slate', data: s.archive },
                      { key: 'Trash', color: 'red', data: s.trash }
                    ].map(cat => (
                      <div key={cat.key} className="bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] p-1.5 rounded-lg border border-slate-100/50 flex flex-col items-center">
                        <span className={cn("text-[7px] font-black uppercase tracking-[0.05em] mb-1 truncate w-full text-center", 
                          cat.key === 'Urgent' ? 'text-rose-500' : 
                          cat.key === 'Focus' ? 'text-indigo-500' : 
                          cat.key === 'Archive' ? 'text-slate-400' : 'text-red-400'
                        )}>{t(cat.key)}</span>
                        <div className="flex flex-col items-center leading-none">
                          <span className={cn("font-bold text-[10px]", 
                            cat.data.todo > 0 ? (
                              cat.key === 'Urgent' ? 'text-rose-600' : 
                              cat.key === 'Focus' ? 'text-indigo-600' : 
                              cat.key === 'Archive' ? 'text-slate-500' : 'text-red-600'
                            ) : "text-slate-200"
                          )}>{cat.data.todo}</span>
                          <span className="text-[7px] text-slate-400 mt-0.5 whitespace-nowrap">
                            ({t('Done')}: {cat.data.done})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    <div className="bg-rose-500 transition-all duration-700" style={{ width: `${((s.urgent.todo + s.urgent.done) / s.total) * 100}%` }} />
                    <div className="bg-indigo-500 transition-all duration-700" style={{ width: `${((s.focus.todo + s.focus.done) / s.total) * 100}%` }} />
                    <div className="bg-slate-300 transition-all duration-700" style={{ width: `${((s.archive.todo + s.archive.done) / s.total) * 100}%` }} />
                    <div className="bg-red-200 transition-all duration-700" style={{ width: `${((s.trash.todo + s.trash.done) / s.total) * 100}%` }} />
                  </div>
                </div>
              ))}
              {Object.keys(stats.projectStats).length === 0 && (
                <p className="text-[10px] text-slate-400 italic text-center py-2">{t('NoTasks')}</p>
              )}
            </div>
          </div>
        </aside>

        {/* Task Columns */}
        <div className="col-span-12 lg:col-span-9 h-full min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={viewMode}
              initial={{ x: 10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {viewMode === 'dashboard' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full lg:pb-0">
              {/* Urgent Column */}
              <section className={cn(
                "flex flex-col rounded-2xl border p-4 min-h-0 bg-red-50/50 border-red-100 transition-all h-full",
                mobileView === 'urgent' ? "flex" : "hidden lg:flex"
              )}>
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold flex items-center gap-2 text-red-700">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-red-500"></span>
                      {t('Urgent')}
                    </h3>
                    <div className="flex bg-white/50 border border-red-100 rounded-lg p-0.5">
                      <button 
                        onClick={() => saveSettings({ displayModeFocus: 'large' })}
                        className={cn("p-1 rounded transition-all", settings.displayModeFocus === 'large' ? "bg-white shadow-sm text-red-600" : "text-slate-400")}
                        title={t('LargeView')}
                      >
                        <Grid2X2 size={10} />
                      </button>
                      <button 
                        onClick={() => saveSettings({ displayModeFocus: 'standard' })}
                        className={cn("p-1 rounded transition-all", settings.displayModeFocus === 'standard' ? "bg-white shadow-sm text-red-600" : "text-slate-400")}
                        title={t('StandardView')}
                      >
                        <LayoutGrid size={10} />
                      </button>
                      <button 
                        onClick={() => saveSettings({ displayModeFocus: 'compact' })}
                        className={cn("p-1 rounded transition-all", settings.displayModeFocus === 'compact' ? "bg-white shadow-sm text-red-600" : "text-slate-400")}
                        title={t('CompactView')}
                      >
                        <LayoutList size={10} />
                      </button>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border uppercase text-red-400 border-red-100">
                    <span className="md:inline hidden">Slots: </span> {settings.urgentLimit}
                  </span>
                </div>
                
                <div className="flex-1 space-y-3 overflow-y-auto overflow-x-visible pr-1 custom-scrollbar pb-24 lg:pb-10">
                  <div className={cn(
                    "grid grid-cols-1 gap-3",
                    settings.displayModeFocus !== 'compact' && (settings.displayModeFocus === 'large' ? "md:grid-cols-2 lg:grid-cols-1" : 
                                   settings.displayModeFocus === 'standard' ? "md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1" : 
                                   "md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1")
                  )}>
                    <AnimatePresence mode="popLayout">
                      {filteredTasks
                        .filter(t => t.category === 'Urgent')
                      .sort((a, b) => {
                        // Priority 1: Done state (lowest priority)
                        if (a.isDone && !b.isDone) return 1;
                        if (!a.isDone && b.isDone) return -1;

                        // If both are done, sort UNCONDITIONALLY by recency
                        if (a.isDone && b.isDone) {
                          return (b.updatedAt || 0) - (a.updatedAt || 0);
                        }

                        // Priority 2: Pinned tasks (global)
                        const pinA = !!a.isPinned;
                        const pinB = !!b.isPinned;
                        if (pinA !== pinB) return pinA ? -1 : 1;
                        
                        // Priority 3: Deadline (earliest first)
                        if (a.deadline && b.deadline) return a.deadline - b.deadline;
                        if (a.deadline) return -1;
                        if (b.deadline) return 1;

                        // Priority 4: Starred (starred first)
                        const starA = !!a.isStarred;
                        const starB = !!b.isStarred;
                        if (starA !== starB) return starA ? -1 : 1;

                        // Priority 5: Recency (updatedAt descending)
                        return (b.updatedAt || 0) - (a.updatedAt || 0);
                      })
                      .map(task => (
                        <TaskCard 
                          key={task.id} 
                          task={task} 
                          onToggle={() => toggleDone(task.id)}
                          onMove={(newCat) => moveTask(task.id, newCat)}
                          onDelete={() => deleteTask(task.id)}
                          onEdit={() => setEditingTask(task)}
                          onStar={() => toggleStar(task.id)}
                          onPin={() => togglePin(task.id)}
                          t={t}
                          variant="Urgent"
                          displayMode={settings.displayModeFocus}
                          deadlineThreshold={settings.deadlineThreshold}
                        />
                      ))}
                  </AnimatePresence>
                  </div>
                  {filteredTasks.filter(t => t.category === 'Urgent').length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                      <Zap size={48} strokeWidth={1} />
                      <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">{t('NoUrgent')}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Focus Column (Spans 2) */}
              <section className={cn(
                "col-span-1 lg:col-span-2 flex flex-col rounded-2xl border p-4 min-h-0 bg-indigo-50/50 border-indigo-100 transition-all h-full",
                mobileView === 'focus' ? "flex" : "hidden lg:flex"
              )}>
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold flex items-center gap-2 text-indigo-700">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-indigo-500"></span>
                      {t('Focus')}
                    </h3>
                    <div className="flex bg-white/50 border border-indigo-100 rounded-lg p-0.5">
                      <button 
                        onClick={() => saveSettings({ displayModeTodo: 'large' })}
                        className={cn("p-1 rounded transition-all", settings.displayModeTodo === 'large' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400")}
                        title={t('LargeView')}
                      >
                        <Grid2X2 size={10} />
                      </button>
                      <button 
                        onClick={() => saveSettings({ displayModeTodo: 'standard' })}
                        className={cn("p-1 rounded transition-all", settings.displayModeTodo === 'standard' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400")}
                        title={t('StandardView')}
                      >
                        <LayoutGrid size={10} />
                      </button>
                      <button 
                        onClick={() => saveSettings({ displayModeTodo: 'compact' })}
                        className={cn("p-1 rounded transition-all", settings.displayModeTodo === 'compact' ? "bg-white shadow-sm text-indigo-600" : "text-slate-400")}
                        title={t('CompactView')}
                      >
                        <LayoutList size={10} />
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsPickingDaily(true)}
                    className="text-[10px] font-bold text-indigo-500 uppercase tracking-tight hover:underline transition-all"
                  >
                    {t('Extract')} &rarr;
                  </button>
                </div>
                
                <div className="flex-1 space-y-6 overflow-y-auto overflow-x-visible pr-1 custom-scrollbar pb-24 lg:pb-10">
                  {groupedFocusTasks.expired.length > 0 && (
                    <div className="space-y-2 mb-4">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 bg-red-100/50 px-2 py-1.5 rounded-lg border border-red-200 flex items-center gap-2">
                        <AlertCircle size={12} strokeWidth={3} />
                        {t('ExpiredGlobal')}
                      </h4>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        settings.displayModeTodo !== 'compact' && (settings.displayModeTodo === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
                      )}>
                        <AnimatePresence mode="popLayout">
                          {groupedFocusTasks.expired.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              onPin={() => togglePin(task.id)}
                              t={t}
                              variant="Focus"
                              displayMode={settings.displayModeTodo}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {groupedFocusTasks.nearDeadline.length > 0 && (
                    <div className="space-y-2 mb-8">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 bg-amber-50/50 px-2 py-1.5 rounded-lg border border-amber-100 flex items-center gap-2">
                        <AlertTriangle size={12} strokeWidth={3} />
                        {t('ApproachingGlobal')}
                      </h4>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        settings.displayModeTodo !== 'compact' && (settings.displayModeTodo === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
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
                              onPin={() => togglePin(task.id)}
                              t={t}
                              variant="Focus"
                              displayMode={settings.displayModeTodo}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {groupedFocusTasks.pinned.length > 0 && (
                    <div className="space-y-2 mb-8">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 bg-indigo-50 px-2 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-2">
                        <Pin size={12} strokeWidth={3} className="rotate-45" />
                        {t('PinnedGlobal')}
                      </h4>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        settings.displayModeTodo !== 'compact' && (settings.displayModeTodo === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
                      )}>
                        <AnimatePresence mode="popLayout">
                          {groupedFocusTasks.pinned.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              onPin={() => togglePin(task.id)}
                              t={t}
                              variant="Focus"
                              displayMode={settings.displayModeTodo}
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
                            className="sticky top-0 z-20 w-full flex items-center gap-4 px-2 py-2.5 hover:opacity-90 transition-opacity bg-indigo-50/90 backdrop-blur-md border-b border-indigo-200/50"
                          >
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 bg-white shadow-sm px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
                              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                              {project}
                            </h4>
                            <div className="h-px flex-1 bg-indigo-300/30"></div>
                            <span className="text-[9px] font-bold text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                              {tasks.length} item{tasks.length > 1 ? 's' : ''}
                            </span>
                          </button>
                          
                          {!isCollapsed && (
                            <div className={cn(
                              "grid grid-cols-1 gap-2.5",
                              settings.displayModeTodo !== 'compact' && (settings.displayModeTodo === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
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
                                    onPin={() => togglePin(task.id)}
                                    t={t}
                                    variant="Focus"
                                    displayMode={settings.displayModeTodo}
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
                        <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">{t('NoFocus')}</span>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>
          ) : viewMode === 'calendar' ? (
            /* Calendar Mode */
            <CalendarView 
              tasks={searchAndProjectFilteredTasks} 
              onEdit={setEditingTask} 
              t={t} 
              locale={dateLocale}
            />
          ) : viewMode === 'archive' ? (
            /* Archive Mode */
            <section className="flex flex-col rounded-2xl border p-4 min-h-0 bg-slate-50/50 border-slate-200 h-full overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 px-2 gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold flex items-center gap-2 text-slate-700 text-lg">
                    <ArchiveIcon size={22} className="text-slate-400" />
                    {t('Archive')}
                  </h3>
                  {/* Filter controls */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <button 
                        onClick={() => setShowCleanupMenu(!showCleanupMenu)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-lg border transition-all text-[9px] font-black uppercase tracking-tighter",
                          archiveFilter !== 'all' ? "bg-rose-100 border-rose-200 text-rose-700" : "bg-white border-slate-200 text-slate-400"
                        )}
                      >
                        <Clock size={10} />
                        {archiveFilter === 'all' 
                          ? t('TimeFilter') 
                          : archiveFilter === '1m' 
                          ? t('Older1m') 
                          : archiveFilter === '3m' 
                          ? t('Older3m') 
                          : archiveFilter === '6m' 
                          ? t('Older6m') 
                          : t('Older1y')}
                      </button>
                      {showCleanupMenu && (
                        <>
                          <div className="fixed inset-0 z-[80]" onClick={() => setShowCleanupMenu(false)} />
                          <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] z-[81] py-1.5 overflow-hidden">
                            {[
                              { id: 'all', label: t('AllItems') },
                              { id: '1m', label: t('Older1m') },
                              { id: '3m', label: t('Older3m') },
                              { id: '6m', label: t('Older6m') },
                              { id: '1y', label: t('Older1y') }
                            ].map(f => (
                              <button
                                key={f.id}
                                onClick={() => {
                                  setArchiveFilter(f.id as any);
                                  setShowCleanupMenu(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-[10px] font-bold transition-all flex items-center justify-between",
                                  archiveFilter === f.id ? "bg-rose-50 text-rose-600" : "text-slate-600 hover:bg-slate-50"
                                )}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="hidden sm:block text-right">
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                    {settings.archiveThresholdDays === 99999 
                      ? "Archive is permanent" 
                      : `${t('InactiveMoveToTrash')} ${settings.archiveThresholdDays} ${t('Days')}`}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => cleanupArchive()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-red-200 hover:text-red-500 transition-all shadow-sm"
                  >
                    <Trash2 size={12} />
                    Trash All
                  </button>
                </div>
              </div>
              
              <div className="flex-1 space-y-6 overflow-y-auto overflow-x-visible pr-1 custom-scrollbar pb-24">
                {groupedArchiveTasks.nearingPurge.length > 0 && (
                   <div className="space-y-3 mb-8">
                      <div className="flex items-center gap-4 px-2">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 flex items-center gap-1.5">
                          <AlertTriangle size={10} />
                          {t('MovingToTrashSoon')} {"(< 3 days)"}
                        </h4>
                        <div className="h-px flex-1 bg-orange-100"></div>
                      </div>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        !isListMode && (settings.displayMode === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
                      )}>
                        <AnimatePresence mode="popLayout">
                          {groupedArchiveTasks.nearingPurge.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              onPin={() => togglePin(task.id)}
                              t={t}
                              variant="Archive"
                              displayMode={settings.displayMode}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                )}

                {groupedArchiveTasks.pinned.length > 0 && (
                  <div className="space-y-3 mb-8">
                    <div className="flex items-center gap-4 px-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1.5">
                        <Pin size={10} strokeWidth={3} className="rotate-45" />
                        {t('PinnedGlobal')}
                      </h4>
                      <div className="h-px flex-1 bg-indigo-100"></div>
                    </div>
                    <div className={cn(
                      "grid grid-cols-1 gap-2.5",
                      !isListMode && (settings.displayMode === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
                    )}>
                      <AnimatePresence mode="popLayout">
                        {groupedArchiveTasks.pinned.map(task => (
                          <TaskCard 
                            key={task.id} 
                            task={task} 
                            onToggle={() => toggleDone(task.id)}
                            onMove={(newCat) => moveTask(task.id, newCat)}
                            onDelete={() => deleteTask(task.id)}
                            onEdit={() => setEditingTask(task)}
                            onStar={() => toggleStar(task.id)}
                            onPin={() => togglePin(task.id)}
                            t={t}
                            variant="Archive"
                            displayMode={settings.displayMode}
                            deadlineThreshold={settings.deadlineThreshold}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {Object.keys(groupedArchiveTasks.grouped).length > 0 ? (
                  (Object.entries(groupedArchiveTasks.grouped) as [string, Task[]][]).map(([project, tasks]) => {
                    const isCollapsed = collapsedProjects.has(`archive-${project}`);
                    return (
                      <div key={project} className="space-y-3">
                          <button 
                            onClick={() => {
                              const next = new Set(collapsedProjects);
                              if (next.has(`archive-${project}`)) next.delete(`archive-${project}`);
                              else next.add(`archive-${project}`);
                              setCollapsedProjects(next);
                            }}
                            className="sticky top-0 z-20 w-full flex items-center gap-4 px-2 py-2.5 hover:opacity-90 transition-opacity bg-slate-50/90 backdrop-blur-md border-b border-slate-200/50"
                          >
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 bg-white shadow-sm px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
                            {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                            {project}
                          </h4>
                          <div className="h-px flex-1 bg-slate-300/50"></div>
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            {tasks.length} item{tasks.length > 1 ? 's' : ''}
                          </span>
                        </button>

                        {!isCollapsed && (
                          <div className={cn(
                            "grid grid-cols-1 gap-2.5",
                            !isListMode && (settings.displayMode === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
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
                                  onPin={() => togglePin(task.id)}
                                  t={t}
                                  variant="Archive"
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
                  groupedArchiveTasks.pinned.length === 0 && groupedArchiveTasks.nearingPurge.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                      <ArchiveIcon size={48} strokeWidth={1} />
                      <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">{t('ArchiveEmpty')}</span>
                    </div>
                  )
                )}
              </div>
            </section>
          ) : viewMode === 'trash' ? (
            /* Trash Mode */
            <section className="flex flex-col rounded-2xl border p-4 min-h-0 bg-red-50/30 border-red-100 h-full overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 px-2 gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold flex items-center gap-2 text-red-700 text-lg whitespace-nowrap">
                    <Trash2 size={22} className="text-red-400 shrink-0" />
                    {t('Trash')}
                  </h3>
                  {/* Filter controls */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <button 
                        onClick={() => setShowTrashMenu(!showTrashMenu)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-lg border transition-all text-[9px] font-black uppercase tracking-tighter",
                          trashFilter !== 'all' ? "bg-red-200 border-red-300 text-red-800" : "bg-white border-red-100 text-red-300"
                        )}
                      >
                        <Clock size={10} />
                        {trashFilter === 'all' ? 'Time Filter' : trashFilter}
                      </button>
                      {showTrashMenu && (
                        <>
                          <div className="fixed inset-0 z-[80]" onClick={() => setShowTrashMenu(false)} />
                          <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] z-[81] py-1.5 overflow-hidden">
                            {[
                              { id: 'all', label: 'All Items' },
                              { id: '1w', label: 'Older 1w' },
                              { id: '2w', label: 'Older 2w' }
                            ].map(f => (
                              <button
                                key={f.id}
                                onClick={() => {
                                  setTrashFilter(f.id as any);
                                  setShowTrashMenu(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-[10px] font-bold transition-all flex items-center justify-between",
                                  trashFilter === f.id ? "bg-red-50 text-red-600" : "text-slate-600 hover:bg-slate-50"
                                )}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block text-right">
                  <p className="text-[10px] uppercase font-black tracking-widest text-red-400">
                    {settings.trashCleanupThresholdDays === 99999 
                      ? "Trash is permanent" 
                      : `${t('PermanentDeleteAfter')} ${settings.trashCleanupThresholdDays} ${t('Days')}`}
                  </p>
                </div>
                
                <button 
                  onClick={emptyTrash}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 rounded-xl text-[10px] font-black text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm uppercase tracking-wider"
                >
                  <Zap size={12} />
                  {t('EmptyTrash')}
                </button>
              </div>
              
              <div className="flex-1 space-y-6 overflow-y-auto overflow-x-visible pr-2 custom-scrollbar pb-24">
                {groupedTrashTasks.nearingPurge.length > 0 && (
                   <div className="space-y-3 mb-8">
                      <div className="flex items-center gap-4 px-2">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1.5">
                          <AlertTriangle size={10} />
                          {t('DeletingSoon')} {"(< 3 days)"}
                        </h4>
                        <div className="h-px flex-1 bg-red-100"></div>
                      </div>
                      <div className={cn(
                        "grid grid-cols-1 gap-2.5",
                        !isListMode && (settings.displayMode === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
                      )}>
                        <AnimatePresence mode="popLayout">
                          {groupedTrashTasks.nearingPurge.map(task => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              onToggle={() => toggleDone(task.id)}
                              onMove={(newCat) => moveTask(task.id, newCat)}
                              onDelete={() => deleteTask(task.id)}
                              onEdit={() => setEditingTask(task)}
                              onStar={() => toggleStar(task.id)}
                              onPin={() => togglePin(task.id)}
                              t={t}
                              variant="Trash"
                              displayMode={settings.displayMode}
                              deadlineThreshold={settings.deadlineThreshold}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                )}

                {Object.keys(groupedTrashTasks.grouped).length > 0 ? (
                  (Object.entries(groupedTrashTasks.grouped) as [string, Task[]][]).map(([project, tasks]) => {
                    const isCollapsed = collapsedProjects.has(`trash-${project}`);
                    return (
                      <div key={project} className="space-y-3">
                        <button 
                          onClick={() => {
                            const next = new Set(collapsedProjects);
                            if (next.has(`trash-${project}`)) next.delete(`trash-${project}`);
                            else next.add(`trash-${project}`);
                            setCollapsedProjects(next);
                          }}
                          className="sticky top-0 z-20 w-full flex items-center gap-4 px-2 py-2.5 hover:opacity-90 transition-opacity bg-red-50/90 backdrop-blur-md border-b border-red-200/50"
                        >
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 bg-white shadow-sm px-2.5 py-1 rounded-lg border border-red-200 flex items-center gap-1.5">
                            {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                            {project}
                          </h4>
                          <div className="h-px flex-1 bg-red-300/30"></div>
                          <span className="text-[9px] font-bold text-red-400 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            {tasks.length} item{tasks.length > 1 ? 's' : ''}
                          </span>
                        </button>
                        
                        {!isCollapsed && (
                          <div className={cn(
                            "grid grid-cols-1 gap-2.5",
                            !isListMode && (settings.displayMode === 'large' ? "md:grid-cols-2" : "md:grid-cols-4")
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
                                  onPin={() => togglePin(task.id)}
                                  t={t}
                                  variant="Trash"
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
                  groupedTrashTasks.nearingPurge.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-40">
                      <Trash2 size={48} strokeWidth={1} />
                      <span className="text-[10px] font-bold mt-2 uppercase tracking-tighter italic">{t('TrashEmpty')}</span>
                    </div>
                  )
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
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('Settings')}</h2>
                    <p className="text-sm text-slate-500">{t('SelectLanguageDesc')}</p>
                  </div>
                </div>

                <div className="space-y-8 md:space-y-12">
                   {/* Data Synchronization & Import */}
                  <div className="bg-slate-50 rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Download size={20} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('DataLifecycle')}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-800 mb-1">{t('ExportData')}</p>
                        <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-tighter">Backup to NavFOR CSV</p>
                        <button 
                          onClick={() => {
                            const userPart = user?.email?.split('@')[0] || 'local';
                            const blob = new Blob([getCSVData()], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = `NavFOR_Log_${userPart}_Manual.csv`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={14} /> Download CSV
                        </button>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-800 mb-1">{t('ImportData')}</p>
                        <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-tighter">Restore from NavFOR CSV</p>
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
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('AccountInformation')}</h3>
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
                          <p className="font-bold text-slate-900 truncate max-w-[200px]">{user?.displayName || t('PersonalAccount')}</p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{user?.email || t('NotSignedIn')}</p>
                        </div>
                      </div>
                      <div className="flex flex-col md:items-end gap-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border self-start md:self-auto",
                          user ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
                        )}>
                          {user ? t('CloudSynced') : t('LocalOnly')}
                        </span>
                        {user && (
                          <button 
                            onClick={logOut}
                            className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1"
                          >
                            <LogOut size={10} /> {t('DisconnectAccount')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Language Settings */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Languages size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('Language')}</h3>
                    </div>
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{t('Language')}</p>
                          <p className="text-xs text-slate-500">{t('SelectLanguageDesc')}</p>
                        </div>
                        <div className="flex bg-white border border-slate-200 rounded-xl p-1 overflow-hidden shadow-sm w-full sm:w-80 shrink-0 h-11">
                          <button 
                            onClick={() => saveSettings({ ...settings, language: 'en' })}
                            className={cn(
                              "flex-1 py-1 rounded-lg text-[10px] font-bold transition-all",
                              settings.language === 'en' ? "bg-indigo-600 text-white shadow-mdScale" : "text-slate-400 hover:text-indigo-600"
                            )}
                          >
                            {t('English')}
                          </button>
                          <button 
                            onClick={() => saveSettings({ ...settings, language: 'ja' })}
                            className={cn(
                              "flex-1 py-1 rounded-lg text-[10px] font-bold transition-all",
                              settings.language === 'ja' ? "bg-indigo-600 text-white shadow-mdScale" : "text-slate-400 hover:text-indigo-600"
                            )}
                          >
                            {t('Japanese')}
                          </button>
                          <button 
                            onClick={() => saveSettings({ ...settings, language: 'fr' })}
                            className={cn(
                              "flex-1 py-1 rounded-lg text-[10px] font-bold transition-all",
                              settings.language === 'fr' ? "bg-indigo-600 text-white shadow-mdScale" : "text-slate-400 hover:text-indigo-600"
                            )}
                          >
                            {t('French')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Urgent Limits */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 text-amber-600">
                      <Zap size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('UrgentCapacity')}</h3>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-bold text-slate-900">{t('UrgentSlotLimit')}</p>
                        <p className="text-xs text-slate-500">{t('MaxConcurrentUrgent')}</p>
                      </div>
                      <div className="flex items-center gap-3 w-full sm:w-48 shrink-0">
                        <button 
                          onClick={() => saveSettings({ ...settings, urgentLimit: Math.max(1, settings.urgentLimit - 1) })}
                          className="flex-1 h-11 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold shadow-sm"
                        >-</button>
                        <span className="w-12 text-center font-mono font-bold text-xl">{settings.urgentLimit}</span>
                        <button 
                          onClick={() => saveSettings({ ...settings, urgentLimit: settings.urgentLimit + 1 })}
                          className="flex-1 h-11 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-bold shadow-sm"
                        >+</button>
                      </div>
                    </div>
                  </div>

                  {/* Health Thresholds */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-6 text-indigo-600">
                      <Activity size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('HealthMetrics')}</h3>
                    </div>
                    <div className="space-y-8">
                      <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between items-start gap-4">
                          <div className="flex-1">
                            <p className="font-bold text-slate-900">{t('CriticalThreshold')}</p>
                            <p className="text-xs text-slate-500">{t('CriticalAlertDesc')}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                             <input 
                              type="number"
                              className="w-16 bg-white border border-slate-200 rounded-lg h-10 text-sm font-mono font-bold outline-none focus:ring-1 focus:ring-red-500 text-center"
                              value={settings.criticalThreshold}
                              onChange={(e) => saveSettings({ ...settings, criticalThreshold: Math.max(5, parseInt(e.target.value) || 5) })}
                            />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{t('Items')}</span>
                          </div>
                        </div>
                        <input 
                          type="range" min="5" max="100" step="5"
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                          value={settings.criticalThreshold}
                          onChange={(e) => saveSettings({ ...settings, criticalThreshold: parseInt(e.target.value) })}
                        />
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <span>5 {t('Items')}</span>
                          <span>100 {t('Items')}</span>
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

                      <div className="pt-6 border-t border-slate-200/60">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between items-start gap-4 mb-4">
                          <div className="flex-1">
                            <p className="font-bold text-slate-900">{t('DeadlineThreshold')}</p>
                            <p className="text-xs text-slate-500">{t('DeadlineThresholdDesc')}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                             <input 
                              type="number"
                              className="w-16 bg-white border border-slate-200 rounded-lg h-10 text-sm font-mono font-bold outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                              value={settings.deadlineThreshold}
                              onChange={(e) => saveSettings({ ...settings, deadlineThreshold: Math.max(1, parseInt(e.target.value) || 1) })}
                            />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{t('Days')}</span>
                          </div>
                        </div>
                        <input 
                          type="range" min="1" max="14" step="1"
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={settings.deadlineThreshold}
                          onChange={(e) => saveSettings({ ...settings, deadlineThreshold: parseInt(e.target.value) })}
                        />
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          <span>1 {t('Days')}</span>
                          <span>14 {t('Days')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Done Cleanup */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-4 text-emerald-600">
                      <RefreshCcw size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('DoneTrashLifecycle')}</h3>
                    </div>
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{t('DoneToTrash')}</p>
                          <p className="text-xs text-slate-500">{t('DoneToTrashDesc')}</p>
                        </div>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm w-full sm:w-48 shrink-0 h-11"
                          value={settings.doneToTrashThresholdDays}
                          onChange={(e) => saveSettings({ doneToTrashThresholdDays: parseInt(e.target.value) })}
                        >
                          <option value={1}>1 {t('Days')}</option>
                          <option value={3}>3 {t('Days')}</option>
                          <option value={7}>7 {t('Days')}</option>
                          <option value={14}>14 {t('Days')}</option>
                          <option value={99999}>{t('Reset')}</option>
                        </select>
                      </div>

                      <div className="pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{t('TrashAutoCleanup')}</p>
                          <p className="text-xs text-slate-500">{t('TrashAutoCleanupDesc')}</p>
                        </div>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm w-full sm:w-48 shrink-0 h-11"
                          value={settings.trashCleanupThresholdDays}
                          onChange={(e) => saveSettings({ trashCleanupThresholdDays: parseInt(e.target.value) })}
                        >
                          <option value={7}>7 {t('Days')}</option>
                          <option value={14}>14 {t('Days')}</option>
                          <option value={30}>30 {t('Days')}</option>
                          <option value={90}>90 {t('Days')}</option>
                          <option value={99999}>{t('NeverCleanup')}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Maintenance */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-4 text-slate-600">
                      <ArchiveIcon size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('AutoArchiveSweep')}</h3>
                    </div>
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{t('ArchiveThreshold')}</p>
                          <p className="text-xs text-slate-500">{t('ArchiveThresholdDesc')}</p>
                        </div>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm w-full sm:w-48 shrink-0 h-11"
                          value={settings.archiveThresholdDays}
                          onChange={(e) => saveSettings({ archiveThresholdDays: parseInt(e.target.value) })}
                        >
                          <option value={7}>7 {t('Days')}</option>
                          <option value={14}>14 {t('Days')}</option>
                          <option value={30}>30 {t('Days')}</option>
                          <option value={90}>90 {t('Days')}</option>
                          <option value={99999}>{t('Never')}</option>
                        </select>
                      </div>

                      <div className="pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{t('ArchiveDoneToTrash')}</p>
                          <p className="text-xs text-slate-500">{t('ArchiveDoneToTrashDesc')}</p>
                        </div>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm w-full sm:w-48 shrink-0 h-11"
                          value={settings.archiveDoneToTrashDays !== undefined ? settings.archiveDoneToTrashDays : 7}
                          onChange={(e) => saveSettings({ archiveDoneToTrashDays: parseInt(e.target.value) })}
                        >
                          <option value={1}>1 {t('Days')}</option>
                          <option value={3}>3 {t('Days')}</option>
                          <option value={7}>7 {t('Days')}</option>
                          <option value={14}>14 {t('Days')}</option>
                          <option value={30}>30 {t('Days')}</option>
                          <option value={99999}>{t('Never')}</option>
                        </select>
                      </div>

                      <div className="pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{t('ArchiveInactiveToTrash')}</p>
                          <p className="text-xs text-slate-500">{t('ArchiveInactiveToTrashDesc')}</p>
                        </div>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm w-full sm:w-48 shrink-0 h-11"
                          value={settings.archiveInactiveToTrashDays !== undefined ? settings.archiveInactiveToTrashDays : 99999}
                          onChange={(e) => saveSettings({ archiveInactiveToTrashDays: parseInt(e.target.value) })}
                        >
                          <option value={7}>7 {t('Days')}</option>
                          <option value={14}>14 {t('Days')}</option>
                          <option value={30}>30 {t('Days')}</option>
                          <option value={90}>90 {t('Days')} (3 {t('month')})</option>
                          <option value={180}>180 {t('Days')}</option>
                          <option value={365}>365 {t('Days')}</option>
                          <option value={99999}>{t('Never')}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Data Management */}
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="flex items-center gap-2 mb-6 text-emerald-600">
                      <Download size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">{t('SyncAndBackup')}</h3>
                    </div>
                    
                    <div className="space-y-6">
                      {/* Cloud Sync */}
                      <div className="pb-6 border-b border-slate-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <p className="font-bold text-slate-900">{t('SyncToCloud')}</p>
                            <p className="text-xs text-slate-500">{t('SyncToCloudDesc')}</p>
                          </div>
                          {!user ? (
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                              <button 
                                onClick={() => handleSignIn('google')}
                                className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm justify-center h-11"
                              >
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="" />
                                <span>{t('ContinueWithGoogle')}</span>
                              </button>
                              <button 
                                onClick={() => handleSignIn('email')}
                                className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-100 transition-all shadow-sm justify-center h-11"
                              >
                                <Mail size={15} />
                                <span>{settings.language === 'ja' ? 'メールログイン / 連携' : settings.language === 'fr' ? 'Connexion E-mail' : 'Email Sign In / Link'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 w-full sm:w-auto justify-center sm:justify-start h-11">
                              <div className="w-8 h-8 rounded-full overflow-hidden border border-white shadow-sm flex-shrink-0 bg-emerald-100 flex items-center justify-center text-emerald-800">
                                {user.photoURL ? <img src={user.photoURL} alt="" /> : <UserIcon size={14} className="m-2" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-emerald-800 truncate">{user.displayName || user.email}</p>
                                <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest">{t('CloudSynced')}</p>
                              </div>
                              <button onClick={logOut} className="text-xs font-bold text-emerald-800/40 hover:text-emerald-800 ml-2" title={t('LogOut')}>&times;</button>
                            </div>
                          )}
                        </div>

                        {/* If user is logged in: show provider badges & campus Wi-Fi password link card */}
                        {user && (
                          <div className="mt-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-700">
                                  {settings.language === 'ja' ? '連携アカウント状態:' : 'Linked Accounts:'}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {hasGoogleAuth(user) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-2.5 h-2.5" alt="" />
                                      Google
                                    </span>
                                  )}
                                  {hasPasswordAuth(user) ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 size={11} />
                                      {settings.language === 'ja' ? 'メール・パスワード設定済' : 'Password Linked'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      <AlertCircle size={11} />
                                      {settings.language === 'ja' ? 'パスワード未設定' : 'No Password Set'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {hasPasswordAuth(user) && (
                                <button
                                  type="button"
                                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                                >
                                  {showPasswordChange 
                                    ? (settings.language === 'ja' ? '閉じる' : 'Close') 
                                    : (settings.language === 'ja' ? 'パスワードを変更' : 'Change Password')}
                                </button>
                              )}
                            </div>

                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-2">
                              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                <Shield size={14} className="text-indigo-600" />
                                <span>
                                  {settings.language === 'ja' 
                                    ? '学内Wi-Fi（Sorbonne大等）対策：メール・パスワード連携' 
                                    : 'Campus Wi-Fi Security (Password Setup)'}
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed text-slate-500">
                                {hasPasswordAuth(user)
                                  ? (settings.language === 'ja'
                                      ? `✓ 設定完了済みです。Sorbonne大などの学内Wi-FiでGoogle認証が遮断される場合でも、メールアドレス「${user.email}」と設定したパスワードでログインできます（データは同一のまま引き継がれます）。`
                                      : `✓ Setup complete. When on strict campus Wi-Fi where Google popups fail, you can sign in directly using ${user.email} and this password.`)
                                  : (settings.language === 'ja'
                                      ? `Sorbonne大などの学内Wi-FiではGoogleログインのポップアップが遮断されることがあります。ここでパスワードを設定すると、現在のGoogleアカウント（${user.email}）と同一のユーザーID・データ（タスクや設定）を保持したまま、メール＆パスワードでログインできるようになります。`
                                      : `On strict campus Wi-Fi where Google popups fail, set a password below to allow direct email sign-in with ${user.email} while keeping all your tasks and settings intact.`)}
                              </p>

                              {(!hasPasswordAuth(user) || showPasswordChange) && (
                                <form onSubmit={handleLinkPassword} className="space-y-2 pt-1">
                                  {linkingMessage && (
                                    <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                                      linkingMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    }`}>
                                      {linkingMessage.type === 'error' ? <AlertCircle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
                                      <span>{linkingMessage.text}</span>
                                    </div>
                                  )}
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                      <Lock size={14} className="absolute left-3 top-2.5 text-slate-400" />
                                      <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={linkingPassword}
                                        onChange={(e) => setLinkingPassword(e.target.value)}
                                        placeholder={settings.language === 'ja' ? '連携用パスワード（6文字以上）' : 'Set password (6+ chars)'}
                                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                      />
                                    </div>
                                    <button
                                      type="submit"
                                      disabled={isLinkingLoading}
                                      className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                                    >
                                      <KeyRound size={13} />
                                      <span>
                                        {isLinkingLoading 
                                          ? (settings.language === 'ja' ? '設定中...' : 'Saving...') 
                                          : (settings.language === 'ja' ? 'パスワードを設定して連携' : 'Save & Link Password')}
                                      </span>
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Local Backup */}
                      <div className="pb-6 border-b border-slate-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <p className="font-bold text-slate-900">{t('LocalFolderLog')}</p>
                            <p className="text-xs text-slate-500">{t('LocalFolderLogDesc')}</p>
                          </div>
                          <button 
                            onClick={() => saveSettings({ isLocalBackupEnabled: !settings.isLocalBackupEnabled })}
                            disabled={!dirHandle}
                            className={cn(
                                "w-12 h-6 rounded-full p-1 transition-all duration-300 shrink-0",
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
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 w-full">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{t('LocalDirectoryPath')}</label>
                              <div className="text-xs font-mono break-all py-1.5 text-slate-600 bg-slate-50 px-2 rounded border border-slate-100 flex items-center gap-2">
                                <Activity size={10} className="shrink-0 opacity-50" />
                                {settings.localBackupPath || t('NoFolderSelected')}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0 sm:pt-5 w-full sm:w-48">
                              <button 
                                onClick={selectBackupFolder}
                                className={cn(
                                  "p-2 px-3 rounded text-[10px] font-bold transition-colors w-full h-10 flex items-center justify-center",
                                  !dirHandle && settings.localBackupPath 
                                    ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse" 
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                )}
                              >
                                {!dirHandle && settings.localBackupPath ? t('AuthorizeSession') : t('SelectFolder')}
                              </button>
                              <button 
                                onClick={downloadBackup}
                                className={cn(
                                  "p-2 px-3 rounded text-[10px] font-bold transition-all w-full h-10 flex items-center justify-center gap-1.5",
                                  !window.showDirectoryPicker 
                                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
                                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                )}
                              >
                                <Download size={12} /> {window.showDirectoryPicker ? t('ManualLocalBackup') : t('SaveBackupToLocal')}
                              </button>
                                {!window.showDirectoryPicker && (
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1 text-[8px] text-slate-400 font-bold uppercase tracking-widest">
                                      <Clock size={8} />
                                      {t('LastSaved')}: {lastBackupTime ? format(lastBackupTime, 'MM/dd HH:mm') : t('Never')}
                                    </div>
                                    {lastBackupTime && (Date.now() - lastBackupTime > 24 * 60 * 60 * 1000) && (
                                      <div className="flex items-center gap-1 text-[8px] text-amber-500 font-bold uppercase tracking-widest animate-pulse">
                                        <AlertTriangle size={8} /> {t('DailyUpdateRecommendation')}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
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
                              <Zap size={10} /> {t('PermissionNeeded')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-200">
                        <p className="font-bold text-red-600 flex items-center gap-2 mb-1">
                          <AlertTriangle size={16} /> {t('DangerZone')}
                        </p>
                        <p className="text-[10px] text-slate-500 mb-4 uppercase font-black tracking-widest">Database Maintenance & Repair</p>
                        
                        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                          <p className="text-[11px] text-red-800 font-bold mb-3 leading-relaxed">
                            {t('ResetSettingsDesc')}
                          </p>
                          <button 
                            onClick={forceResetSettings}
                            className="w-full py-2.5 mb-3 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-200 transition-all flex items-center justify-center gap-2 border border-red-200"
                          >
                            <RefreshCcw size={14} /> {t('ForceResetSettings')}
                          </button>
                          
                          <div className="h-px bg-red-200/50 my-4" />
                          
                          <p className="text-[11px] text-red-800 font-bold mb-3 leading-relaxed">
                            CRITICAL: Delete ALL tasks in the cloud. This cannot be undone. An emergency backup will be created first if sync is enabled.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                             <button 
                                onClick={purgeSectionData}
                                className="flex-1 py-3 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-200 transition-all border border-red-200 flex items-center justify-center gap-2"
                              >
                                <Trash2 size={14} /> Purge "{activeSection}"
                              </button>
                              <button 
                                onClick={purgeAllData}
                                className="flex-1 py-3 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                              >
                                <AlertCircle size={14} /> Purge All Content
                              </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>


              </section>
            )}
          </motion.div>
        </AnimatePresence>
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
          {`Navigation Focus Objectives & Results V${APP_VERSION}`}
        </div>
      </footer>

      <AnimatePresence>
        {isPickingDaily && (
          <DailyPickModal 
            tasks={tasks.filter(t => t.category === 'Focus' && !t.isDone)} 
            onClose={() => setIsPickingDaily(false)} 
            onPick={pickDailyTasks} 
            t={t}
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
            t={t}
            projects={projects}
          />
        )}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          language={settings.language}
          initialTab={authModalInitialTab}
        />
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
  onPin: () => void;
  t: (key: string) => string;
  variant?: 'Urgent' | 'Focus' | 'Archive' | 'Trash';
  displayMode?: 'compact' | 'standard' | 'large';
  deadlineThreshold?: number;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, onToggle, onMove, onDelete, onEdit, onStar, onPin, t,
  variant = 'Focus',
  displayMode = 'standard',
  deadlineThreshold = 3
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [openToRight, setOpenToRight] = useState(false);
  const buttonRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = viewportWidth - rect.right;
      
      setOpenUpwards(spaceBelow < 250); 
      
      if (spaceRight >= 180) { // w-44 is 176px, adding a small buffer
        setOpenToRight(true);
      } else {
        setOpenToRight(false);
      }
    }
    setShowMenu(!showMenu);
  };

  React.useEffect(() => {
    if (!showMenu) return;
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if ((buttonRef.current && buttonRef.current.contains(target)) ||
          (menuRef.current && menuRef.current.contains(target))) {
        return;
      }
      setShowMenu(false);
    };
    window.addEventListener('mousedown', handleGlobalClick, true);
    return () => window.removeEventListener('mousedown', handleGlobalClick, true);
  }, [showMenu]);

  if (displayMode === 'compact') {
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
          task.isDone && "grayscale opacity-50 shadow-none",
          showMenu && "relative z-30 shadow-xl border-indigo-200"
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
                {task.isAllDay ? format(task.deadline, 'MM/dd') : format(task.deadline, 'MM/dd HH:mm')}
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
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className={cn(
              "p-1 rounded transition-colors",
              task.isPinned ? "text-indigo-600" : "text-slate-400 md:text-slate-200 md:hover:text-indigo-400"
            )}
            title={task.isPinned ? "Unpin task" : "Pin task"}
          >
            <Pin size={14} className={cn("rotate-45", task.isPinned && "fill-indigo-600")} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            className={cn(
              "p-1 rounded transition-colors",
              task.isStarred ? "text-amber-500" : "text-slate-400 md:text-slate-200 md:hover:text-amber-400"
            )}
          >
            <Star size={14} className={task.isStarred ? "fill-amber-500" : ""} />
          </button>

          {/* Shortcut buttons for mobile parity */}
          {variant !== 'Urgent' && variant !== 'Archive' && variant !== 'Trash' && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); }} className="p-1 px-1.5 hover:bg-red-50 text-red-500 rounded bg-red-50/30 md:bg-transparent" title={t('MoveToUrgent')}>
              <Zap size={14} />
            </button>
          )}
          {(variant === 'Archive' || variant === 'Trash' || variant === 'Urgent') && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Focus'); }} className="p-1 px-1.5 hover:bg-indigo-50 text-indigo-500 rounded bg-indigo-50/30 md:bg-transparent" title={t('RestoreToFocus')}>
              <Target size={14} />
            </button>
          )}
          
          <div className="relative" ref={buttonRef}>
            <button onClick={toggleMenu} className="p-1 hover:bg-slate-100 text-slate-400 rounded bg-slate-50 md:bg-transparent">
              <MoreVertical size={14} />
            </button>
            {showMenu && createPortal(
              <div 
                ref={menuRef}
                className={cn(
                  "fixed w-44 bg-white border border-indigo-200 rounded-xl shadow-2xl z-[100] py-1 font-bold text-[10px] uppercase tracking-wider overflow-hidden"
                )}
                style={{
                  top: openUpwards ? 'auto' : (buttonRef.current?.getBoundingClientRect().bottom || 0) + 4,
                  bottom: openUpwards ? window.innerHeight - (buttonRef.current?.getBoundingClientRect().top || 0) + 4 : 'auto',
                  left: openToRight 
                    ? Math.max(8, (buttonRef.current?.getBoundingClientRect().left || 0)) 
                    : Math.min(window.innerWidth - 184, (buttonRef.current?.getBoundingClientRect().right || 0) - 176),
                }}
              >
                  {variant !== 'Urgent' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 border-b border-slate-50 flex items-center gap-2">
                      <Zap size={12} className="text-red-400" /> {t('MoveToUrgent')}
                    </button>
                  )}
                  {variant !== 'Focus' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Focus'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-indigo-600 border-b border-slate-50 flex items-center gap-2">
                      <Target size={12} className="text-indigo-400" /> {t('RestoreToFocus')}
                    </button>
                  )}
                  {variant !== 'Archive' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Archive'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-600 border-b border-slate-50 flex items-center gap-2">
                      <ArchiveIcon size={12} className="text-slate-400" /> {t('ArchiveTask')}
                    </button>
                  )}
                  {variant !== 'Trash' ? (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Trash'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                       <Trash2 size={12} className="text-red-400" /> {t('MoveToTrash')}
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                      <Trash2 size={12} className="text-red-400" /> {t('DeletePermanently')}
                    </button>
                  )}
                </div>,
                document.body
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
        "bg-white rounded-xl shadow-sm border border-slate-200 group hover:border-indigo-300 transition-all flex flex-col cursor-pointer",
        displayMode === 'large' ? "p-5 md:p-6 gap-3" : "p-3 md:p-4",
        variant === 'Urgent' && "border-l-4 border-l-red-500",
        variant === 'Archive' && "opacity-70 grayscale",
        task.isDone && "grayscale opacity-50",
        showMenu && "relative z-30 shadow-xl border-indigo-200"
      )}
    >
      <div className="flex items-start justify-between mb-1.5 min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0 pr-1">
          {task.deadline && (
            <>
              <div className={cn(
                "flex items-center gap-1 font-black uppercase tracking-tighter shrink-0",
                displayMode === 'large' ? "text-[11px]" : "text-[9px]",
                (task.deadline - Date.now()) < 0 ? "text-red-600" : 
                (task.deadline - Date.now()) <= (deadlineThreshold * 86400000) ? "text-amber-600" : "text-slate-400"
              )}>
                <Clock size={displayMode === 'large' ? 12 : 10} />
                <span>{task.isAllDay ? format(task.deadline, 'MM/dd') : format(task.deadline, 'MM/dd HH:mm')}</span>
              </div>
              <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400 truncate opacity-70">
                <span>({format(task.deadline, 'yyyyMMdd')})</span>
                <span className="text-indigo-400/60">[{task.project}]</span>
              </div>
            </>
          )}
          {!task.deadline && (
            <div className="text-[8px] font-bold text-indigo-400/60 truncate">
              [{task.project}]
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-auto pt-0.5">
          <button 
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className={cn(
              "p-1 rounded transition-colors group/pin",
              task.isPinned ? "text-indigo-600" : "text-slate-300 hover:text-indigo-400"
            )}
            title={task.isPinned ? "Unpin task" : "Pin task"}
          >
            <Pin size={displayMode === 'large' ? 14 : 12} className={cn("rotate-45", task.isPinned && "fill-indigo-600")} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            className={cn(
              "p-1 rounded transition-colors group/star",
              task.isStarred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
            )}
            title={task.isStarred ? "Unstar task" : "Star task"}
          >
            {task.isStarred ? <Star size={displayMode === 'large' ? 14 : 12} className="fill-amber-500" /> : <Star size={displayMode === 'large' ? 14 : 12} />}
          </button>
          {(variant === 'Archive' || variant === 'Trash') && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMove('Focus'); }}
              className="text-[9px] font-black text-indigo-600 hover:underline flex items-center gap-0.5 ml-1"
            >
              RESTORE
            </button>
          )}
        </div>
      </div>
      <p className={cn(
        "font-semibold text-slate-800 leading-tight mb-2 break-words", 
        displayMode === 'large' ? "text-sm md:text-lg" : "text-xs md:text-sm",
        task.isDone && "line-through text-slate-400"
      )}>
        {task.title}
      </p>

      {task.urls && task.urls.length > 0 && (
        <div className={cn("flex flex-wrap gap-1.5 mb-2", displayMode === 'large' && "gap-2 mb-3")}>
          {task.urls.map((url, idx) => (
            <a 
              key={idx}
              href={url.startsWith('http') ? url : `https://${url}`} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 transition-colors group/link bg-indigo-50/50 rounded border border-indigo-100/50 max-w-full",
                displayMode === 'large' ? "text-[10px] px-2 py-1" : "text-[9px] px-1.5 py-0.5"
              )}
            >
              <LinkIcon size={displayMode === 'large' ? 12 : 10} className="shrink-0 group-hover/link:rotate-12 transition-transform" />
              <span className={cn("truncate", displayMode === 'large' ? "max-w-[180px]" : "max-w-[100px]")}>{url.replace(/^https?:\/\//, '')}</span>
            </a>
          ))}
        </div>
      )}
      
      {task.notes && (
        <p className={cn(
          "text-slate-500 mb-2 leading-relaxed italic",
          displayMode === 'large' ? "text-[11px] bg-slate-50/80 p-2.5 rounded-lg border border-slate-100/80 block whitespace-pre-wrap line-clamp-3" : "text-[10px] line-clamp-2"
        )}>
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

        <div className="flex items-center gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
          {variant !== 'Urgent' && variant !== 'Archive' && variant !== 'Trash' && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); }} className="p-2 md:p-1 hover:bg-red-50 text-red-500 rounded bg-red-50/30 md:bg-transparent" title={t('MoveToUrgent')}>
              <Zap size={14} className="md:w-2.5 md:h-2.5" />
            </button>
          )}
          {(variant === 'Archive' || variant === 'Trash' || variant === 'Urgent') && (
            <button onClick={(e) => { e.stopPropagation(); onMove('Focus'); }} className="p-2 md:p-1 hover:bg-indigo-50 text-indigo-500 rounded bg-indigo-50/30 md:bg-transparent" title={t('RestoreToFocus')}>
              <Target size={14} className="md:w-2.5 md:h-2.5" />
            </button>
          )}
          <div className="relative" ref={buttonRef}>
            <button onClick={toggleMenu} className="p-2 md:p-1 hover:bg-slate-100 text-slate-400 rounded bg-slate-50 md:bg-transparent">
              <MoreVertical size={14} className="md:w-2.5 md:h-2.5" />
            </button>
            {showMenu && createPortal(
              <div 
                ref={menuRef}
                className={cn(
                  "fixed w-44 bg-white border border-indigo-200 rounded-xl shadow-2xl z-[100] py-1 font-bold text-[10px] uppercase tracking-wider overflow-hidden"
                )}
                style={{
                  top: openUpwards ? 'auto' : (buttonRef.current?.getBoundingClientRect().bottom || 0) + 4,
                  bottom: openUpwards ? window.innerHeight - (buttonRef.current?.getBoundingClientRect().top || 0) + 4 : 'auto',
                  left: openToRight 
                    ? Math.max(8, (buttonRef.current?.getBoundingClientRect().left || 0)) 
                    : Math.min(window.innerWidth - 184, (buttonRef.current?.getBoundingClientRect().right || 0) - 176),
                }}
              >
                  {variant !== 'Urgent' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Urgent'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 border-b border-slate-50 flex items-center gap-2">
                      <Zap size={12} className="text-red-400" /> {t('MoveToUrgent')}
                    </button>
                  )}
                  {variant !== 'Focus' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Focus'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-indigo-600 border-b border-slate-50 flex items-center gap-2">
                      <Target size={12} className="text-indigo-400" /> {t('RestoreToFocus')}
                    </button>
                  )}
                  {variant !== 'Archive' && (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Archive'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-600 border-b border-slate-50 flex items-center gap-2">
                      <ArchiveIcon size={12} className="text-slate-400" /> {t('ArchiveTask')}
                    </button>
                  )}
                  {variant !== 'Trash' ? (
                    <button onClick={(e) => { e.stopPropagation(); onMove('Trash'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                       <Trash2 size={12} className="text-red-400" /> {t('MoveToTrash')}
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2">
                      <Trash2 size={12} className="text-red-400" /> {t('DeletePermanently')}
                    </button>
                  )}
                </div>,
                document.body
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

function CalendarView({ tasks, onEdit, t, locale }: { tasks: Task[]; onEdit: (t: Task) => void; t: (key: string) => string; locale: any }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState<'year' | 'month' | 'week' | 'day'>('month');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ignoreScrollChange = useRef(true); 
  const isTransitioning = useRef(false);

  const tasksWithDeadlines = useMemo(() => tasks.filter(t => t.deadline && t.category !== 'Trash'), [tasks]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasksWithDeadlines.forEach(t => {
      if (t.deadline) {
        const d = format(t.deadline, 'yyyy-MM-dd');
        if (!map[d]) map[d] = [];
        map[d].push(t);
      }
    });
    return map;
  }, [tasksWithDeadlines]);

  const navigate = (direction: 'prev' | 'next') => {
    ignoreScrollChange.current = false;
    isTransitioning.current = true;
    if (calendarMode === 'year') {
      setCurrentDate(prev => direction === 'prev' ? subYears(prev, 1) : addYears(prev, 1));
    } else if (calendarMode === 'month') {
      setCurrentDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
    } else if (calendarMode === 'week') {
      setCurrentDate(prev => direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1));
    } else {
      setCurrentDate(prev => direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1));
    }
    setTimeout(() => { isTransitioning.current = false; }, 500);
  };

  const goToToday = () => {
    ignoreScrollChange.current = false;
    isTransitioning.current = true;
    setCurrentDate(new Date());
    setTimeout(() => { isTransitioning.current = false; }, 500);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Calendar Header */}
      <header className="p-2 md:p-4 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-2 md:gap-4 bg-white sticky top-0 z-[60] landscape:flex-row landscape:p-1.5 landscape:gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-2 md:gap-4 w-full md:w-auto landscape:flex-row landscape:gap-2">
          <div className="flex bg-slate-50 border border-slate-200 rounded-xl p-0.5 md:p-1 shadow-sm w-full sm:w-auto overflow-x-auto no-scrollbar landscape:w-auto landscape:p-0.5">
            {(['year', 'month', 'week', 'day'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setCalendarMode(mode)}
                className={cn(
                  "flex-1 sm:flex-initial px-2 md:px-4 py-1 md:py-1.5 rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all landscape:px-3 landscape:py-1",
                  calendarMode === mode ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-400 hover:text-slate-600"
                )}
              >
                {t(mode)}
              </button>
            ))}
          </div>
          <h2 className="hidden md:block text-lg font-black text-slate-800 tabular-nums uppercase tracking-tighter shrink-0 landscape:block landscape:text-sm">
            {calendarMode === 'year' ? format(currentDate, 'yyyy', { locale }) : 
             calendarMode === 'month' ? format(currentDate, 'MMMM yyyy', { locale }) :
             calendarMode === 'week' ? `${t('WeekOf')} ${format(startOfWeek(currentDate, { locale }), 'MMM d', { locale })}` :
             format(currentDate, 'PPP', { locale })}
          </h2>
        </div>

        <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-2 md:gap-3 landscape:w-auto landscape:gap-2">
          <h2 className="text-[9px] md:hidden md:text-sm font-black text-slate-800 tabular-nums uppercase tracking-tighter landscape:hidden">
            {calendarMode === 'year' ? format(currentDate, 'yyyy', { locale }) : 
             calendarMode === 'month' ? format(currentDate, 'MMM yyyy', { locale }) :
             calendarMode === 'week' ? `W${format(startOfWeek(currentDate, { locale }), 'w', { locale })} ${format(startOfWeek(currentDate, { locale }), 'MMM d', { locale })}` :
             format(currentDate, 'MMM d, yyyy', { locale })}
          </h2>
          <div className="flex items-center gap-1.5 md:gap-2">
            <button 
              onClick={goToToday}
              className="px-1.5 md:px-3 py-1 md:py-1.5 bg-white border border-slate-200 rounded-lg text-[8px] md:text-[10px] font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all uppercase tracking-widest landscape:px-2 landscape:py-1"
            >
              {t('Today')}
            </button>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
              <button onClick={() => navigate('prev')} className="p-1 md:p-2 hover:bg-slate-50 text-slate-400 border-r border-slate-100 landscape:p-1">
                <ChevronLeft size={12} className="md:w-4 md:h-4" />
              </button>
              <button onClick={() => navigate('next')} className="p-1 md:p-2 hover:bg-slate-50 text-slate-400 landscape:p-1">
                <ChevronRight size={12} className="md:w-4 md:h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Calendar Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto custom-scrollbar focus:outline-none relative">
        {calendarMode === 'year' && (
          <YearView 
            scrollContainerRef={scrollContainerRef} 
            ignoreScrollChange={ignoreScrollChange}
            currentDate={currentDate} 
            tasksByDate={tasksByDate} 
            onDateSelect={(d) => { setCurrentDate(d); setCalendarMode('month'); }} 
            onYearChange={setCurrentDate} 
            locale={locale}
          />
        )}
        {calendarMode === 'month' && (
          <MonthView 
            scrollContainerRef={scrollContainerRef} 
            ignoreScrollChange={ignoreScrollChange}
            currentDate={currentDate} 
            tasksByDate={tasksByDate} 
            onEdit={onEdit} 
            onDateSelect={(d) => { setCurrentDate(d); setCalendarMode('day'); }} 
            onMonthChange={setCurrentDate} 
            locale={locale}
          />
        )}
        {calendarMode === 'week' && (
          <WeekView currentDate={currentDate} tasks={tasksWithDeadlines} onEdit={onEdit} locale={locale} />
        )}
        {calendarMode === 'day' && (
          <DayView currentDate={currentDate} tasks={tasksWithDeadlines} onEdit={onEdit} locale={locale} />
        )}
      </div>
    </div>
  );
}

const YearGrid = React.memo(({ yearDate, tasksByDate, onDateSelect, locale }: { yearDate: Date; tasksByDate: Record<string, Task[]>; onDateSelect: (d: Date) => void; locale: any }) => {
  const year = yearDate.getFullYear();
  const monthsData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: startOfYear(yearDate),
      end: endOfYear(yearDate)
    });
    const today = new Date();
    return months.map(month => {
      const days = eachDayOfInterval({
        start: startOfMonth(month),
        end: endOfMonth(month)
      }).map(day => ({
        date: day,
        key: format(day, 'yyyy-MM-dd'),
        dayNum: format(day, 'd'),
        isToday: isSameDay(day, today)
      }));
      return {
        month,
        monthName: format(month, 'MMMM', { locale }),
        emptyDays: startOfWeek(startOfMonth(month), { locale }).getDay(),
        days
      };
    });
  }, [yearDate, locale]);

  const weekdays = useMemo(() => {
    const start = startOfWeek(new Date(), { locale });
    return Array.from({ length: 7 }).map((_, i) => format(addDays(start, i), 'EEEEE', { locale }));
  }, [locale]);

  return (
    <div className="p-8 border-b border-slate-100" data-year={year.toString()}>
      <h3 className="text-2xl font-black text-slate-800 mb-8 px-4">{year}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-12">
        {monthsData.map(mData => (
          <div key={mData.month.toString()} className="space-y-4">
            <button 
              onClick={() => onDateSelect(mData.month)}
              className="text-sm font-black text-indigo-600 uppercase tracking-widest hover:underline"
            >
              {mData.monthName}
            </button>
            <div className="grid grid-cols-7 gap-1 text-[8px] font-bold text-center">
              {weekdays.map((d, idx) => (
                <div key={`${d}-${idx}`} className="text-slate-400">{d}</div>
              ))}
              {Array.from({ length: mData.emptyDays }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {mData.days.map(dayInfo => {
                const dayTasks = tasksByDate[dayInfo.key] || [];
                return (
                  <div 
                    key={dayInfo.key}
                    className={cn(
                      "w-6 h-6 flex items-center justify-center rounded-full transition-all cursor-pointer",
                      dayTasks.length > 5 ? "bg-red-500 text-white" :
                      dayTasks.length > 2 ? "bg-amber-400 text-slate-800" :
                      dayTasks.length > 0 ? "bg-indigo-100 text-indigo-600" :
                      dayInfo.isToday ? "border border-indigo-500 text-indigo-500" : "text-slate-400 hover:bg-slate-100"
                    )}
                    onClick={() => onDateSelect(dayInfo.date)}
                  >
                    {dayInfo.dayNum}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

function YearView({ scrollContainerRef, ignoreScrollChange, currentDate, tasksByDate, onDateSelect, onYearChange, locale }: { scrollContainerRef: React.RefObject<HTMLDivElement>; ignoreScrollChange: React.RefObject<boolean>; currentDate: Date; tasksByDate: Record<string, Task[]>; onDateSelect: (d: Date) => void; onYearChange: (d: Date) => void; locale: any }) {
  const lastReportedYear = useRef(currentDate.getFullYear().toString());
  const isInitialScrollDone = useRef(false);

  const years = useMemo(() => {
    const list = [];
    const currentYear = new Date().getFullYear();
    for (let i = -5; i <= 5; i++) {
        list.push(new Date(currentYear + i, 0, 1));
    }
    return list;
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (!isInitialScrollDone.current) return;
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const yearStr = entry.target.getAttribute('data-year');
          if (yearStr && yearStr !== lastReportedYear.current) {
            lastReportedYear.current = yearStr;
            const date = new Date(parseInt(yearStr), 0, 1);
            ignoreScrollChange.current = true;
            onYearChange(date);
          }
        }
      });
    }, {
      root: scrollContainerRef.current,
      threshold: 0.5
    });

    const yearElements = scrollContainerRef.current?.querySelectorAll('[data-year]');
    yearElements?.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [years, onYearChange, scrollContainerRef]);

  React.useEffect(() => {
    const scrollToTarget = () => {
      const currentYear = currentDate.getFullYear().toString();
      const target = scrollContainerRef.current?.querySelector(`[data-year="${currentYear}"]`) as HTMLElement;
      if (target && scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = target.offsetTop;
          setTimeout(() => {
            isInitialScrollDone.current = true;
          }, 200);
          return true;
      }
      return false;
    };

    // Try immediately after layout
    if (!scrollToTarget()) {
      // If failed, try with delay
      const timer = setTimeout(scrollToTarget, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!isInitialScrollDone.current) return;
    if (ignoreScrollChange.current) {
      ignoreScrollChange.current = false;
      return;
    }
    const currentYear = currentDate.getFullYear().toString();
    const target = scrollContainerRef.current?.querySelector(`[data-year="${currentYear}"]`);
    if (target && scrollContainerRef.current) {
        lastReportedYear.current = currentYear;
        const container = scrollContainerRef.current;
        const targetTop = (target as HTMLElement).offsetTop;
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }, [currentDate, ignoreScrollChange]);

  return (
    <div className="bg-white relative">
      {years.map(yearDate => (
        <YearGrid 
            key={yearDate.toString()} 
            yearDate={yearDate} 
            tasksByDate={tasksByDate} 
            onDateSelect={onDateSelect} 
            locale={locale}
        />
      ))}
    </div>
  );
}

const MonthGrid = React.memo(({ monthDate, tasksByDate, onEdit, onDateSelect, locale }: { monthDate: Date; tasksByDate: Record<string, Task[]>; onEdit: (t: Task) => void; onDateSelect: (d: Date) => void; locale: any }) => {
  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { locale });
    const end = endOfWeek(endOfMonth(monthDate), { locale });
    const allDays = eachDayOfInterval({ start, end });
    const chunked = [];
    for (let i = 0; i < allDays.length; i += 7) {
      const week = allDays.slice(i, i + 7).map(day => ({
        date: day,
        key: format(day, 'yyyy-MM-dd'),
        isCurrentMonth: isSameMonth(day, monthDate),
        isToday: isSameDay(day, new Date()),
        dayNum: format(day, 'd')
      }));
      chunked.push(week);
    }
    return chunked;
  }, [monthDate, locale]);

  return (
    <div className="flex flex-col mb-8" data-month={format(monthDate, 'yyyy-MM')}>
      <div className="p-4 bg-slate-50 border-y border-slate-100 flex items-center justify-between sticky top-[34px] z-20 landscape:top-[28px] landscape:p-2">
        <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest landscape:text-xs">
          {format(monthDate, 'MMMM yyyy', { locale })}
        </h3>
      </div>
      <div className="flex flex-col border-l border-slate-50">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7">
            {week.map(dayInfo => {
              const dayTasks = tasksByDate[dayInfo.key] || [];
              const { date, isCurrentMonth, isToday, dayNum } = dayInfo;

              return (
                <div 
                  key={dayInfo.key} 
                  className={cn(
                    "min-h-[120px] border-b border-r border-slate-50 p-2 flex flex-col gap-1 transition-colors hover:bg-slate-50/20 group",
                    !isCurrentMonth && "bg-slate-100/10 opacity-30",
                    isToday && "bg-indigo-50/20"
                  )}
                >
                  <div className="flex justify-between items-center mb-1">
                    <button 
                      onClick={() => onDateSelect(date)}
                      className={cn(
                        "text-[10px] font-black tabular-nums py-0.5 px-1.5 rounded transition-all",
                        isToday ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 group-hover:text-slate-600"
                      )}
                    >
                      {dayNum}
                    </button>
                    {dayTasks.length > 0 && (
                      <span className="text-[8px] font-bold text-indigo-400 opacity-60">
                        {dayTasks.length}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                    {dayTasks.slice(0, 5).map(task => (
                      <button
                        key={task.id}
                        onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                        className={cn(
                          "text-[8px] font-bold text-left px-1.5 py-0.5 rounded border truncate transition-all",
                          task.isDone ? "opacity-30 line-through bg-slate-100" : 
                          task.category === 'Urgent' ? "bg-red-50 border-red-100 text-red-700 hover:bg-red-100" :
                          "bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-white"
                        )}
                      >
                        <span className="opacity-40 font-mono mr-0.5">[{task.project}]</span>
                        {!task.isAllDay && task.deadline && (
                          <span className="opacity-60 font-mono mr-1 text-[7px]">{format(task.deadline, 'HH:mm')}</span>
                        )}
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 5 && (
                      <button 
                        onClick={() => onDateSelect(date)}
                        className="text-[8px] font-black text-indigo-400 hover:text-indigo-600 text-center py-0.5"
                      >
                        + {dayTasks.length - 5}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

function MonthView({ scrollContainerRef, ignoreScrollChange, currentDate, tasksByDate, onEdit, onDateSelect, onMonthChange, locale }: { scrollContainerRef: React.RefObject<HTMLDivElement>; ignoreScrollChange: React.RefObject<boolean>; currentDate: Date; tasksByDate: Record<string, Task[]>; onEdit: (t: Task) => void; onDateSelect: (d: Date) => void; onMonthChange: (d: Date) => void; locale: any }) {
  const isInitialScrollDone = useRef(false);
  const lastReportedMonth = useRef(format(currentDate, 'yyyy-MM'));

  const months = useMemo(() => {
    const list = [];
    const base = startOfMonth(new Date()); 
    for (let i = -12; i <= 24; i++) {
        list.push(addMonths(base, i));
    }
    return list;
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (!isInitialScrollDone.current) return;
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
          const monthStr = entry.target.getAttribute('data-month');
          if (monthStr && monthStr !== lastReportedMonth.current) {
            lastReportedMonth.current = monthStr;
            const [y, m] = monthStr.split('-').map(Number);
            const date = new Date(y, m - 1, 1);
            ignoreScrollChange.current = true;
            onMonthChange(date);
          }
        }
      });
    }, {
      root: scrollContainerRef.current,
      threshold: 0.4
    });

    const monthElements = scrollContainerRef.current?.querySelectorAll('[data-month]');
    monthElements?.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [months, onMonthChange, scrollContainerRef]);

  React.useEffect(() => {
    const scrollToTarget = () => {
      const currentMonthStr = format(currentDate, 'yyyy-MM');
      const target = scrollContainerRef.current?.querySelector(`[data-month="${currentMonthStr}"]`) as HTMLElement;
      if (target && scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = target.offsetTop;
          setTimeout(() => {
            isInitialScrollDone.current = true;
          }, 200);
          return true;
      }
      return false;
    };

    if (!scrollToTarget()) {
      const timer = setTimeout(scrollToTarget, 100);
      return () => clearTimeout(timer);
    }
  }, []); 

  useEffect(() => {
    if (!isInitialScrollDone.current) return;
    if (ignoreScrollChange.current) {
      ignoreScrollChange.current = false;
      return;
    }
    
    const currentMonthStr = format(currentDate, 'yyyy-MM');
    const target = scrollContainerRef.current?.querySelector(`[data-month="${currentMonthStr}"]`);
    if (target && scrollContainerRef.current) {
        lastReportedMonth.current = currentMonthStr;
        const container = scrollContainerRef.current;
        const targetTop = (target as HTMLElement).offsetTop;
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }, [currentDate, ignoreScrollChange]);

  return (
    <div className="bg-white min-w-[700px] relative">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 sticky top-0 z-30 landscape:top-0 md:landscape:top-0">
        {Array.from({ length: 7 }).map((_, i) => {
          const dayName = format(addDays(startOfWeek(new Date(), { locale }), i), 'eee', { locale });
          return (
            <div key={i} className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center border-r border-slate-50 last:border-0">
              {dayName}
            </div>
          );
        })}
      </div>
      <div className="relative">
        {months.map(month => (
          <MonthGrid 
              key={month.toString()} 
              monthDate={month} 
              tasksByDate={tasksByDate} 
              onEdit={onEdit} 
              onDateSelect={onDateSelect} 
              locale={locale}
          />
        ))}
      </div>
    </div>
  );
}

function WeekView({ currentDate, tasks, onEdit, locale }: { currentDate: Date; tasks: Task[]; onEdit: (t: Task) => void; locale: any }) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { locale });
    const end = endOfWeek(currentDate, { locale });
    return eachDayOfInterval({ start, end });
  }, [currentDate, locale]);

  return (
    <div className="h-full flex flex-col min-w-[700px]">
      <div className="grid grid-cols-7 h-full">
        {weekDays.map(day => {
          const dayTasks = tasks.filter(t => isSameDay(t.deadline || 0, day));
          const isToday = isSameDay(day, new Date());

          return (
            <div key={day.toString()} className={cn(
              "flex flex-col border-r border-slate-100 last:border-0",
              isToday && "bg-indigo-50/10"
            )}>
              <div className="p-4 border-b border-slate-50 flex flex-col items-center gap-1 bg-slate-50/30">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{format(day, 'EEE', { locale })}</span>
                <span className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-full text-sm font-black tabular-nums transition-all",
                  isToday ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "text-slate-800"
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="flex-1 p-3 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                {dayTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => onEdit(task)}
                    className={cn(
                      "p-3 rounded-xl border text-[10px] font-bold text-left transition-all hover:translate-y-[-1px] hover:shadow-md",
                      task.isDone ? "grayscale opacity-40 bg-slate-100 border-slate-200" : 
                      task.category === 'Urgent' ? "bg-red-50 border-red-100 text-red-700 shadow-sm shadow-red-100" :
                      "bg-white border-slate-200 text-slate-700 shadow-sm"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1 opacity-50 font-mono text-[8px]">
                      <span>{task.project}</span>
                      {!task.isAllDay && format(task.deadline!, 'HH:mm')}
                    </div>
                    <div className={cn(task.isDone && "line-through")}>
                      {task.title}
                    </div>
                  </button>
                ))}
                {dayTasks.length === 0 && (
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl opacity-20">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 rotate-90">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ currentDate, tasks, onEdit, locale }: { currentDate: Date; tasks: Task[]; onEdit: (t: Task) => void; locale: any }) {
  const dayTasks = tasks.filter(t => isSameDay(t.deadline || 0, currentDate));
  
  return (
    <div className="max-w-4xl mx-auto p-8 lg:p-12">
      <div className="flex items-center gap-6 mb-12">
        <div className="w-24 h-24 flex flex-col items-center justify-center bg-indigo-600 text-white rounded-3xl shadow-2xl shadow-indigo-200">
          <span className="text-xs font-black uppercase tracking-[0.2em] opacity-80">{format(currentDate, 'MMM', { locale })}</span>
          <span className="text-4xl font-black tabular-nums">{format(currentDate, 'd')}</span>
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">{format(currentDate, 'EEEE', { locale })}</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">{dayTasks.length} items scheduled</p>
        </div>
      </div>

      <div className="space-y-4">
        {dayTasks.sort((a,b) => (a.deadline || 0) - (b.deadline || 0)).map(task => (
          <button
            key={task.id}
            onClick={() => onEdit(task)}
            className={cn(
              "w-full flex items-center gap-6 p-6 rounded-3xl border transition-all text-left group",
              task.isDone ? "grayscale opacity-50 bg-slate-50 border-slate-100 shadow-none" : 
              "bg-white border-slate-100 hover:border-indigo-300 shadow-sm hover:shadow-xl hover:shadow-indigo-100 hover:translate-x-2"
            )}
          >
            <div className={cn(
              "w-16 text-xs font-black tabular-nums text-slate-400 py-2 border-r flex items-center justify-center shrink-0",
              !task.isAllDay && "text-indigo-600"
            )}>
              {task.isAllDay ? 'All Day' : format(task.deadline!, 'HH:mm')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-extrabold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded leading-none shrink-0 truncate max-w-[100px]">
                  [{task.project}]
                </span>
                {task.isStarred && <Star size={12} className="text-amber-500 fill-amber-500" />}
              </div>
              <h3 className={cn("text-lg font-bold text-slate-800 leading-tight", task.isDone && "line-through text-slate-400")}>{task.title}</h3>
              {task.notes && <p className="text-sm text-slate-500 mt-2 line-clamp-1 italic">{task.notes}</p>}
            </div>
            <ChevronRight className="text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" size={24} />
          </button>
        ))}
        {dayTasks.length === 0 && (
          <div className="py-32 flex flex-col items-center justify-center text-slate-200 border-4 border-dashed border-slate-50 rounded-[3rem]">
            <Calendar size={64} strokeWidth={1} />
            <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-400">Clear Schedule</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DailyPickModal({ tasks, onClose, onPick, t, currentUrgentCount, limit }: { tasks: Task[]; onClose: () => void; onPick: (ids: string[]) => void; t: (key: string, data?: any) => string; currentUrgentCount: number; limit: number }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const remainingSlots = limit - currentUrgentCount;

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      if (selectedIds.length >= remainingSlots) {
        alert(t('ExtractLimitAlert', { n: remainingSlots }));
        return;
      }; 
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-6">
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
        className="relative w-full max-w-lg h-full md:h-auto bg-white rounded-none md:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 md:p-8 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold tracking-tight text-orange-600">{t('DailyChoice')}</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-6">{t('ExtractDesc', { n: Math.max(0, remainingSlots) })}</p>
          
          <div className="flex-1 md:max-h-96 overflow-y-auto space-y-2 mb-8 pr-2 custom-scrollbar">
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
                <p className="text-sm font-medium">{t('NoFocusTasks')}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-slate-500">
              <span className="text-orange-600 font-bold">{selectedIds.length}</span> / {remainingSlots} {t('Slots')}
            </div>
            <button 
              onClick={() => onPick(selectedIds)}
              disabled={selectedIds.length === 0}
              className="px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-orange-100 flex items-center gap-2"
            >
              <Zap size={18} />
              {t('SetDailyFocus')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}


function EditTaskModal({ task, onClose, onSave, onMove, onDelete, t, projects }: { task: Task; onClose: () => void; onSave: (updates: Partial<Task>) => void; onMove: (cat: Category) => void; onDelete: () => void; t: (key: string) => string; projects: string[] }) {
  const [title, setTitle] = useState(task.title);
  const [project, setProject] = useState(task.project);
  const [notes, setNotes] = useState(task.notes || '');
  const [urls, setUrls] = useState<string[]>(task.urls && task.urls.length > 0 ? task.urls : ['']);
  const [isStarred, setIsStarred] = useState(task.isStarred || false);
  const [isPinned, setIsPinned] = useState(task.isPinned || false);
  const [isDone, setIsDone] = useState(task.isDone || false);
  const [isAllDay, setIsAllDay] = useState(task.isAllDay || false);
  const [deadline, setDeadline] = useState(task.deadline ? format(task.deadline, task.isAllDay ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm") : '');
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [showActionsMobile, setShowActionsMobile] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const currentDeadlineTimestamp = useMemo(() => {
    if (!deadline) return 0;
    try {
      const dateObj = new Date(deadline);
      if (isNaN(dateObj.getTime())) return 0;
      if (isAllDay) {
        dateObj.setHours(23, 59, 59, 999);
      }
      return dateObj.getTime();
    } catch (e) {
      return 0;
    }
  }, [deadline, isAllDay]);

  const isDirty = title !== task.title || 
                  project !== task.project ||
                  notes !== (task.notes || '') || 
                  JSON.stringify(urls.filter(u => u.trim() !== '')) !== JSON.stringify(task.urls || []) ||
                  isStarred !== (task.isStarred || false) ||
                  isPinned !== (task.isPinned || false) ||
                  isDone !== (task.isDone || false) ||
                  isAllDay !== (task.isAllDay || false) ||
                  currentDeadlineTimestamp !== (task.deadline || 0);

  const handleSubmit = (e?: React.FormEvent, shouldClose = false) => {
    if (e) e.preventDefault();
    if (isDirty) {
      const finalDeadline = currentDeadlineTimestamp || null;
      onSave({ 
        title, 
        project,
        notes, 
        urls: urls.filter(u => u.trim() !== ''),
        isStarred,
        isPinned,
        isDone,
        isAllDay,
        deadline: finalDeadline as any // Using null to clear
      });
    }
    if (shouldClose) onClose();
  };

  const handleClose = () => {
    if (isDirty) {
      handleSubmit(undefined, true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If MemoModal is open, we let it handle Ctrl+Enter
      if (isMemoModalOpen) return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit(undefined, true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, notes, urls, isStarred, isPinned, isDone, deadline, isMemoModalOpen]);

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-3xl h-full md:h-auto md:max-h-[90vh] bg-white rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
      >
        <div className="p-6 md:p-8 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold tracking-tight">{t('TaskDetail')}</h2>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setShowActionsMobile(true)} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 md:hidden"
                title="System Actions"
              >
                <MoreVertical size={20} />
              </button>
              <button 
                type="button"
                onClick={handleClose} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 md:hidden"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 flex-wrap">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProjectPicker(!showProjectPicker)}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100/50 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                >
                  {project}
                  <ChevronDown size={10} />
                </button>
                
                <AnimatePresence>
                  {showProjectPicker && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowProjectPicker(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 shadow-xl rounded-xl py-1 z-20 overflow-hidden"
                      >
                        <div className="max-h-40 overflow-y-auto custom-scrollbar">
                          {projects.filter(p => p !== 'All').map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                setProject(p);
                                setShowProjectPicker(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 text-[11px] font-bold hover:bg-slate-50 transition-colors flex items-center justify-between",
                                project === p ? "text-indigo-600 bg-indigo-50/50" : "text-slate-600"
                              )}
                            >
                              {p}
                              {project === p && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setIsDone(!isDone)}
                  className={cn(
                    "h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all",
                    isDone ? "bg-blue-50 border-blue-200 text-blue-500" : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                  )}
                  title={isDone ? t('MarkUndone') : t('MarkDone')}
                >
                  <CheckCircle2 size={14} className={isDone ? "fill-blue-500 text-white" : ""} />
                  <span>{t('Done')}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setIsPinned(!isPinned)}
                  className={cn(
                    "h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all",
                    isPinned ? "bg-indigo-50 border-indigo-200 text-indigo-500" : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                  )}
                  title={t('Pin')}
                >
                  <Pin size={14} className={cn("rotate-45", isPinned && "fill-indigo-500")} />
                  <span>{t('Pin')}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setIsStarred(!isStarred)}
                  className={cn(
                    "h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all",
                    isStarred ? "bg-amber-50 border-amber-200 text-amber-500" : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                  )}
                  title={t('Star')}
                >
                  <Star size={14} className={isStarred ? "fill-amber-500" : ""} />
                  <span>{t('Star')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">{t('TaskDescription')}</label>
              <textarea 
                autoFocus
                className={cn(
                  "w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-lg font-medium outline-none transition-all resize-none h-28",
                  isDone && "opacity-60 text-slate-400 line-through font-normal"
                )}
                placeholder={t('DetailsPlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('Memos')}</label>
                <button 
                  type="button" 
                  onClick={() => setIsMemoModalOpen(true)}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  <ExternalLink size={10} /> {t('Maximize')}
                </button>
              </div>
              <textarea 
                placeholder={t('ContextSubtasks')}
                className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-sm font-medium outline-none transition-all resize-none h-32"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            
            <AnimatePresence>
              {isMemoModalOpen && (
                <MemoModal 
                  value={notes}
                  onChange={setNotes}
                  onSave={handleSubmit}
                  onClose={() => setIsMemoModalOpen(false)}
                  placeholder={t('BroadViewMemoPlaceholder')}
                />
              )}
            </AnimatePresence>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 opacity-60">
                  <Calendar size={12} />
                  {t('Deadline')}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                        const newAllDay = !isAllDay;
                        setIsAllDay(newAllDay);
                        if (deadline) {
                            // Re-format existing deadline date
                            const d = new Date(deadline);
                            setDeadline(format(d, newAllDay ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm"));
                        }
                    }}
                    className={cn(
                        "p-1.5 rounded-lg border flex items-center justify-center transition-all",
                        isAllDay ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-400"
                    )}
                    title={isAllDay ? "Switch to Time" : "Switch to All Day"}
                  >
                    {isAllDay ? <Clock size={12} /> : <span className="text-[9px] font-black leading-none">ALL DAY</span>}
                  </button>
                  {deadline && (
                    <button 
                      type="button"
                      onClick={() => setDeadline('')}
                      className="text-[10px] font-bold text-red-500 hover:underline"
                    >
                      {t('Clear')}
                    </button>
                  )}
                </div>
              </div>
              <input 
                type={isAllDay ? "date" : "datetime-local"}
                className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-[11px] font-medium outline-none transition-all text-slate-400 [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:invert-[0.2] [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><LinkIcon size={10} /> {t('Urls')}</span>
                <button 
                  type="button" 
                  onClick={addUrlField}
                  className="text-indigo-600 hover:underline px-2"
                >
                  + {t('Add')}
                </button>
              </label>
              <div className="space-y-2">
                {urls.map((u, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="url"
                        placeholder={t('UrlPlaceholder')}
                        className={cn(
                          "w-full px-5 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl text-sm font-medium outline-none transition-all",
                          u.trim() && "pr-12"
                        )}
                        value={u}
                        onChange={(e) => updateUrlField(idx, e.target.value)}
                      />
                      {u.trim() && (
                        <a 
                          href={u.startsWith('http') ? u : `https://${u}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600 transition-colors"
                        >
                          <ExternalLink size={18} />
                        </a>
                      )}
                    </div>
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
                onClick={() => onClose()}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
              >
                {t('Cancel')}
              </button>
              <button 
                type="submit"
                disabled={!title.trim()}
                onClick={(e) => { e.preventDefault(); handleSubmit(undefined, true); }}
                className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-indigo-100"
              >
                {t('CommitChanges')}
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar Actions */}
        <div className={cn(
          "bg-slate-50 p-6 md:p-8 w-full md:w-64 border-l border-slate-100 flex flex-col overflow-y-auto custom-scrollbar pb-24 md:pb-8 transition-transform duration-300",
          "fixed inset-x-0 bottom-0 top-[60px] z-20 md:relative md:inset-auto md:top-auto md:z-auto",
          showActionsMobile ? "translate-y-0" : "translate-y-full md:translate-y-0"
        )}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('SystemActions')}</h3>
            <button 
              type="button"
              onClick={() => setShowActionsMobile(false)} 
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 md:hidden"
            >
              <X size={20} />
            </button>
            <button 
              type="button"
              onClick={handleClose} 
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hidden md:flex"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-3">
            {task.category !== 'Urgent' && (
              <button 
                onClick={() => { onMove('Urgent'); handleSubmit(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600 hover:bg-red-100 transition-all group"
              >
                <Zap size={16} className="text-red-400" />
                {t('MoveToUrgent')}
              </button>
            )}
            {task.category !== 'Focus' && (
              <button 
                onClick={() => { onMove('Focus'); handleSubmit(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-all group"
              >
                <Target size={16} className="text-indigo-400" />
                {t('RestoreToFocus')}
              </button>
            )}
            {task.category !== 'Archive' && (
              <button 
                onClick={() => { onMove('Archive'); handleSubmit(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all group"
              >
                <ArchiveIcon size={16} className="text-slate-300 group-hover:text-indigo-400" />
                {t('ArchiveTask')}
              </button>
            )}
            {task.category !== 'Trash' ? (
              <button 
                onClick={() => { onMove('Trash'); handleSubmit(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
              >
                <Trash2 size={16} className="text-red-300" />
                {t('MoveToTrash')}
              </button>
            ) : (
                <button 
                  onClick={() => { if(confirm(t('DeleteConfirm'))) { onDelete(); onClose(); } }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-lg shadow-red-100"
                >
                  <Trash2 size={16} />
                  {t('DeletePermanently')}
                </button>
            )}
          </div>

          <div className="mt-auto pt-8">
            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-2">{t('Metadata')}</p>
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

function MemoModal({ value, onChange, onSave, onClose, placeholder }: { value: string; onChange: (v: string) => void; onSave: () => void; onClose: () => void; placeholder?: string }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onSave();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave, onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl h-full md:h-[85vh] sm:md:h-[80vh] bg-white rounded-none md:rounded-3xl overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between p-6 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <ExternalLink size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Broad View Memo</h3>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Enhanced context editor</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-3 bg-white hover:bg-slate-100 text-slate-400 rounded-2xl border border-slate-200 transition-all"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 p-6">
          <textarea 
            className="w-full h-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] text-lg font-medium text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all resize-none custom-scrollbar shadow-inner"
            placeholder={placeholder || "Deep dive into context, sub-tasks, or brainstorm ideas here..."}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                onSave();
                onClose();
              }
            }}
            autoFocus
          />
        </div>
        
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex gap-4">
             <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Auto-saving to temporary buffer
             </div>
          </div>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSave();
              onClose();
            }}
            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all"
          >
            Finish Editing
          </button>
        </div>
      </motion.div>
    </div>
  );
}
