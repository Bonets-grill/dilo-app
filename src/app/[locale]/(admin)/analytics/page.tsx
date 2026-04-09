export default function AdminAnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Users / Day</h3>
          <div className="h-40 flex items-end justify-around gap-1">
            {[20, 35, 28, 42, 38, 55, 48].map((h, i) => (
              <div key={i} className="w-full bg-purple-500/30 rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex justify-around text-xs text-gray-600 mt-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
        <div className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Revenue / Day</h3>
          <div className="h-40 flex items-end justify-around gap-1">
            {[15, 25, 20, 35, 30, 45, 40].map((h, i) => (
              <div key={i} className="w-full bg-green-500/30 rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex justify-around text-xs text-gray-600 mt-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-gray-600 text-sm mt-8">Connect Supabase for real analytics data.</p>
    </div>
  );
}
