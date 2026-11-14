'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePayd } from '@/lib/store/PaydContext';
import { Users, CheckCircle2, ArrowRight, ShieldCheck, LinkIcon } from 'lucide-react';
import { extractInviteToken, resolveInviteGroup } from '@/components/groups/groupLogic';

export default function JoinGroupPage() {
  const params = useParams();
  const router = useRouter();
  const rawToken = params?.token;
  const token = extractInviteToken(Array.isArray(rawToken) ? rawToken[0] || '' : (rawToken as string) || '');

  const { groups, groupMembers, currentUser, joinGroupByToken, getGroupMembers } = usePayd();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview only the group this exact token refers to (same rules as joinGroupByToken)
  const group = resolveInviteGroup(token, groups);
  const alreadyMember =
    !!group && groupMembers.some((m) => m.group_id === group.id && m.user_id === currentUser.id);
  const memberCount = group ? getGroupMembers(group.id).length : 0;

  const handleJoin = () => {
    setError(null);
    let res: { success: boolean; error?: string };
    try {
      res = joinGroupByToken(token);
    } catch {
      res = { success: false };
    }
    if (res.success) {
      setJoined(true);
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } else {
      setError('Invite not found or expired. Ask the group admin for a new link.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#09090b] text-white font-body">
      <div className="w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
        {!group ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <LinkIcon className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] font-heading uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300">
                Invite unavailable
              </span>
              <h1 className="font-heading text-xl text-white mt-2">Invite not found or expired</h1>
              <p className="text-xs text-zinc-400 mt-1">
                This invite link doesn&apos;t match any group. Ask the group admin to send a fresh link.
              </p>
            </div>
            <Link
              href="/"
              className="w-full py-3 rounded-2xl bg-[#27272a] hover:bg-[#3f3f46] text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
            >
              Back to Payd
            </Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-zinc-700 flex items-center justify-center text-white mx-auto">
              <Users className="w-8 h-8" />
            </div>

            <div>
              <span className="text-[10px] font-heading uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-silver-500/20 text-silver-300">
                Group Invitation
              </span>
              <h1 className="font-heading text-xl text-white mt-2">Join {group.name}</h1>
              {group.description && <p className="text-xs text-zinc-400 mt-1">{group.description}</p>}
              <p className="text-[11px] text-zinc-500 mt-1">
                {memberCount} member{memberCount === 1 ? '' : 's'} • AED ledger
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
                {error}
              </div>
            )}

            {joined ? (
              <div role="status" className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>Joined group! Redirecting to dashboard...</span>
              </div>
            ) : alreadyMember ? (
              <div className="space-y-3">
                <div role="status" className="p-3 bg-[#09090b] border border-white/10 rounded-xl text-xs text-zinc-300">
                  You&apos;re already a member of <strong className="text-white">{group.name}</strong>.
                </div>
                <Link
                  href="/"
                  className="w-full py-3 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2 transition"
                >
                  <span>Open Payd</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-[#09090b] border border-white/10 rounded-xl text-xs text-zinc-400">
                  Joining as <strong className="text-white">{currentUser.name}</strong> ({currentUser.email})
                </div>

                <button
                  type="button"
                  onClick={handleJoin}
                  className="w-full py-3 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <span>Accept & Join Group</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Payd Voice-First Shared Expense Ledger</span>
        </div>
      </div>
    </div>
  );
}
