import React, { useState } from 'react';
import { Octokit } from 'octokit';
import { GitBranch, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { FreelanceJob } from '../types';

interface GitHubWorkflowManagerProps {
  job: FreelanceJob;
  githubToken: string;
  githubUseSSH?: boolean;
  githubSSHKey?: string;
  onRepoCreated: (repoUrl: string) => void;
  autoStart?: boolean;
}

export const GitHubWorkflowManager: React.FC<GitHubWorkflowManagerProps> = ({
  job,
  githubToken,
  githubUseSSH = false,
  githubSSHKey = '',
  onRepoCreated,
  autoStart = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initWorkflow = async () => {
    if (!githubUseSSH && !githubToken) {
      setError('توکن یا کلید SSH گیت‌هاب تنظیم نشده است.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const repoName = `auto-${job.platformKey}-${job.id}`;
      let repoUrl = '';

      if (githubUseSSH) {
        // Logic for SSH Repo creation via API needs octokit authentication still
        // or a server-side route. Assuming octokit auth works with token,
        // we use token to create, then setup via SSH.
        if (!githubToken) {
          throw new Error('برای ایجاد مخزن، توکن PAT الزامی است.');
        }
        const octokit = new Octokit({ auth: githubToken });
        const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          private: true,
          auto_init: true,
        });
        repoUrl = repo.html_url;
      } else {
        const octokit = new Octokit({ auth: githubToken });
        const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          private: true,
          auto_init: true,
        });
        repoUrl = repo.html_url;
      }
      
      onRepoCreated(repoUrl);
    } catch (err: any) {
      setError(err.message || 'خطا در راه‌اندازی ورک‌فلو');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (autoStart && !loading && !error) {
      initWorkflow();
    }
  }, [autoStart]);

  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-sky-400" />
        مدیریت ورک‌فلو گیت‌هاب
      </h3>
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="h-3 w-3"/> {error}</p>}
      <button
        onClick={initWorkflow}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-bold disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'شروع خودکار مخزن گیت‌هاب'}
      </button>
    </div>
  );
};
