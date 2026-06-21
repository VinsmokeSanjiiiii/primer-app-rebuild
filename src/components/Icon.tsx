import type { SVGProps } from "react";

type IconName =
  | "home" | "person" | "inbox" | "calendar" | "clock" | "back" | "bell"
  | "shield" | "wifi" | "eye" | "eye-off" | "check" | "x" | "plus" | "edit"
  | "lock" | "logout" | "sun" | "moon" | "chevron" | "filter" | "swap"
  | "umbrella" | "bolt" | "wrench" | "alert" | "camera" | "search" | "download"
  | "info" | "refresh" | "fingerprint" | "id" | "wifi-off" | "trash";

const paths: Record<IconName, string> = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h14V10",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21a7 7 0 0 1 14 0",
  inbox: "M4 13h4l2 3h4l2-3h4M4 13 6 5h12l2 8v6H4v-6Z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 6h14v14H5z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7v5l3 2",
  back: "M15 18l-6-6 6-6",
  bell: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0",
  shield: "M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z",
  wifi: "M5 12.5a10 10 0 0 1 14 0M8 16a5 5 0 0 1 8 0M12 20h.01",
  "wifi-off": "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.2-2.8M10.9 7a10 10 0 0 1 8.1 3M12 20h.01",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "eye-off": "M3 3l18 18M10.5 10.7a3 3 0 0 0 4 4M6.7 6.7C4 8.3 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.9M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.4 3.3",
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  logout: "M10 17l-1.4-1.4L11.2 13H3v-2h8.2L8.6 8.4 10 7l5 5-5 5ZM14 3h6v18h-6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z",
  chevron: "M9 6l6 6-6 6",
  filter: "M3 5h18l-7 8v6l-4-2v-4L3 5Z",
  swap: "M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8",
  umbrella: "M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9ZM12 12v7a2 2 0 0 0 4 0",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  wrench: "M14 7a4 4 0 0 1-5 5l-6 6 3 3 6-6a4 4 0 0 1 5-5l-2-2 2-2-2-2-1 1Z",
  alert: "M12 3 2 20h20L12 3ZM12 9v5M12 17h.01",
  camera: "M3 8h3l2-2h8l2 2h3v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 11v6M12 7h.01",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 7M21 3v4h-4",
  fingerprint: "M12 11a3 3 0 0 1 3 3v3M9 14a3 3 0 0 1 6 0M6 12a6 6 0 0 1 12 0v4M12 17v2",
  id: "M3 5h18v14H3zM7 9h4M7 13h6M16 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
};

export function Icon({
  name,
  size = 20,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export type { IconName };
