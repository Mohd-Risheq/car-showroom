"use client";

import { useSyncExternalStore } from "react";

// The failing page's part: it throws as it renders in the browser while session storage holds
// muftah:fail, which tests/e2e/shell.spec.ts sets, so the segment error shows in the page's place

const FAIL_KEY = "muftah:fail";

// Read on each render, so Try again renders the part once the mark is gone
const subscribe = () => () => {};
const markedToFail = () => sessionStorage.getItem(FAIL_KEY) !== null;
const neverOnServer = () => false;

export function FailingPart() {
  if (useSyncExternalStore(subscribe, markedToFail, neverOnServer)) {
    throw new Error("The shell lab's failing page fails, as session storage asks");
  }
  return <p>The page renders.</p>;
}
