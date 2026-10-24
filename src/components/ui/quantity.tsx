import { cn } from "@/lib/class-names";
import { formatAmount, isSpoken, NO_BREAK_SPACE, type Unit, type UnitNames } from "@/lib/format/units";

// DESIGN §9.4 and §9.5: a number and its unit. The number sits in a left-to-right isolate, so a
// minus or a decimal point never moves in Arabic, and a no-break space keeps the unit on its line.
// A short unit that screen readers read badly, د.أ or كم, is hidden from them and followed by its
// spoken name, which only they get; what sighted users see doesn't change. formatQuantity writes
// the same as text, where markup can't go.

type QuantityProps = {
  value: number;
  unit: Unit;
  /** The page's locale and unit names, from getUnitNames */
  names: UnitNames;
  className?: string;
};

export function Quantity({ value, unit, names, className }: QuantityProps) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <bdi dir="ltr">{formatAmount(value, unit, names.locale)}</bdi>
      {NO_BREAK_SPACE}
      {isSpoken(unit) ? (
        <>
          <span aria-hidden="true">{names.unit[unit]}</span>
          <span className="sr-only">{names.spoken[unit]}</span>
        </>
      ) : (
        names.unit[unit]
      )}
    </span>
  );
}
