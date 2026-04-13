"use client";

import { useState } from "react";

export default function AdminPushPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!title || !body) return;
    // In production: POST /api/push { title, body, target: 'all' }
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Push Notifications</h1>

      <div className="max-w-lg space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notification body"
            rows={3}
            className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Target</label>
          <select className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500">
            <option value="all">All users</option>
            <option value="es">Spanish users</option>
            <option value="en">English users</option>
            <option value="fr">French users</option>
            <option value="it">Italian users</option>
            <option value="de">German users</option>
            <option value="free">Free plan</option>
            <option value="premium">Premium / Skills</option>
          </select>
        </div>
        <button type="button"
          onClick={handleSend}
          disabled={!title || !body}
          className="px-6 py-3 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-500 transition disabled:opacity-40"
        >
          {sent ? "Sent!" : "Send Push to All"}
        </button>
      </div>
    </div>
  );
}
