export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left p-3 text-gray-500 font-medium">Name</th>
              <th className="text-left p-3 text-gray-500 font-medium">Email</th>
              <th className="text-left p-3 text-gray-500 font-medium">Locale</th>
              <th className="text-left p-3 text-gray-500 font-medium">Plan</th>
              <th className="text-left p-3 text-gray-500 font-medium">Skills</th>
              <th className="text-left p-3 text-gray-500 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="p-8 text-center text-gray-600">Connect Supabase to see users.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
