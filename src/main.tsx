import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalContext } from "./context/Global";
import Database from "@tauri-apps/plugin-sql";

let db: Database;
const loadDatabase = async () => {
  db = await Database.load('sqlite:data.db');
  return db;
}

loadDatabase().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <GlobalContext.Provider value={{ db }}>
        <App />
      </GlobalContext.Provider>
    </React.StrictMode>,
  );
});
