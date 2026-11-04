const hosts = {
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'x.com': 'x',
  'twitter.com': 'x',
  'linkedin.com': 'linkedin',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'behance.net': 'behance',
  'pinterest.com': 'pinterest',
  'tiktok.com': 'tiktok',
  't.me': 'telegram',
  'telegram.org': 'telegram',
  'wa.me': 'whatsapp',
  'whatsapp.com': 'whatsapp',
  'vk.com': 'vk',
  'threads.net': 'threads',
};

export function socialIcon(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return hosts[host] || 'link';
  } catch {
    return 'link';
  }
}
