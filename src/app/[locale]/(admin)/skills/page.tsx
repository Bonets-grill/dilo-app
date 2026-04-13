export default function AdminSkillsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Skills & Packs</h1>
      <div className="space-y-3">
        {[
          { id: "msg_whatsapp", icon: "📤", name: "WhatsApp Messaging", price: "€1.99" },
          { id: "msg_telegram", icon: "✈️", name: "Telegram Messaging", price: "€0.99" },
          { id: "writing", icon: "✍️", name: "Smart Writing", price: "€1.49" },
          { id: "reminders", icon: "⏰", name: "Pro Reminders", price: "€0.99" },
          { id: "finance", icon: "💰", name: "Personal Finance", price: "€1.49" },
          { id: "lists", icon: "📋", name: "Lists & Tasks", price: "€0.99" },
          { id: "voice", icon: "🎤", name: "Premium Voice", price: "€1.99" },
          { id: "translator", icon: "🌍", name: "Pro Translator", price: "€1.49" },
          { id: "tutor", icon: "🎓", name: "Language Tutor", price: "€2.99" },
          { id: "health", icon: "🏥", name: "Health & Wellness", price: "€1.49" },
          { id: "family", icon: "👶", name: "Family & Kids", price: "€1.49" },
          { id: "travel", icon: "✈️", name: "Travel", price: "€1.49" },
          { id: "productivity", icon: "💼", name: "Pro Productivity", price: "€1.49" },
          { id: "legal", icon: "⚖️", name: "Basic Legal", price: "€1.99" },
          { id: "ai_advanced", icon: "🧠", name: "Advanced AI", price: "€2.99" },
          { id: "unlimited", icon: "♾️", name: "Unlimited Messages", price: "€1.99" },
        ].map((s) => (
          <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="text-xl">{s.icon}</span>
              <div>
                <p className="font-medium text-sm">{s.name}</p>
                <p className="text-xs text-gray-600">{s.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-purple-400">{s.price}/mo</span>
              <span className="text-xs text-gray-600">0 users</span>
              <button type="button" className="px-3 py-1 rounded-lg bg-white/5 text-xs text-gray-400 hover:bg-white/10">Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
