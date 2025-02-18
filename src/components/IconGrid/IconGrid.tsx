import { useRef, useEffect, useMemo } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { motion, useAnimation } from "framer-motion";
import { IconContext } from "@phosphor-icons/react";
import {
  Horse,
  Airplane,
  Coffee,
  Plant,
  Butterfly,
  Rocket,
  Cat,
  Bird,
  Fish,
  Dog,
  Tree,
  Flower,
  Leaf,
  Sun,
  Cloud,
  Heart,
  Star,
  Moon
} from "@phosphor-icons/react";

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

const LoadingGrid = () => {
  const weight = useRecoilValue(iconWeightAtom);
  const size = useRecoilValue(iconSizeAtom);
  const color = useRecoilValue(iconColorAtom);

  const allPlaceholders = [
    { name: "horse", Icon: Horse },
    { name: "airplane", Icon: Airplane },
    { name: "coffee", Icon: Coffee },
    { name: "plant", Icon: Plant },
    { name: "butterfly", Icon: Butterfly },
    { name: "rocket", Icon: Rocket },
    { name: "cat", Icon: Cat },
    { name: "bird", Icon: Bird },
    { name: "fish", Icon: Fish },
    { name: "dog", Icon: Dog },
    { name: "tree", Icon: Tree },
    { name: "flower", Icon: Flower },
    { name: "leaf", Icon: Leaf },
    { name: "sun", Icon: Sun },
    { name: "cloud", Icon: Cloud },
    { name: "heart", Icon: Heart },
    { name: "star", Icon: Star },
    { name: "moon", Icon: Moon }
  ];

  const placeholders = useMemo(() => 
    [...allPlaceholders].sort(() => Math.random() - 0.5),
    [] // Empty deps array since allPlaceholders is constant
  );

  return (
    <motion.div className="grid grid-loading">
      {placeholders.map((item, index) => (
        <div key={index} className="icon-grid-item">
          <div className="icon-grid-item-content">
            <item.Icon size={size} weight={weight} color={color} />
            <p>
              <span className="name">(loading)</span>
            </p>
          </div>
        </div>
      ))}
    </motion.div>
  );
};

type IconGridProps = {};

const IconGrid = (_: IconGridProps) => {
  const weight = useRecoilValue(iconWeightAtom);
  const size = useRecoilValue(iconSizeAtom);
  const color = useRecoilValue(iconColorAtom);
  const isDark = useRecoilValue(isDarkThemeSelector);
  const query = useRecoilValue(searchQueryAtom);
  const showBookmarksOnly = useRecoilValue(showBookmarksOnlyAtom);
  const resultsLoadable = useRecoilValueLoadable(filteredQueryResultsSelector);

  const originOffset = useRef({ top: 0, left: 0 });
  const controls = useAnimation();

  useEffect(() => {
    controls.start("visible");
  }, [controls]);

  const renderResults = () => {
    switch (resultsLoadable.state) {
      case 'loading':
        return <LoadingGrid />;
      case 'hasError':
        return (
          <Notice
            type="warn"
            message="Error loading results. Please try again."
          />
        );
      case 'hasValue':
        const filteredQueryResults = resultsLoadable.contents;
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
        );
    }
  };

  return (
    <IconContext.Provider value={{ weight, size, color, mirrored: false }}>
      <div className="grid-container">
        <i id="beacon" className="beacon" />
        {renderResults()}
        <Panel />
      </div>
    </IconContext.Provider>
  );
};

export default IconGrid;
