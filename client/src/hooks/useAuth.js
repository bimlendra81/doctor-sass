import { useCallback } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import { useApolloClient, useMutation } from "@apollo/client";
import { logout as logoutAction, setCredentials } from "../features/auth/authSlice.js";
import {
  LOGIN_MUTATION,
  SIGNUP_MUTATION,
  LOGOUT_MUTATION,
} from "../features/auth/api.js";

export function useAuth() {
  const dispatch = useDispatch();
  const store = useStore();
  const apollo = useApolloClient();
  const user = useSelector((state) => state.auth.user);
  const accessToken = useSelector((state) => state.auth.accessToken);

  const [loginMutation] = useMutation(LOGIN_MUTATION);
  const [signupMutation] = useMutation(SIGNUP_MUTATION);
  const [logoutMutation] = useMutation(LOGOUT_MUTATION);

  const login = useCallback(
    async ({ email, password }) => {
      const { data } = await loginMutation({ variables: { input: { email, password } } });
      dispatch(setCredentials(data.login));
      return data.login.user;
    },
    [loginMutation, dispatch],
  );

  const signup = useCallback(
    async (input) => {
      const { data } = await signupMutation({ variables: { input } });
      dispatch(setCredentials(data.signup));
      return data.signup;
    },
    [signupMutation, dispatch],
  );

  const logout = useCallback(async () => {
    const { refreshToken } = store.getState().auth;
    if (refreshToken) {
      try {
        await logoutMutation({ variables: { refreshToken } });
      } catch {
        // Token already revoked or network error — clear locally regardless.
      }
    }
    await apollo.resetStore().catch(() => {});
    dispatch(logoutAction());
  }, [logoutMutation, store, apollo, dispatch]);

  return { user, accessToken, login, signup, logout, isAuthenticated: Boolean(user) };
}
