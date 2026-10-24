// DESIGN §9.4: a phone number shows grouped, "+962 79 123 4567". Numbers are stored in E.164 (VR-20).
// A Jordanian mobile, 77, 78 or 79 and seven more digits as VR-20 has it, groups as 79 123 4567; a
// landline, one of the area codes 2, 3, 5 and 6 and seven digits, as 6 123 4567. Any other number
// shows as stored.
const JORDAN_MOBILE = /^\+962(7[789])(\d{3})(\d{4})$/;
const JORDAN_LANDLINE = /^\+962([2356])(\d{3})(\d{4})$/;

/**
 * A stored phone number as it shows (DESIGN §9.5). The caller isolates it left to right, as a
 * number: unisolated in Arabic text, its groups would show in reverse, "4567 123 79 962+".
 */
export function formatPhone(e164: string): string {
  const groups = JORDAN_MOBILE.exec(e164) ?? JORDAN_LANDLINE.exec(e164);
  return groups === null ? e164 : ["+962", ...groups.slice(1)].join(" ");
}
