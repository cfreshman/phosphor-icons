import {
  useRef,
  useLayoutEffect,
  useEffect,
  MutableRefObject,
  HTMLAttributes,
} from "react";
import { useRecoilState } from "recoil";
import { motion } from "framer-motion";
import { Star } from "@phosphor-icons/react";

import { IconEntry } from "@/lib";
import { selectionEntryAtom } from "@/state";
import { useBookmarks } from "@/hooks/useBookmarks";

interface IconGridItemProps extends HTMLAttributes<HTMLDivElement> {
  index: number;
  isDark: boolean;
  entry: IconEntry;
  originOffset: MutableRefObject<{ top: number; left: number }>;
}

const transition = { duration: 0.2 };
const originIndex = 0;
const delayPerPixel = 0.0003;

const itemVariants = {
  hidden: { opacity: 0 },
  visible: (delayRef: MutableRefObject<number>) => ({
    opacity: 1,
    transition: { delay: delayRef.current },
  }),
};

const IconGridItem = (props: IconGridItemProps) => {
  const { index, originOffset, entry, style } = props;
  const { name, Icon } = entry;
  const [selection, setSelectionEntry] = useRecoilState(selectionEntryAtom);
  const { isBookmarked } = useBookmarks();
  const isOpen = selection?.name === name;
  const isNew = entry.tags.includes("*new*");
  const isUpdated = entry.tags.includes("*updated*");
  const delayRef = useRef<number>(0);
  const offset = useRef({ top: 0, left: 0 });
  const ref = useRef<any>();

  const handleOpen = () => setSelectionEntry(isOpen ? null : entry);

  // The measurement for all elements happens in the layoutEffect cycle
  // This ensures that when we calculate distance in the effect cycle
  // all elements have already been measured
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    offset.current = {
      top: element.offsetTop,
      left: element.offsetLeft,
    };

    if (index === originIndex) {
      originOffset.current = offset.current;
    }
  }, [index, originOffset]);

  useEffect(() => {
    const dx = Math.abs(offset.current.left - originOffset.current.left);
    const dy = Math.abs(offset.current.top - originOffset.current.top);
    const d = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    delayRef.current = d * delayPerPixel;
  }, [originOffset]);

  return (
    <motion.div
      ref={ref}
      className={`icon-grid-item ${isOpen ? "open" : ""}`}
      custom={delayRef}
      initial="hidden"
      animate="visible"
      variants={itemVariants}
      transition={transition}
      onClick={handleOpen}
    >
      <div className="icon-grid-item-content">
        <Icon />
        <div className="icon-name">{name}</div>
        {(isNew || isUpdated) && (
          <span className={`badge ${isNew ? "new" : "updated"}`}>•</span>
        )}
        {isBookmarked(name) && (
          <div className="bookmark-indicator">
            <Star weight="fill" size={16} />
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default IconGridItem;
