import { useMemo } from "react";
import { useRecoilState } from "recoil";
import Select from "react-dropdown-select";
import { PencilSimpleLine } from "@phosphor-icons/react";
import { IconStyle } from "@phosphor-icons/core";

import { iconWeightAtom } from "@/state";

import "./StyleInput.css";

type WeightOption = { key: string; value: IconStyle; icon: JSX.Element };

const options: WeightOption[] = [
  {
    key: "Thin",
    value: IconStyle.THIN,
    icon: <PencilSimpleLine size={24} weight="thin" />,
  },
  {
    key: "Light",
    value: IconStyle.LIGHT,
    icon: <PencilSimpleLine size={24} weight="light" />,
  },
  {
    key: "Regular",
    value: IconStyle.REGULAR,
    icon: <PencilSimpleLine size={24} weight="regular" />,
  },
  {
    key: "Bold",
    value: IconStyle.BOLD,
    icon: <PencilSimpleLine size={24} weight="bold" />,
  },
  {
    key: "Fill",
    value: IconStyle.FILL,
    icon: <PencilSimpleLine size={24} weight="fill" />,
  },
  {
    key: "Duotone",
    value: IconStyle.DUOTONE,
    icon: <PencilSimpleLine size={24} weight="duotone" />,
  },
];

type StyleInputProps = {
  isMobile?: boolean;
};

const StyleInput = ({ isMobile }: StyleInputProps) => {
  const [style, setStyle] = useRecoilState(iconWeightAtom);

  const currentStyle = useMemo(
    () => [options.find((option) => option.value === style)!!],
    [style]
  );

  const handleStyleChange = (values: WeightOption[]) =>
    setStyle(values[0].value as IconStyle);

  return (
    <Select
      options={options}
      values={currentStyle}
      searchable={false}
      labelField="key"
      onChange={handleStyleChange}
      itemRenderer={({
        item,
        itemIndex,
        state: { cursor, values },
        methods,
      }) => (
        <span
          role="option"
          aria-selected={item.key === values[0].key}
          className={`react-dropdown-select-item ${
            itemIndex === cursor ? "react-dropdown-select-item-active" : ""
          }`}
          onClick={() => methods.addItem(item)}
        >
          {item.icon}
          <span className="label">{item.key}</span>
        </span>
      )}
      contentRenderer={({ state: { values } }) => (
        <div className="react-dropdown-select-content">
          {values[0].icon}
          {!isMobile && <span className="label">{values[0].key}</span>}
        </div>
      )}
    />
  );
};

export default StyleInput;
