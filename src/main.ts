import { mount } from "svelte";
import App from "./App.svelte";
import "./styles.css";

// Navigateur ordinaire (développement ou démo du site) : moteur simulé, rien n'est enregistré (voir simulation.ts)
if ((import.meta.env.DEV || import.meta.env.MODE === "demo") && !("__TAURI_INTERNALS__" in window)) await import("./lib/simulation");

export default mount(App, { target: document.getElementById("app")! });
