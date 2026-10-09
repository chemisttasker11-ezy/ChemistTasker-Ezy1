/** Ensure roster role/status text remains readable on both deep and bright event colours. */
export function rosterEventForeground(background: string): '#06123A' | '#FFFFFF' {
  const normalized = background.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#06123A';
  const luminance = (hex: string) => {
    const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const bg = luminance(normalized);
  const ink = luminance('06123A');
  const inkRatio = (Math.max(bg, ink) + 0.05) / (Math.min(bg, ink) + 0.05);
  const whiteRatio = 1.05 / (bg + 0.05);
  return inkRatio >= whiteRatio ? '#06123A' : '#FFFFFF';
}
