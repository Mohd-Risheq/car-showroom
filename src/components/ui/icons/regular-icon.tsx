import { SSRBase } from "@phosphor-icons/react/ssr";
import type { ComponentProps } from "react";

// The Phosphor icons that code running in the browser draws, at the one weight the site uses,
// regular (DESIGN §3.6). Each of Phosphor's own icons holds all six weights, five never drawn, and
// a client module that imports one brings them all to the page's first load. These hold the
// regular drawing alone, on Phosphor's own SSRBase, so they render exactly as Phosphor's do
// (tests/unit/ui/icons.test.tsx). One module each, as Phosphor's are, so a page carries only the
// icons its code draws. A server component imports from @phosphor-icons/react/ssr, as its icons ship
// no code at all (D-049).

type BaseProps = ComponentProps<typeof SSRBase>;
type RegularIconProps = Omit<BaseProps, "weights" | "weight">;

/** An icon of Phosphor's name that draws its regular weight, the path given */
export function regularIcon(name: string, path: string) {
  const weights: BaseProps["weights"] = new Map([["regular", <path key="regular" d={path} />]]);
  function RegularIcon(props: RegularIconProps) {
    return <SSRBase {...props} weights={weights} />;
  }
  RegularIcon.displayName = `${name}Icon`;
  return RegularIcon;
}
