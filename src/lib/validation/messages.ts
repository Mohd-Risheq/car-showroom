import type en from "../../../messages/en.json";

/** The key of a validation message (DESIGN §9.2, "Validation") */
export type ValidationKey = `validation.${keyof (typeof en)["validation"]}`;

// Empty, malformed and fractional input on any field (SRS §7.1)
export const ANY_FIELD_MESSAGES = [
  "validation.required",
  "validation.invalid",
  "validation.integer",
] as const satisfies readonly ValidationKey[];

// The messages each validation rule of SRS §7.1 shows besides those. A rule with none swaps its
// input silently (VR-05), takes only what the interface offers (VR-08) or reads no input (VR-29).
export const RULE_MESSAGES = {
  "VR-01": ["validation.price"],
  "VR-02": ["validation.year"],
  "VR-03": ["validation.km"],
  "VR-04": ["validation.vin", "validation.vinCheckDigit", "validation.vinCheckDigitWarn", "validation.vinCheckDigitOk"],
  "VR-05": [],
  "VR-06": ["validation.maxChars"],
  "VR-07": ["validation.description", "validation.maxChars"],
  "VR-08": [],
  "VR-09": ["validation.photoCount", "validation.photoType", "validation.fileSize"],
  "VR-10": ["validation.range"],
  "VR-11": ["validation.range"],
  "VR-12": ["validation.microns"],
  "VR-13": ["validation.percent", "validation.sohSource"],
  "VR-14": ["validation.milestonesMax", "validation.futureDate"],
  "VR-15": ["validation.titleBrand"],
  "VR-16": ["validation.audioLength", "validation.fileSize", "validation.audioSource"],
  "VR-17": ["validation.spinFrames"],
  "VR-18": ["validation.hotspotNote", "validation.maxChars"],
  "VR-19": ["validation.reportFile"],
  "VR-20": ["validation.phone"],
  "VR-21": ["validation.nameLength"],
  "VR-22": ["validation.email"],
  "VR-23": ["validation.coordinates"],
  "VR-24": ["validation.socialUrl"],
  "VR-25": ["validation.unitPrice"],
  "VR-26": ["validation.hours", "validation.hoursOverlap"],
  "VR-27": ["validation.ramadan"],
  "VR-28": ["validation.featured"],
  "VR-29": [],
  "VR-30": [
    "validation.passwordLength",
    "validation.maxChars",
    "validation.passwordEmail",
    "validation.passwordCommon",
    "validation.passwordBreached",
  ],
  "VR-31": ["validation.dimension", "validation.wheelbaseShorter"],
  "VR-32": ["validation.maxChars"],
} as const satisfies Record<`VR-${number}`, readonly ValidationKey[]>;

export type ValidationRule = keyof typeof RULE_MESSAGES;
