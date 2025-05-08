import Database from "@tauri-apps/plugin-sql";
import { createContext } from "react";

type GlobalType = {
    db?: Database
}
export const GlobalContext = createContext<GlobalType>({});
