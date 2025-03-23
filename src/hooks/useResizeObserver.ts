import { useEffect, useState } from "react";

interface Dimensions {
  width: number;
  height: number;
}

export default function useResizeObserver(
  ref: React.RefObject<HTMLElement>
): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!ref.current) return;

    const observeTarget = ref.current;
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      });
    });

    resizeObserver.observe(observeTarget);

    return () => {
      resizeObserver.unobserve(observeTarget);
      resizeObserver.disconnect();
    };
  }, [ref]);

  return dimensions;
}
