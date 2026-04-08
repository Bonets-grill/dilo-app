export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: "0" },
          { label: "Active Today", value: "0" },
          { label: "Skills Sold", value: "0" },
          { label: "MRR", value: "€0" },
          { label: "Messages Today", value: "0" },
          { label: "WA Connected", value: "0" },
          { label: "TG Connected", value: "0" },
          { label: "Avg Response", value: "0ms" },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-sm mt-8">Connect Supabase to see real data.</p>
    </div>
  );
}
