import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useMutation } from "@apollo/client";
import { setCredentials } from "../features/auth/authSlice.js";
import { CREATE_CLINIC_MUTATION } from "../features/clinic/api.js";
import { Button, Input } from "../components/ui/index.js";

export function SetupClinic() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [createClinic, { loading }] = useMutation(CREATE_CLINIC_MUTATION);
  const [form, setForm] = useState({ name: "", subdomain: "", plan: "FREE" });
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await createClinic({ variables: { input: form } });
      dispatch(
        setCredentials({
          accessToken: data.createClinic.accessToken,
          refreshToken: data.createClinic.refreshToken,
          user: data.createClinic.user,
        }),
      );
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Could not create clinic");
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-gray-900">Set up your clinic</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your clinic subdomain is the public workspace link (e.g.{" "}
          <code className="rounded bg-gray-100 px-1">smithclinic.clinic.com</code>).
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input label="Clinic name" value={form.name} onChange={set("name")} placeholder="Smith Clinic" required />
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Subdomain</span>
            <div className="flex items-center rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-blue-200">
              <input
                value={form.subdomain}
                onChange={set("subdomain")}
                placeholder="smithclinic"
                className="w-full rounded-l-lg px-3 py-2 text-sm focus:outline-none"
                required
              />
              <span className="rounded-r-lg border-l bg-gray-50 px-3 py-2 text-sm text-gray-500">
                .clinic.com
              </span>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Plan</span>
            <select
              value={form.plan}
              onChange={set("plan")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating clinic…" : "Create clinic"}
          </Button>
        </form>
      </div>
    </div>
  );
}
