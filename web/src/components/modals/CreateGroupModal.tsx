'use client';

import React, { useState } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { X, Users, Check } from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const { currentUser, users, createGroup } = usePayd();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(currentUser.default_currency || 'AED');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUser.id]);
  const [error, setError] = useState<string | null>(null);

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

    try {
      createGroup(name.trim(), description.trim(), selectedUserIds, currency);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 text-white font-body">
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm text-white">CREATE NEW GROUP</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-zinc-400 hover:text-white transition">
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
            <label className="text-[11px] font-heading text-zinc-400">GROUP NAME</label>
            <input
              type="text"
              required
              placeholder="e.g. Dubai Villa, Supper Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 font-body"
            />
          </div>

          <div>
            <label className="text-[11px] font-heading text-zinc-400">DESCRIPTION</label>
            <input
              type="text"
              placeholder="e.g. Shared expenses, rent, groceries"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 px-3.5 py-2.5 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 font-body"
            />
          </div>

          <div>
            <label className="text-[11px] font-heading text-zinc-400">LEDGER CURRENCY</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-[#09090b] border border-white/10 rounded-xl focus:outline-none focus:border-violet-500 text-white font-body"
            >
              <option value="AED">AED (UAE Dirham)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
            </select>
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
                        ? 'border-violet-500 bg-[#22222a]'
                        : 'border-white/6 hover:bg-[#202025]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                        {u.name.slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium">
                        {u.name} {isCreator ? '(Creator)' : ''}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2 font-body">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-zinc-300 hover:bg-[#27272a] text-xs font-heading tracking-wider transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-xs font-heading tracking-wider shadow-lg shadow-violet-600/30 transition active:scale-95"
            >
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
