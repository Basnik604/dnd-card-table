import "dotenv/config";
import { runItemDetailImport } from "./item-details-common.js";

await runItemDetailImport({ endpoint: "weapons", label: "weapons", detailType: "weapon" });
