"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

interface Step {
  code: string;
  title: string;
  body: string;
}

export function Stepper({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.55"],
  });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className="stepper" ref={ref}>
      <div className="stepper-rail" aria-hidden="true">
        <motion.div className="stepper-rail-fill" style={{ scaleY }} />
      </div>
      {steps.map((step, i) => (
        <motion.article
          className="step"
          key={step.code}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -12% 0px" }}
          transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="step-node">
            <span className="step-index">{String(i + 1).padStart(2, "0")}</span>
          </div>
          <div className="step-body">
            <span className="flow-code">{step.code}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
