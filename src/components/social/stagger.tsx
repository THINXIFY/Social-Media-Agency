"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * A list item that fades and rises once when it scrolls into view, staggered
 * by its index. Transform and opacity only (no layout shift); static when the
 * visitor prefers reduced motion.
 */
export function StaggerItem({ index, className, children }: { index: number; className?: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.li
      className={className}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.li>
  );
}
