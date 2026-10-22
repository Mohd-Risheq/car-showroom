import type { Metadata } from "next";

// Both root layouts declare their icon here. Until T-19 designs the app's icon, an empty data: icon
// stops browsers asking for /favicon.ico, which has no file and would answer 404 (D-037).
export const NO_ICON_YET: Metadata["icons"] = { icon: "data:," };
