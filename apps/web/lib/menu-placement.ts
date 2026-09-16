interface TriggerBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function menuPlacement(
  trigger: TriggerBounds,
  viewport: { width: number; height: number },
  menu: { width: number; height: number },
) {
  const gap = 8;
  const width = Math.min(menu.width, viewport.width - gap * 2);
  const below = viewport.height - trigger.bottom - gap * 2;
  const above = trigger.top - gap * 2;
  const upward = below < menu.height && above > below;
  const maxHeight = Math.max(0, upward ? above : below);
  const height = Math.min(menu.height, maxHeight);
  const left = Math.max(gap, Math.min(trigger.right - width, viewport.width - gap - width));
  return {
    width,
    maxHeight,
    left: left - trigger.left,
    top: upward ? -height - gap : trigger.bottom - trigger.top + gap,
  };
}
