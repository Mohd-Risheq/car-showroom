// The feature catalog's keys (SRS §6.4), in the wizard's three checklists (FR-31 step 3) and in
// SRS order. car.features holds them, and VR-08 refuses any other. Import-free, so the seed scripts
// and the browser can both load it.

export const FEATURE_GROUPS = {
  interior: [
    ...["aux_usb", "airbags", "leather_seats", "electric_seats", "sport_seats", "steering_controls"],
    ...["cooled_seats", "heated_seats", "memory_seats", "electric_rear_seat", "electric_windows"],
    ...["heated_steering", "central_lock", "air_conditioning", "alarm"],
  ],
  exterior: [
    ...["drl", "folding_mirrors", "electric_mirrors", "spare_tyre", "alloy_wheels", "xenon", "led_lights"],
    ...["front_sensors", "rear_sensors", "sports_package", "keyless_entry", "tow_hitch", "sunroof"],
    "panoramic_roof",
  ],
  technology: [
    ...["remote_start", "media_screen", "sport_suspension", "forward_collision", "abs", "navigation"],
    ...["blind_spot", "auto_lock", "lane_departure", "camera_360", "carplay", "android_auto", "tpms"],
    ...["rear_camera", "diff_lock", "traction_control", "voice_control", "adaptive_cruise"],
    ...["cruise_control", "bluetooth", "touch_screen", "park_assist"],
  ],
} as const;

export const FEATURE_KEYS = [
  ...FEATURE_GROUPS.interior,
  ...FEATURE_GROUPS.exterior,
  ...FEATURE_GROUPS.technology,
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
