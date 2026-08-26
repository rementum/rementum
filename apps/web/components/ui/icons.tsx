import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconBrains(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 14 5 8 8 2 5Z" />
      <path d="m2 8 6 3 6-3" />
      <path d="m2 11 6 3 6-3" />
    </Icon>
  );
}

export function IconTeams(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.5" cy="5" r="2.25" />
      <path d="M1.75 13.5c0-2.1 1.68-3.75 3.75-3.75s3.75 1.65 3.75 3.75" />
      <path d="M10.5 7.1a2.1 2.1 0 1 0-.6-4.15" />
      <path d="M11.4 10c1.7.4 2.85 1.85 2.85 3.5" />
    </Icon>
  );
}

export function IconConnections(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2v3M10 2v3" />
      <path d="M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0Z" />
      <path d="M8 11v3" />
    </Icon>
  );
}

export function IconIndex(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </Icon>
  );
}

export function IconWrites(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.3 2.4a1.75 1.75 0 0 1 2.5 2.45L6.3 12.4l-3.3.9.9-3.3Z" />
      <path d="M2.5 14.5h11" />
    </Icon>
  );
}

export function IconTasks(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <path d="m5.5 8.2 1.8 1.8 3.4-3.7" />
    </Icon>
  );
}

export function IconMaintenance(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.5 8.5h3L6 4l3 8.5L10.5 8.5h4" />
    </Icon>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.2l2.2 1.3" />
    </Icon>
  );
}

export function IconImport(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2v7.5M5 6.8l3 3 3-3" />
      <path d="M2.5 13.5h11" />
    </Icon>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2" />
    </Icon>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 9.7A5.75 5.75 0 1 1 6.3 2.5a4.5 4.5 0 0 0 7.2 7.2Z" />
    </Icon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 6.5 4 4 4-4" />
    </Icon>
  );
}

export function IconSidebar(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2.5" width="12" height="11" rx="2.5" />
      <path d="M6 2.5v11" />
    </Icon>
  );
}

export function IconSignOut(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2.5" />
      <path d="m10.5 5 3 3-3 3M6.5 8h7" />
    </Icon>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 8.5 3.2 3.2L13 5" />
    </Icon>
  );
}

export function IconArrowUpRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
    </Icon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Icon>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Icon>
  );
}
