import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  LogIn, 
  UserPlus, 
  KeyRound, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Shield,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { 
  signIn, 
  signInWithGoogleRedirectMode, 
  signInWithEmail, 
  signUpWithEmail, 
  sendPasswordReset 
} from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'ja' | 'fr';
  onSuccess?: () => void;
  initialTab?: 'google' | 'email' | 'signup' | 'reset';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  language,
  onSuccess,
  initialTab = 'google'
}) => {
  const [tab, setTab] = useState<'google' | 'email' | 'signup' | 'reset'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const t = (jaText: string, enText: string, frText: string) => {
    if (language === 'ja') return jaText;
    if (language === 'fr') return frText;
    return enText;
  };

  const getFriendlyErrorMessage = (err: any): string => {
    const code = err?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return t(
        'メールアドレスまたはパスワードが正しくありません。',
        'Invalid email or password.',
        'Adresse e-mail ou mot de passe incorrect.'
      );
    }
    if (code === 'auth/user-not-found') {
      return t(
        'アカウントが見つかりません。Googleで以前ログインしたことがある場合は「データ紐付け・パスワード設定」からパスワードを設定してください。',
        'Account not found. If you previously used Google sign-in, use "Link / Reset Password" to set a password.',
        'Compte introuvable. Si vous utilisiez Google, utilisez "Lier / Réinitialiser le mot de passe".'
      );
    }
    if (code === 'auth/email-already-in-use') {
      return t(
        'このメールアドレスは既に登録されています（Googleアカウント等）。「データ紐付け・パスワード設定」からパスワードを設定すれば、同じデータでメールログインできます。',
        'This email is already registered (e.g. via Google). Use "Link / Reset Password" to enable email login while keeping your existing data.',
        'Cet e-mail est déjà enregistré (ex. via Google). Utilisez "Lier / Réinitialiser le mot de passe" pour conserver vos données.'
      );
    }
    if (code === 'auth/weak-password') {
      return t(
        'パスワードは6文字以上で設定してください。',
        'Password should be at least 6 characters.',
        'Le mot de passe doit comporter au moins 6 caractères.'
      );
    }
    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
      return t(
        'ポップアップがブロックまたは中断されました。「リダイレクト方式で試す」または下の「メールでログイン」をご利用ください。',
        'Popup was blocked or closed. Try "Redirect Mode" or use Email Login below.',
        'La fenêtre contextuelle a été bloquée. Essayez le mode redirection ou la connexion par e-mail.'
      );
    }
    if (code === 'auth/network-request-failed') {
      return t(
        'ネットワーク通信エラーが発生しました。学内Wi-Fi等の制限環境では「メールでログイン」をお試しください。',
        'Network error. On strict campus Wi-Fi, please use Email Login instead.',
        'Erreur réseau. Sur un Wi-Fi universitaire restreint, veuillez utiliser la connexion par e-mail.'
      );
    }
    return err?.message || t('認証エラーが発生しました。', 'Authentication error occurred.', 'Une erreur d\'authentification est survenue.');
  };

  const handleGooglePopup = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await signIn();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRedirect = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogleRedirectMode();
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await signInWithEmail(email, password);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < 6) {
      setError(t('パスワードは6文字以上必要です。', 'Password must be at least 6 characters.', 'Le mot de passe doit comporter au moins 6 caractères.'));
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await signUpWithEmail(email, password, displayName);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await sendPasswordReset(email);
      setSuccessMessage(
        t(
          `「${email}」宛にパスワード設定メールの送信リクエストを完了しました。過去にGoogle連携または新規登録したアドレスであれば数分以内にメールが届きます（届かない場合は迷惑メールフォルダをご確認いただくか、未登録の場合は「新規登録」をお試しください）。`,
          `Password reset request processed for "${email}". If this address was previously registered, an email will arrive shortly (check Spam folder, or use "Sign Up" if it was never registered).`,
          `Demande traitée pour "${email}". Si cette adresse est enregistrée, vous recevrez un e-mail sous peu (vérifiez vos spams).`
        )
      );
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md h-[540px] max-h-[82vh] my-auto overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm shadow-indigo-200">
              <Shield size={16} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base leading-tight">
                {t('NavFOR サインイン', 'NavFOR Sign In', 'Connexion NavFOR')}
              </h2>
              <p className="text-[11px] text-slate-500">
                {t('安全なクラウド同期とデータ保護', 'Secure Cloud Sync & Data Protection', 'Synchronisation cloud sécurisée')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="shrink-0 flex border-b border-slate-200 bg-slate-100/70 p-1 gap-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setTab('google'); setError(null); setSuccessMessage(null); }}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              tab === 'google' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-3.5 h-3.5" alt="" />
            <span>Google</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('email'); setError(null); setSuccessMessage(null); }}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              tab === 'email' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Mail size={13} />
            <span>{t('メールログイン', 'Email Login', 'E-mail')}</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(null); setSuccessMessage(null); }}
            className={`flex-1 py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              tab === 'signup' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <UserPlus size={13} />
            <span>{t('新規登録', 'Sign Up', 'Créer')}</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('reset'); setError(null); setSuccessMessage(null); }}
            className={`flex-1 py-2 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-[11px] ${
              tab === 'reset' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-slate-600 hover:text-indigo-600 hover:bg-white/50'
            }`}
            title={t('Googleアカウントの既存データと紐付け', 'Link existing Google account data', 'Lier les données du compte Google')}
          >
            <KeyRound size={12} />
            <span className="truncate">{t('データ紐付け', 'Link / Reset', 'Lier')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* TAB 1: GOOGLE */}
          {tab === 'google' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                {t(
                  'Googleアカウントでワンクリックログインします。',
                  'One-click sign-in with your Google account.',
                  'Connexion en un clic avec votre compte Google.'
                )}
              </p>

              <button
                onClick={handleGooglePopup}
                disabled={loading}
                className="w-full py-3 px-4 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm font-bold flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] transition-all shadow-sm"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
                <span>{loading ? t('接続中...', 'Connecting...', 'Connexion...') : t('Googleアカウントでログイン', 'Continue with Google', 'Continuer avec Google')}</span>
              </button>

              {/* Strict network helper banner */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                  <HelpCircle size={14} className="shrink-0" />
                  <span>{t('大学Wi-Fi（Sorbonne大等）で接続できない場合', 'If connecting on strict campus Wi-Fi', 'En cas de blocage sur Wi-Fi universitaire')}</span>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-relaxed">
                  {t(
                    '※ ChromeやSafariの最新セキュリティ仕様（Cookie・ストレージ分離）により、リダイレクト方式はvercel.appやgithub.io等の別ドメインで認証の受渡しが失敗することがあります。通常のWi-Fi環境ではポップアップ方式を、学内Wi-Fi等でGoogle認証が遮断される場合は「メールログイン」をご利用いただくのが最も確実です。',
                    'Note: Due to browser partitioned storage policies in Chrome/Safari, redirect login may bounce back on external domains. Use Popup on standard networks, or Email Login on restrictive campus Wi-Fi.',
                    'Note : En raison des restrictions de stockage inter-domaines, utilisez le popup sur réseau standard ou la connexion e-mail sur réseau restreint.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleGoogleRedirect}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-amber-100/70 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight size={13} />
                  <span>{t('リダイレクト方式でGoogleログインを試す', 'Try Google Sign-in via Redirect', 'Essayer via redirection')}</span>
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setTab('email'); setError(null); }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2"
                >
                  {t('→ メールアドレスとパスワードでログインする', '→ Sign in with Email & Password instead', '→ Se connecter par e-mail et mot de passe')}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EMAIL LOGIN */}
          {tab === 'email' && (
            <form onSubmit={handleEmailSignIn} className="space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                {t(
                  '登録済みのメールアドレスとパスワードでログインします（大学などの制限ネットワークでも確実に接続できます）。',
                  'Sign in with your email and password (reliable even on restrictive campus networks).',
                  'Connectez-vous avec votre e-mail et mot de passe (fiable même sur réseau universitaire).'
                )}
              </p>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  {t('メールアドレス', 'Email Address', 'Adresse e-mail')}
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase">
                    {t('パスワード', 'Password', 'Mot de passe')}
                  </label>
                  <button
                    type="button"
                    onClick={() => { setTab('reset'); setError(null); }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    {t('お忘れの方・Google連携', 'Forgot / Link Google', 'Oublié / Lier Google')}
                  </button>
                </div>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
              >
                <LogIn size={15} />
                <span>{loading ? t('ログイン中...', 'Signing in...', 'Connexion...') : t('ログイン', 'Sign In', 'Se connecter')}</span>
              </button>

              <div className="pt-2 text-center text-xs text-slate-500">
                {t('元々Googleでログインしていた方は', 'Previously signed in with Google?', 'Déjà connecté avec Google ?')}{' '}
                <button
                  type="button"
                  onClick={() => { setTab('reset'); setError(null); }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  {t('パスワードを設定してデータ引継ぎ', 'Link & set password', 'Lier & définir un mot de passe')}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: SIGN UP */}
          {tab === 'signup' && (
            <form onSubmit={handleEmailSignUp} className="space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                {t(
                  '新しいアカウントを作成します。すべてのデバイス間でリアルタイムに同期されます。',
                  'Create a new account. Syncs across all your devices in real-time.',
                  'Créez un nouveau compte avec synchronisation en temps réel.'
                )}
              </p>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  {t('お名前 / ニックネーム (任意)', 'Display Name (Optional)', 'Nom affiché (facultatif)')}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  {t('メールアドレス', 'Email Address', 'Adresse e-mail')}
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  {t('パスワード (6文字以上)', 'Password (6+ chars)', 'Mot de passe (6+ caractères)')}
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
              >
                <UserPlus size={15} />
                <span>{loading ? t('作成中...', 'Creating...', 'Création...') : t('アカウント作成', 'Create Account', 'Créer le compte')}</span>
              </button>
            </form>
          )}

          {/* TAB 4: DATA LINK & PASSWORD SETUP */}
          {tab === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs">
                  <Sparkles size={14} className="text-indigo-600 shrink-0" />
                  <span>{t('既存Googleアカウントのデータ引き継ぎ', 'Link existing Google account data', 'Conserver les données du compte Google')}</span>
                </div>
                <p className="text-[11px] text-indigo-950/80 leading-relaxed">
                  {t(
                    '過去にGoogleアカウントで作成したタスクや設定などのデータを失わずに、大学Wi-Fi等でメールログインしたい場合に利用します。Googleアカウントと同じメールアドレスを入力して送信すると、届いたメールからパスワードを設定でき、同じユーザーID（全データ共有）のままメールログインが可能になります。',
                    'Keep all your tasks and settings while enabling email/password login for restrictive campus Wi-Fi. Enter the email of your Google account: you will receive a secure link to set a password that shares the exact same user ID and data.',
                    'Conservez toutes vos tâches tout en activant la connexion par e-mail. Entrez l\'e-mail de votre compte Google pour définir un mot de passe et conserver le même ID utilisateur.'
                  )}
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  {t('Googleアカウントのメールアドレス', 'Google Account Email', 'E-mail du compte Google')}
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@gmail.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
              >
                <KeyRound size={15} />
                <span>{loading ? t('送信中...', 'Sending...', 'Envoi...') : t('パスワード設定・再設定メールを送信', 'Send Password Setup Email', 'Envoyer le lien de mot de passe')}</span>
              </button>

              {/* Delivery notice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-[11px] text-slate-500">
                <p className="font-bold text-slate-700 flex items-center gap-1">
                  <HelpCircle size={13} className="text-slate-400" />
                  <span>{t('メールが届かない場合のご注意', 'Important note on email delivery', 'Remarque sur la réception de l\'e-mail')}</span>
                </p>
                <p className="leading-relaxed">
                  {t(
                    '① 未登録アドレスへの対策: セキュリティ保護仕様により、過去にGoogle連携や登録を行ったことがない未登録アドレスの場合、送信完了と表示されても実際にはメールは送られません。新規利用は「新規登録」タブをご利用ください。',
                    '1. Unregistered addresses: Due to security protection, no email is sent to addresses never registered before. For new accounts, please use the "Sign Up" tab.',
                    '1. Adresses non enregistrées : aucun e-mail n\'est envoyé aux adresses non enregistrées. Utilisez l\'onglet "Créer".'
                  )}
                </p>
                <p className="leading-relaxed">
                  {t(
                    '② 迷惑メールフォルダ: メールフィルターの判定によって「迷惑メール (Junk / Spam)」フォルダに自動分類されてしまうことがあります。届かない場合は迷惑メールフォルダもご確認ください。',
                    '2. Spam folder: Security filters may classify the message as Junk / Spam. Please check your spam folder as well if not received.',
                    '2. Courrier indésirable : les filtres de sécurité peuvent classer l\'e-mail comme Spam. Veuillez vérifier ce dossier.'
                  )}
                </p>
              </div>

              <div className="pt-2 text-center text-xs text-slate-500">
                {t('パスワードを設定済みの方は', 'Already set your password?', 'Mot de passe déjà défini ?')}{' '}
                <button
                  type="button"
                  onClick={() => { setTab('email'); setError(null); }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  {t('メールログインへ', 'Go to Email Login', 'Connexion par e-mail')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="shrink-0 px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>{t('データは安全に暗号化されます', 'Data is securely encrypted', 'Données chiffrées')}</span>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-slate-600 hover:text-slate-900"
          >
            {t('閉じる', 'Close', 'Fermer')}
          </button>
        </div>
      </div>
    </div>
  );
};
