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
  /** The number alone in figures (DESIGN §3.3), as Martian Mono has no Arabic letters for a unit */
  figures?: boolean;
  className?: string;
  /** The number's own classes, as a sold price's strike (DESIGN §6.3) */
  amountClassName?: string;
  /** The unit's own classes, as a price's muted unit (DESIGN §7.2.3) */
  unitClassName?: string;
};

export function Quantity({
  value,
  unit,
  names,
  figures = false,
  className,
  amountClassName,
  unitClassName,
}: QuantityProps) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <bdi dir="ltr" className={cn(figures && "figures", amountClassName) || undefined}>
        {formatAmount(value, unit, names.locale)}
      </bdi>
      {NO_BREAK_SPACE}
      {isSpoken(unit) ? (
        <>
          <span aria-hidden="true" className={unitClassName}>
            {names.unit[unit]}
          </span>
          <span className="sr-only">{names.spoken[unit]}</span>
        </>
      ) : (
        <UnitName className={unitClassName}>{names.unit[unit]}</UnitName>
      )}
    </span>
  );
}

/** A unit's name as text, or in a span where it has classes of its own */
function UnitName({ className, children }: { className: string | undefined; children: string }) {
  return className === undefined ? children : <span className={className}>{children}</span>;
}
