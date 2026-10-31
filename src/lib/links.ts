/** Parses a customer-entered link, adding https:// when the scheme is missing. */
export function parseLink(value: string) {
  const raw = value.trim();
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** Hosts we expect for each platform's links. */
export const LINK_HOSTS: Record<string, string[]> = {
  instagram: ["instagram.com", "instagr.am"],
  facebook: ["facebook.com", "fb.com", "fb.watch"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  whatsapp: ["whatsapp.com", "wa.me"],
  telegram: ["t.me", "telegram.me", "telegram.org"],
  linkedin: ["linkedin.com", "lnkd.in"],
  pinterest: ["pinterest.com", "pin.it"],
  snapchat: ["snapchat.com"],
  twitch: ["twitch.tv"],
  discord: ["discord.gg", "discord.com"],
  reddit: ["reddit.com", "redd.it"],
  music: ["spotify.com", "soundcloud.com", "music.apple.com", "youtube.com", "deezer.com"],
};

/** True when we know the platform's hosts and the link isn't on one of them. */
export function isForeignHost(url: URL, platformId: string) {
  const hosts = LINK_HOSTS[platformId];
  return Boolean(hosts && !hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)));
}
