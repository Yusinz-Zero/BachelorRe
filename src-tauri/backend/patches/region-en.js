// Region -> EN for both components.
// The OpenBachelor components ship with GAME_REGION = GAME_REGION_CN by default.
// EN is required for the EN PC client (also switches S res/ -> res_en/ + version_en.json).
import fs from "node:fs";
import path from "node:path";

const CN = "GAME_REGION = GameRegion.GAME_REGION_CN";
const EN = "GAME_REGION = GameRegion.GAME_REGION_EN";

const TARGETS = [
  { component: "S", file: "src/openbachelors/const/region.py" },
  { component: "C", file: "src/launcher/openbachelorc/region.py" },
];

function regionPatch(target) {
  return {
    id: "region-en-" + target.component.toLowerCase(),
    component: target.component,
    title: `Region -> EN (${target.component})`,
    description: `Set GAME_REGION to EN in ${target.file}`,
    isApplied(compDir) {
      const p = path.join(compDir, target.file);
      if (!fs.existsSync(p)) return false;
      const txt = fs.readFileSync(p, "utf8");
      return txt.includes(EN) && !/GAME_REGION\s*=\s*GameRegion\.GAME_REGION_CN/.test(txt);
    },
    apply(compDir) {
      const p = path.join(compDir, target.file);
      const txt = fs.readFileSync(p, "utf8");
      if (txt.includes(EN)) return { changed: false, detail: target.file + " already EN" };
      if (!txt.includes(CN)) {
        throw new Error("expected CN assignment not found in " + target.file + " (upstream format changed?)");
      }
      fs.writeFileSync(p, txt.replace(CN, EN), "utf8");
      return { changed: true, detail: target.file + ": CN -> EN" };
    },
  };
}

export default TARGETS.map(regionPatch);
