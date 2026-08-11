import { useState } from "react";
import { useDispatch } from "react-redux";
import { useMutation } from "@apollo/client";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Input } from "../components/ui/index.js";
import { setCredentials } from "../features/auth/authSlice.js";
import { ACCEPT_PATIENT_INVITE_MUTATION } from "../features/portal/api.js";

export function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);

  const [acceptInvite, { loading }] = useMutation(ACCEPT_PATIENT_INVITE_MUTATION);

  if (!token) return <Navigate to="/login" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    try {
      const { data } = await acceptInvite({
        variables: { input: { inviteToken: token, name: name || null, phone: phone || null, password } },
      });
      dispatch(setCredentials(data.acceptPatientInvite));
      navigate("/portal", { replace: true });
    } catch (err) {
      setError(err.graphQLErrors?.[0]?.message ?? err.message ?? "Invite is invalid or expired");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-gray-900">Set up your account</h1>
        <p className="mt-1 text-sm text-gray-500">
          You have been invited as a patient. Choose a password to activate your portal access.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Activate account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
