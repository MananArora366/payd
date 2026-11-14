'use client';

import React, { useEffect, useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { X, Users, Check } from 'lucide-react';
import { useDialog } from '@/lib/hooks/useDialog';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const { currentUser, users, createGroup } = usePayd();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // AED-only ledger (multi-currency coming soon)
  const currency = 'AED';
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUser.id]);
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setSelectedUserIds([currentUser.id]);
    setError(null);
  }, [isOpen, currentUser.id]);

  const { dialogProps, titleId } = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    if (userId === currentUser.id) return; // Creator is always included
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide a group name.');
      return;
    }
    if (name.trim().length > 60) {
      setError('Group name must be 60 characters or fewer.');
      return;
    }
    const members = Array.from(new Set([currentUser.id, ...selectedUserIds]));

    try {
      createGroup(name.trim(), description.trim(), members, currency);
      onClose();
    } catch {
      setError("We couldn't create that group. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div {...dialogProps} className="focus:outline-none w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 text-white font-body">
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <h2 id={titleId} className="font-heading text-sm text-white">Create new group</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full text-zinc-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-heading text-zinc-400">Group name</label>
            <input
              type="text"
              required
              placeholder="e.g. Dubai Villa, Supper Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white placeholder:text-zinc-600 font-body"
            />
          </div>

          <div>
            <label className="text-[11px] font-heading text-zinc-400">Description</label>
            <input
              type="text"
              placeholder="e.g. Shared expenses, rent, groceries"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-silver-500 text-white placeholder:text-zinc-600 font-body"
            />
          </div>

          <div>
            <label className="text-[11px] font-heading text-zinc-400">Ledger currency</label>
            <select
              value={currency}
              disabled
              aria-describedby="group-currency-note"
              className="w-full mt-1 px-3 py-2 text-sm bg-[#09090b] border border-white/10 rounded-xl text-zinc-400 font-body cursor-not-allowed"
            >
              <option value="AED">AED (UAE Dirham)</option>
            </select>
            <p id="group-currency-note" className="mt-1 text-[10px] text-zinc-500">
              AED only for now (multi-currency coming soon)
            </p>
          </div>

          <div>
            <label className="text-[11px] font-heading text-zinc-400 mb-2 block">
              ADD MEMBERS ({selectedUserIds.length})
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {users.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                const isCreator = u.id === currentUser.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'border-silver-500 bg-[#22222a]'
                        : 'border-white/6 hover:bg-[#202025]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-white">
                        {u.name.slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium">
                        {u.name} {isCreator ? '(Creator)' : ''}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-silver-400" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2 font-body">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-zinc-300 hover:bg-[#27272a] text-sm font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-silver-100 hover:bg-white text-zinc-900 text-sm font-semibold transition active:scale-95"
            >
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
