import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "./apollo/client.js";
import { store } from "./store/index.js";
import { AppRouter } from "./routes/index.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <ApolloProvider client={apolloClient}>
        <AppRouter />
      </ApolloProvider>
    </Provider>
  </React.StrictMode>,
);
