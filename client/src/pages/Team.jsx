import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { CLINIC_QUERY, CLINIC_USERS_QUERY, INVITE_STAFF_MUTATION } from "../features/clinic/api.js";
import { Button, Input } from "../components/ui/index.js";

const initialForm = { name: "", email: "", role: "STAFF" };

export function Team() {
  const { data: clinicData } = useQuery(CLINIC_QUERY);
  const { data: usersData, refetch } = useQuery(CLINIC_USERS_QUERY);
  const [inviteStaff, { loading }] = useMutation(INVITE_STAFF_MUTATION);
  const [form, setForm] = useState(initialForm);
  const [inviteToken, setInviteToken] = useState(null);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInviteToken(null);
    try {
      const { data } = await inviteStaff({ variables: { input: form } });
      setInviteToken(data.inviteStaff.inviteToken);
      setForm(initialForm);
      refetch();
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Invite failed");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="mt-1 text-sm text-gray-500">{clinicData?.clinic?.name}</p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Invite a team member</h2>
        <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full name" value={form.name} onChange={set("name")} required />
          <Input label="Email" type="email" value={form.email} onChange={set("email")} required />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Role</span>
            <select
              value={form.role}
              onChange={set("role")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="STAFF">Receptionist / Staff</option>
              <option value="DOCTOR">Doctor</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {inviteToken && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">Share this invite link (email delivery arrives in Phase 2)</p>
            <p className="mt-1 break-all font-mono text-xs">{inviteToken}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Members</h2>
        <ul className="mt-4 divide-y">
          {(usersData?.clinicUsers ?? []).map((u) => (
            <li key={u.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">{u.name}</p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {u.role}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
