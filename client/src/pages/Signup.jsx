import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAuth } from "../hooks/useAuth.js";
import { Button, Input } from "../components/ui/index.js";

const initialForm = { name: "", email: "", password: "", phone: "" };

export function Signup() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const { signup } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [verificationToken, setVerificationToken] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signup(form);
      setVerificationToken(result.verificationToken);
      setTimeout(() => navigate("/", { replace: true }), 2500);
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-gray-900">Create your clinic account</h1>
        <p className="mt-1 text-sm text-gray-500">You'll set up your clinic next (M3).</p>

        {verificationToken && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">Verify your email (dev mode)</p>
            <p className="mt-1 break-all font-mono text-xs">{verificationToken}</p>
            <p className="mt-1">Email delivery arrives in Phase 2 notifications.</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input label="Full name" value={form.name} onChange={set("name")} autoComplete="name" required />
          <Input label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
          />
          <Input label="Phone (optional)" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
