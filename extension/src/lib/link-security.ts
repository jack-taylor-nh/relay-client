/**
 * Client-side link security and trust analysis
 * Zero-latency pattern matching for instant feedback
 */

export interface LinkTrustSignals {
  tracking: boolean;
  affiliate: boolean;
  shortened: boolean;
  ipAddress: boolean;
  dataUrl: boolean;
  knownSafe: boolean;
  suspiciousPattern: boolean;
  https: boolean;
  signals: string[]; // Human-readable signals
}

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid',
  'yclid', 'twclid', 'dclid'
];

const AFFILIATE_PATTERNS = [
  /[?&](tag|ref|aff|affiliate|tracking)=/i,
  /amazon\.com.*[?&]tag=/i,
  /[?&]partner=/i,
  /\/ref[_-]?=/i,
];

const SHORTENED_DOMAINS = [
  'bit.ly', 't.co', 'tinyurl.com', 'ow.ly', 'goo.gl', 
  'buff.ly', 'is.gd', 'cli.gs', 'short.io', 'rebrand.ly'
];

const KNOWN_SAFE_DOMAINS = [
  // Developer platforms
  'github.com', 'gitlab.com', 'stackoverflow.com', 'stackexchange.com',
  'wikipedia.org', 'arxiv.org', 'scholar.google.com',
  
  // Major tech companies
  'microsoft.com', 'google.com', 'apple.com', 'mozilla.org',
  
  // Package registries
  'npmjs.com', 'pypi.org', 'crates.io', 'docker.com',
  
  // Social/Content platforms
  'youtube.com', 'vimeo.com', 'reddit.com', 'twitter.com', 'x.com',
  'linkedin.com', 'medium.com', 'dev.to', 'hashnode.dev',
  
  // Relay platform domains
  'rlymsg.com', 'link.rlymsg.com', 'relay.rlymsg.com'
];

/**
 * Analyze a URL for trust signals with zero latency
 */
export function analyzeLinkTrust(url: string): LinkTrustSignals {
  const signals: string[] = [];
  
  try {
    const parsed = new URL(url);
    
    // Check HTTPS
    const https = parsed.protocol === 'https:';
    if (!https) {
      signals.push('No encryption (HTTP)');
    }
    
    // Check for IP address
    const ipAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname);
    if (ipAddress) {
      signals.push('Uses IP address instead of domain');
    }
    
    // Check for data URL
    const dataUrl = parsed.protocol === 'data:';
    if (dataUrl) {
      signals.push('Embedded data URL');
    }
    
    // Check for tracking parameters
    const trackingParams = TRACKING_PARAMS.filter(param => 
      parsed.searchParams.has(param)
    );
    const tracking = trackingParams.length > 0;
    if (tracking) {
      signals.push(`Contains tracking (${trackingParams.length} parameters)`);
    }
    
    // Check for affiliate links
    const affiliate = AFFILIATE_PATTERNS.some(pattern => 
      pattern.test(url)
    );
    if (affiliate) {
      signals.push('Affiliate or referral link');
    }
    
    // Check for shortened URLs
    const shortened = SHORTENED_DOMAINS.includes(parsed.hostname);
    if (shortened) {
      signals.push('Shortened URL');
    }
    
    // Check known safe domains
    const domain = parsed.hostname.replace(/^www\./, '');
    const knownSafe = KNOWN_SAFE_DOMAINS.includes(domain);
    if (knownSafe) {
      signals.push('Verified safe domain');
    }
    
    // Check for suspicious patterns
    const suspiciousPattern = (
      // Lots of dashes
      (parsed.hostname.match(/-/g) || []).length > 3 ||
      // Lots of numbers
      (parsed.hostname.match(/\d/g) || []).length > 4 ||
      // Very long subdomain
      parsed.hostname.split('.').some(part => part.length > 30) ||
      // Mixed case in hostname (typosquatting)
      /[A-Z]/.test(parsed.hostname)
    );
    if (suspiciousPattern) {
      signals.push('Suspicious domain pattern');
    }
    
    return {
      tracking,
      affiliate,
      shortened,
      ipAddress,
      dataUrl,
      knownSafe,
      suspiciousPattern,
      https,
      signals
    };
  } catch {
    // Invalid URL
    return {
      tracking: false,
      affiliate: false,
      shortened: false,
      ipAddress: false,
      dataUrl: false,
      knownSafe: false,
      suspiciousPattern: true,
      https: false,
      signals: ['Invalid URL format']
    };
  }
}

/**
 * Get a trust score from 0-100 based on signals
 */
export function getTrustScore(signals: LinkTrustSignals): number {
  let score = 50; // Start neutral
  
  if (signals.https) score += 15;
  if (signals.knownSafe) score += 35;
  if (signals.tracking) score -= 5;
  if (signals.affiliate) score -= 5;
  if (signals.shortened) score -= 10;
  if (signals.ipAddress) score -= 20;
  if (signals.dataUrl) score -= 15;
  if (signals.suspiciousPattern) score -= 25;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Get a color variant for the trust score
 */
export function getTrustColor(score: number): 'safe' | 'warning' | 'danger' {
  if (score >= 70) return 'safe';
  if (score >= 40) return 'warning';
  return 'danger';
}
