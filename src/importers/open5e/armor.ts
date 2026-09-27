import "dotenv/config";
import { runItemDetailImport } from "./item-details-common.js";

await runItemDetailImport({ endpoint: "armor", label: "armor", detailType: "armor" });
