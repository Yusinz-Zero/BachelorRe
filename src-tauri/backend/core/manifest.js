// Component catalog — "load all of OpenBachelor" (S = server, C = client/launcher).
// Version = commit SHA of the master branch (OpenBachelor has no releases/tags).
// G (OpenBachelorG, gate/support) — unused on PC for now; kept as a fallback,
// excluded from store/CLI/UI.

const COMPONENTS = {
  S: {
    id: "S",
    name: "OpenBachelorS",
    role: "Game server (uvicorn HTTP)",
    github: { owner: "pfyy", repo: "OpenBachelorS" },
    branch: "master",
    marker: ["pyproject.toml", "src/openbachelors/app.py"],
  },
  C: {
    id: "C",
    name: "OpenBachelorC",
    role: "PC client prep: gadget inject + attach + trainer",
    github: { owner: "pfyy", repo: "OpenBachelorC" },
    branch: "master",
    marker: ["pyproject.toml", "src/launcher/openbachelorc/main.py"],
  },
};

export function allComponents() {
  return Object.values(COMPONENTS);
}

export function getComponent(id) {
  const c = COMPONENTS[id];
  if (!c) throw new Error(`Unknown component: ${id}`);
  return c;
}
