import { ApolloClient, InMemoryCache, createHttpLink, from } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { store } from "../store/index.js";
import { setCredentials, logout } from "../features/auth/authSlice.js";

const REFRESH_BODY = `mutation Refresh($input: RefreshTokenInput!) {
  refreshToken(input: $input) { accessToken refreshToken }
}`;

const httpLink = createHttpLink({ uri: "/graphql" });

const authLink = setContext((_operation, { headers }) => {
  const token = store.getState().auth.accessToken;
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

let isRefreshing = false;
const pendingQueue = [];

async function refreshSession() {
  const { refreshToken } = store.getState().auth;
  if (!refreshToken) throw new Error("No refresh token");

  const res = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: REFRESH_BODY, variables: { input: { refreshToken } } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(json.errors?.[0]?.message ?? "Refresh failed");
  }
  store.dispatch(setCredentials(json.data.refreshToken));
}

function retryWithFreshToken(operation, forward) {
  const { accessToken } = store.getState().auth;
  const prev = operation.getContext();
  operation.setContext({
    headers: {
      ...prev.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  return forward(operation);
}

const refreshLink = onError(({ graphQLErrors, operation, forward }) => {
  const unauthorized = graphQLErrors?.some(
    (err) => err.extensions?.code === "UNAUTHORIZED" && err.message === "Authentication required",
  );
  if (!unauthorized) return undefined;
  if (!store.getState().auth.refreshToken) return undefined;
  if (operation.getContext().retried) return undefined;
  operation.setContext({ retried: true });

  if (!isRefreshing) {
    isRefreshing = true;
    refreshSession()
      .catch(() => {
        store.dispatch(logout());
      })
      .finally(() => {
        isRefreshing = false;
        pendingQueue.splice(0).forEach((resolve) => resolve());
      });
  }

  return new Promise((resolve) => pendingQueue.push(resolve)).then(() =>
    retryWithFreshToken(operation, forward),
  );
});

export const apolloClient = new ApolloClient({
  link: from([authLink, refreshLink, httpLink]),
  cache: new InMemoryCache(),
});
