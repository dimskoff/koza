"use client";

import { motion } from "framer-motion";

/* Soft entrance on every route — opacity only, so `fixed` children
   (modals) never get trapped inside a transform context. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
