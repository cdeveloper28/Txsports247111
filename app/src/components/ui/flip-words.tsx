import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../lib/utils";

/**
 * Aceternity "Flip Words" — cycles through `words`, animating each letter out (blur + drift) and
 * the next word's letters in. Ported for this Vite app (identical behaviour to the shadcn
 * @aceternity/flip-words registry component; uses the local framer-motion + cn).
 */
export function FlipWords({
  words,
  duration = 2600,
  className,
}: {
  words: string[];
  duration?: number;
  className?: string;
}) {
  const [currentWord, setCurrentWord] = useState(words[0]);
  const [isAnimating, setIsAnimating] = useState(false);

  const startAnimation = useCallback(() => {
    const next = words[(words.indexOf(currentWord) + 1) % words.length];
    setCurrentWord(next);
    setIsAnimating(true);
  }, [currentWord, words]);

  useEffect(() => {
    if (isAnimating) return;
    const t = setTimeout(startAnimation, duration);
    return () => clearTimeout(t);
  }, [isAnimating, duration, startAnimation]);

  return (
    <AnimatePresence onExitComplete={() => setIsAnimating(false)}>
      <motion.span
        key={currentWord}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 10 }}
        exit={{ opacity: 0, y: -32, x: 24, filter: "blur(8px)", scale: 1.4, position: "absolute" }}
        className={cn("relative inline-block", className)}
      >
        {currentWord.split("").map((letter, i) => (
          <motion.span
            key={currentWord + i}
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: i * 0.045, duration: 0.3 }}
            className="inline-block"
          >
            {letter}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}
