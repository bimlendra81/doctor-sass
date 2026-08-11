import { createSlice } from "@reduxjs/toolkit";

const TOKEN_KEY = "doctor_sass_tokens";
const USER_KEY = "doctor_sass_user";

function loadPersisted() {
  try {
    const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null") ?? {};
    const user = JSON.parse(localStorage.getItem(USER_KEY) ?? "null") ?? null;
    return { accessToken: tokens.accessToken ?? null, refreshToken: tokens.refreshToken ?? null, user };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

const persisted = loadPersisted();

const initialState = {
  user: persisted.user,
  accessToken: persisted.accessToken,
  refreshToken: persisted.refreshToken,
};

function persist(state) {
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ accessToken: state.accessToken, refreshToken: state.refreshToken }),
  );
  if (state.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(state.user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action) {
      const { accessToken, refreshToken, user } = action.payload;
      if (accessToken !== undefined) state.accessToken = accessToken;
      if (refreshToken !== undefined) state.refreshToken = refreshToken;
      if (user) state.user = user;
      persist(state);
    },
    setUser(state, action) {
      state.user = action.payload;
      persist(state);
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
  },
});

export const { setCredentials, setUser, logout } = authSlice.actions;
export const authReducer = authSlice.reducer;
