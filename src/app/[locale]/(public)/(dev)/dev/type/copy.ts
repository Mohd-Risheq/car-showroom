import type { AppLocale } from "@/i18n/routing";

// The specimen's copy, in both languages: the DESIGN §9.2 copy deck and the S01 seed record
// (05-SEED-DATA §5.4). Figures keep their unit outside the Martian Mono span, which has no Arabic.

export type Figure = { label: string; value: string; unit: string | null };

export type SpecimenCopy = {
  wordmark: string;
  display: { name: string; trim: string };
  head: string;
  lead: string;
  body: string;
  small: string;
  figures: Figure[];
};

export const COPY: Record<AppLocale, SpecimenCopy> = {
  en: {
    wordmark: "Muftah",
    display: { name: "Land Cruiser", trim: "GXR" },
    head: "How every car is documented",
    lead: "See the inspection before you see the car.",
    body: "GCC Land Cruiser GXR with the 4.0 V6 and 84,000 km. First owner in Dubai, then one owner in Amman since 2024. Every metal panel is in factory paint, and the rear bumper corner has a cosmetic touch-up. Viewing at the showroom on Airport Road, or ask for a walkaround video on WhatsApp.",
    small: "This information is declared by the dealer. We recommend an independent inspection before you buy.",
    figures: [
      { label: "Model year", value: "2019", unit: null },
      { label: "Kilometres", value: "84,000", unit: "km" },
      { label: "Price", value: "47,500", unit: "JOD" },
      { label: "Paint thickness", value: "136", unit: "µm" },
      { label: "VIN", value: "4T1B31HK3KU190069", unit: null },
    ],
  },
  ar: {
    wordmark: "مفتاح",
    display: { name: "لاندكروزر", trim: "GXR" },
    head: "كيف نوثّق كل سيارة",
    lead: "شوف الفحص قبل ما تشوف السيارة",
    body: "لاندكروزر GXR مواصفات خليجية، ماتور 4.0 V6، ممشى 84,000 كم. المالك الأول في دبي، ثم مالك واحد في عمّان منذ 2024. جميع القطع المعدنية دهان وكالة، وعلى زاوية الصدام الخلفي رشة تجميلية. المعاينة في المعرض على طريق المطار، ويمكن طلب فيديو للسيارة عبر واتساب.",
    small: "هذه المعلومات مقدّمة من المعرض، وننصح بإجراء فحص مستقل قبل الشراء.",
    figures: [
      { label: "سنة الموديل", value: "2019", unit: null },
      { label: "عدد الكيلومترات", value: "84,000", unit: "كم" },
      { label: "السعر", value: "47,500", unit: "د.أ" },
      { label: "سماكة الدهان", value: "136", unit: "ميكرون" },
      { label: "رقم الشاصي", value: "4T1B31HK3KU190069", unit: null },
    ],
  },
};

/** The DESIGN §3.3 steps as the specimen labels them */
export const STEPS = [
  { id: "display", spec: "clamp(3.5rem, 2rem + 6vw, 6rem) · lh 1.0, Arabic 1.25 · wght 600 · HEXP 100" },
  { id: "head", spec: "clamp(2rem, 1.3rem + 3.2vw, 4rem) · lh 1.1, Arabic 1.35 · wght 600 · HEXP 60" },
  { id: "lead", spec: "clamp(1.25rem, 1.1rem + 0.6vw, 1.625rem) · lh 1.35, Arabic 1.6 · wght 400 · HEXP 20" },
  { id: "body", spec: "clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem), Arabic ×1.06 · lh 1.5, Arabic 1.8 · 65ch" },
  { id: "small", spec: "13 to 14 px · lh 1.4, Arabic 1.6 · wght 400" },
] as const;

/** A fully joined Arabic word, every letter connected to the next, for the join check */
export const JOINED_AR = "بسيطة";

export const HEXP_VALUES = [0, 50, 100] as const;
export const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
