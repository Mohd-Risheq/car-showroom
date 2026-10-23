import { domAnimation } from "motion/react";

/** Motion's animation features, in a module of their own so that MotionFeatures loads them lazily */
export const features = domAnimation;
