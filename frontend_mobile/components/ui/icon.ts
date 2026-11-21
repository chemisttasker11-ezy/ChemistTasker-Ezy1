import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

/** Gives a Lucide element the kit's size, colour and stroke unless the caller set its own. */
export function sizeIcon(icon: ReactNode, size: number, color: string, strokeWidth = 1.75): ReactNode {
  if (!isValidElement(icon)) return icon;
  const element = icon as ReactElement<IconProps>;
  const { props } = element;
  return cloneElement(element, {
    size: props.size ?? size,
    color: props.color ?? color,
    strokeWidth: props.strokeWidth ?? strokeWidth,
  });
}
