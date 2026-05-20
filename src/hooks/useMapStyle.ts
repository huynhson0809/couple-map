import { useState, useCallback } from "react";

export type MapStyleId =
  | "bright"
  | "liberty"
  | "positron"
  | "dark"
  | "fiord"
  | "romantic"
  | "candy"
  | "midnight"
  | "vintage"
  | "ocean"
  | "forest"
  | "sunset"
  | "monochrome"
  | "lavender"
  | "sakura";

export interface MapStyleOption {
  id: MapStyleId;
  url: string;
  labelEn: string;
  labelVi: string;
  colors: [string, string, string]; // [background, water, road]
}

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: "bright",
    url: "https://tiles.openfreemap.org/styles/bright",
    labelEn: "Bright",
    labelVi: "Sáng",
    colors: ["#f8f4f0", "#aad3df", "#ffffff"],
  },
  {
    id: "romantic",
    url: "/styles/romantic.json",
    labelEn: "Romantic",
    labelVi: "Lãng mạn",
    colors: ["#fcd6e3", "#c8dff0", "#e4879e"],
  },
  {
    id: "candy",
    url: "/styles/candy.json",
    labelEn: "Candy",
    labelVi: "Kẹo ngọt",
    colors: ["#fff9e6", "#81d4fa", "#ff80ab"],
  },
  {
    id: "midnight",
    url: "/styles/midnight.json",
    labelEn: "Midnight",
    labelVi: "Nửa đêm",
    colors: ["#0d1117", "#0a1628", "#bb86fc"],
  },
  {
    id: "vintage",
    url: "/styles/vintage.json",
    labelEn: "Vintage",
    labelVi: "Cổ điển",
    colors: ["#f5f0e8", "#c4b99a", "#d7ccc8"],
  },
  {
    id: "ocean",
    url: "/styles/ocean.json",
    labelEn: "Ocean",
    labelVi: "Đại dương",
    colors: ["#e3f2fd", "#4fc3f7", "#b3e5fc"],
  },
  {
    id: "forest",
    url: "/styles/forest.json",
    labelEn: "Forest",
    labelVi: "Rừng xanh",
    colors: ["#e8f5e9", "#81c784", "#c8e6c9"],
  },
  {
    id: "sunset",
    url: "/styles/sunset.json",
    labelEn: "Sunset",
    labelVi: "Hoàng hôn",
    colors: ["#fff3e0", "#ffab91", "#ffcc80"],
  },
  {
    id: "monochrome",
    url: "/styles/monochrome.json",
    labelEn: "Mono",
    labelVi: "Đơn sắc",
    colors: ["#fafafa", "#bdbdbd", "#eeeeee"],
  },
  {
    id: "lavender",
    url: "/styles/lavender.json",
    labelEn: "Lavender",
    labelVi: "Oải hương",
    colors: ["#f3e5f5", "#b39ddb", "#e1bee7"],
  },
  {
    id: "sakura",
    url: "/styles/sakura.json",
    labelEn: "Sakura",
    labelVi: "Hoa anh đào",
    colors: ["#fce4ec", "#f48fb1", "#f8bbd0"],
  },
  {
    id: "liberty",
    url: "https://tiles.openfreemap.org/styles/liberty",
    labelEn: "Liberty",
    labelVi: "Liberty",
    colors: ["#f5f3ef", "#b3d1e5", "#ffffff"],
  },
  {
    id: "positron",
    url: "https://tiles.openfreemap.org/styles/positron",
    labelEn: "Positron",
    labelVi: "Positron",
    colors: ["#fafaf8", "#c4dbed", "#ffffff"],
  },
  {
    id: "dark",
    url: "https://tiles.openfreemap.org/styles/dark",
    labelEn: "Dark",
    labelVi: "Tối",
    colors: ["#1c2128", "#1b3549", "#2d333b"],
  },
  {
    id: "fiord",
    url: "https://tiles.openfreemap.org/styles/fiord",
    labelEn: "Fiord",
    labelVi: "Fiord",
    colors: ["#2b3a4a", "#1a2634", "#3d4f5f"],
  },
];

const KEY = "mapmate.map-style";

export function useMapStyle() {
  const [styleId, setStyleIdState] = useState<MapStyleId>(() => {
    const stored = localStorage.getItem(KEY) as MapStyleId | null;
    if (stored && MAP_STYLES.some((s) => s.id === stored)) return stored;
    return "bright";
  });

  const setStyleId = useCallback((id: MapStyleId) => {
    setStyleIdState(id);
    localStorage.setItem(KEY, id);
  }, []);

  const styleUrl = MAP_STYLES.find((s) => s.id === styleId)!.url;

  return { styleId, setStyleId, styleUrl };
}
