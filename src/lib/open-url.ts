export function serviceOpenURL(
  s: { webUrl?: string; remoteUrl?: string },
  onLan: boolean
) {
  if (!onLan && s.remoteUrl) return s.remoteUrl
  return s.webUrl
}
