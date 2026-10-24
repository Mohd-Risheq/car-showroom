import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../../scripts/eslint/mirror-directional-icons.mjs";

// FR-01.7 and DESIGN §3.6: an arrow or a caret along the line mirrors in Arabic with
// rtl:-scale-x-100; media glyphs, brand marks and arrows up, down or both ways don't.

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({
  languageOptions: { sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});

const SSR =
  'import { ArrowRightIcon, CaretLeftIcon, CaretRightIcon, ArrowsLeftRightIcon, ArrowUpIcon, PlayIcon } from "@phosphor-icons/react/ssr";';
const unmirrored = (icon: string) => ({ messageId: "unmirrored", data: { icon } });

tester.run("mirror-directional-icons", rule, {
  valid: [
    `${SSR} <ArrowRightIcon className="size-icon rtl:-scale-x-100" />`,
    // A disclosure caret, at the end when closed and turned down when open: the mirror applies before
    // the rotation, so the rotation has its rtl: counterpart
    `${SSR} <CaretRightIcon aria-hidden className={cn("size-icon rtl:-scale-x-100", open && "rotate-90 rtl:-rotate-90")} />`,
    `${SSR} <CaretLeftIcon className={\`\${base} rtl:-scale-x-100\`} />`,
    // Both ways, up, and media: nothing to mirror
    `${SSR} <><ArrowsLeftRightIcon /><ArrowUpIcon /><PlayIcon /></>`,
    // A component of the same name that isn't Phosphor's, and a namespace that isn't either
    'import { ArrowLeftIcon } from "./arrows"; <ArrowLeftIcon />',
    'import * as Arrows from "./arrows"; <Arrows.ArrowLeftIcon />',
    // Physical glyphs that only name a side
    'import { AlignLeftIcon, ToggleLeftIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react/ssr"; <><AlignLeftIcon /><ToggleLeftIcon /><PaperPlaneTiltIcon /></>',
  ],
  invalid: [
    { code: `${SSR} <ArrowRightIcon />`, errors: [unmirrored("ArrowRightIcon")] },
    { code: `${SSR} <CaretLeftIcon className="size-icon" />`, errors: [unmirrored("CaretLeftIcon")] },
    // Mirrored only from md up, or under another class name, isn't mirrored
    {
      code: `${SSR} <><ArrowRightIcon className="md:rtl:-scale-x-100" /><CaretLeftIcon className="rtl:scale-x-100" /></>`,
      errors: [unmirrored("ArrowRightIcon"), unmirrored("CaretLeftIcon")],
    },
    // Under a local name, from either entry, and by Phosphor's names without the suffix
    {
      code: 'import { CaretDoubleLeftIcon as Back, ArrowUpRight } from "@phosphor-icons/react"; <><Back /><ArrowUpRight /></>',
      errors: [unmirrored("Back"), unmirrored("ArrowUpRight")],
    },
    // Wherever JSX draws it, as a button's icon too
    { code: `${SSR} <Button icon={<ArrowRightIcon />}>Next</Button>`, errors: [unmirrored("ArrowRightIcon")] },
    // Through a namespace, and from any of Phosphor's entries, which eslint.config.mjs refuses as well
    {
      code: 'import * as Icons from "@phosphor-icons/react/ssr"; <><Icons.ArrowRightIcon /><Icons.PlayIcon /></>',
      errors: [unmirrored("Icons.ArrowRightIcon")],
    },
    {
      code: 'import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight"; <ArrowRightIcon />',
      errors: [unmirrored("ArrowRightIcon")],
    },
    // Glyphs whose arrow points along the line, though not named arrows: sign in, sign out and send
    {
      code: 'import { SignInIcon, SignOut, PaperPlaneRightIcon } from "@phosphor-icons/react/ssr"; <><SignInIcon /><SignOut /><PaperPlaneRightIcon /></>',
      errors: [unmirrored("SignInIcon"), unmirrored("SignOut"), unmirrored("PaperPlaneRightIcon")],
    },
  ],
});

describe("the project's ESLint config", () => {
  const eslint = new ESLint();
  const unmirroredIn = async (filePath: string) => {
    const code = `import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";\nexport const Back = () => <ArrowLeftIcon />;\n`;
    const [result] = await eslint.lintText(code, { filePath });
    return (result?.messages ?? []).filter(({ ruleId }) => ruleId === "muftah/mirror-directional-icons").length;
  };

  it("holds shipped components to mirrored arrows, and leaves the development pages their own", async () => {
    expect(await unmirroredIn("src/components/ui/back-link.tsx")).toBe(1);
    expect(await unmirroredIn("src/features/inventory/ui/pager.tsx")).toBe(1);
    expect(await unmirroredIn("src/app/[locale]/(public)/(dev)/dev/locale/arrows.tsx")).toBe(0);
    expect(await unmirroredIn("src/app/_dev/specimen/arrows.tsx")).toBe(0);
  });
});
