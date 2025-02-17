import { useRef, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { motion, useAnimation } from "framer-motion";
import { IconContext } from "@phosphor-icons/react";

import {
  iconWeightAtom,
  iconSizeAtom,
  iconColorAtom,
  filteredQueryResultsSelector,
  isDarkThemeSelector,
  searchQueryAtom,
  showBookmarksOnlyAtom,
} from "@/state";
import Notice from "@/components/Notice";

import Panel from "./Panel";
import IconGridItem from "./IconGridItem";
import TagCloud from "./TagCloud";
import "./IconGrid.css";

const defaultSearchTags = [
  "*new*",
  "*updated*",
  "communication",
  "editor",
  "emoji",
  "maps",
  "weather",
];

type IconGridProps = {};

const IconGrid = (_: IconGridProps) => {
  const weight = useRecoilValue(iconWeightAtom);
  const size = useRecoilValue(iconSizeAtom);
  const color = useRecoilValue(iconColorAtom);
  const isDark = useRecoilValue(isDarkThemeSelector);
  const query = useRecoilValue(searchQueryAtom);
  const showBookmarksOnly = useRecoilValue(showBookmarksOnlyAtom);
  const filteredQueryResults = useRecoilValue(filteredQueryResultsSelector);

  const originOffset = useRef({ top: 0, left: 0 });
  const controls = useAnimation();

  useEffect(() => {
    controls.start("visible");
    // Scroll to top with offset when search results change
    if (query) {
      const toolbar = document.querySelector('.toolbar');
      const gridContainer = document.querySelector('.grid-container');
      if (toolbar && gridContainer) {
        const toolbarHeight = toolbar.getBoundingClientRect().height;
        const gridRect = gridContainer.getBoundingClientRect();
        window.scrollTo({
          top: gridRect.top + window.scrollY - toolbarHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [controls, filteredQueryResults, query]);

  if (!filteredQueryResults.length) {
    if (showBookmarksOnly) {
      return (
        <Notice
          type="warn"
          message={
            <>
              No matching bookmarks. Tap the star in an icon's detail to bookmark it.
            </>
          }
        />
      );
    }
    
    return (
      <Notice
        type="warn"
        message={
          <>
            No results for "<code>{query}</code>". Try searching a category or
            keyword:
          </>
        }
      >
        <TagCloud name="empty-state" tags={defaultSearchTags} />
      </Notice>
    );
  }

  return (
    <IconContext.Provider value={{ weight, size, color, mirrored: false }}>
      <div className="grid-container">
        <i id="beacon" className="beacon" />
        <motion.div
          key={query}
          className="grid"
          initial="hidden"
          animate={controls}
        >
          {filteredQueryResults.map((iconEntry, index) => (
            <IconGridItem
              key={iconEntry.name}
              index={index}
              isDark={isDark}
              entry={iconEntry}
              originOffset={originOffset}
            />
          ))}
        </motion.div>
        <Panel />
      </div>
    </IconContext.Provider>
  );
};

export default IconGrid;
