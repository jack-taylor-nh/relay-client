import { Shield, ExternalLink, AlertTriangle, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeLinkTrust, getTrustScore, getTrustColor } from '@/lib/link-security';

interface LinkPreviewProps {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
  security?: {
    level: 'safe' | 'warning' | 'danger' | 'unknown';
    score: number;
    warnings: string[];
    safe_browsing?: {
      status: string;
      checked: boolean;
    };
  };
  className?: string;
}

export function LinkPreview({ url, title, description, image, siteName, security, className }: LinkPreviewProps) {
  // Client-side instant trust analysis
  const clientSideTrust = analyzeLinkTrust(url);
  const clientScore = getTrustScore(clientSideTrust);
  const clientColor = getTrustColor(clientScore);
  
  // Combine server-side security data (if available) with client-side
  const finalLevel = security?.level || clientColor;
  const finalScore = security?.score ?? clientScore;
  const allSignals = [...clientSideTrust.signals, ...(security?.warnings || [])];
  
  // Security badge configuration
  const securityConfig = {
    safe: {
      icon: ShieldCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      hoverBg: 'hover:bg-green-200',
      label: 'Safe',
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      hoverBg: 'hover:bg-yellow-200',
      label: 'Caution',
    },
    danger: {
      icon: ShieldAlert,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      hoverBg: 'hover:bg-red-200',
      label: 'Blocked',
    },
    unknown: {
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      hoverBg: 'hover:bg-blue-200',
      label: 'Privacy',
    },
  };
  
  const config = securityConfig[finalLevel];
  const SecurityIcon = config.icon;
  
  // Blocked links have special styling
  const isBlocked = finalLevel === 'danger';
  
  return (
    <a 
      href={isBlocked ? undefined : url} 
      target={isBlocked ? undefined : "_blank"} 
      rel={isBlocked ? undefined : "noopener noreferrer"}
      onClick={(e) => {
        if (isBlocked) {
          e.preventDefault();
        }
      }}
      className={cn(
        "block mt-2 border rounded-lg transition-colors no-underline shadow-sm relative",
        isBlocked 
          ? "bg-red-50 border-red-300 cursor-not-allowed" 
          : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.5)]",
        className
      )}
    >
      {image && (
        <div className="relative w-full h-40 bg-[hsl(var(--muted))] overflow-hidden rounded-t-lg">
          <img 
            src={image} 
            alt="" 
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {title && (
              <div className="font-medium text-sm text-[hsl(var(--foreground))] line-clamp-2 mb-1">
                {title}
              </div>
            )}
            {description && (
              <div className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2 mb-2">
                {description}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              {siteName && <span className="truncate">{siteName}</span>}
              {!siteName && (
                <span className="truncate">{new URL(url).hostname}</span>
              )}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </div>
          </div>
          
          {/* Dynamic Security Badge */}
          <div 
            className={cn(
              "flex-shrink-0 p-1.5 rounded-full cursor-help transition-colors group/shield relative",
              config.bgColor,
              config.hoverBg
            )}
            title={`${config.label} Link`}
          >
            <SecurityIcon className={cn("h-4 w-4", config.color)} />
            
            {/* Tooltip on hover */}
            <div className="absolute right-0 bottom-full mb-2 w-72 p-3 rounded-lg bg-[hsl(var(--popover))] border border-[hsl(var(--border))] shadow-lg opacity-0 invisible group-hover/shield:opacity-100 group-hover/shield:visible transition-all z-[9999] pointer-events-none">
              <div className="text-xs text-[hsl(var(--foreground))]">
                <div className="flex items-center gap-2 mb-2">
                  <SecurityIcon className={cn("h-4 w-4", config.color)} />
                  <p className="font-semibold">{config.label} Link</p>
                  <span className="ml-auto text-[hsl(var(--muted-foreground))] font-mono text-[10px]">
                    {finalScore}/100
                  </span>
                </div>
                
                {isBlocked && (
                  <p className="text-red-600 font-semibold mb-2">
                    ⚠️ This link has been blocked for your safety
                  </p>
                )}
                
                {/* Privacy info */}
                <p className="text-[hsl(var(--muted-foreground))] mb-2">
                  Fetched by our server to protect your IP address and browser fingerprint.
                </p>
                
                {/* Security signals */}
                {allSignals.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]">
                    <p className="font-semibold mb-1">Security Analysis:</p>
                    <ul className="space-y-1 text-[hsl(var(--muted-foreground))]">
                      {allSignals.map((signal, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[10px] mt-0.5">•</span>
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Safe Browsing status */}
                {security?.safe_browsing?.checked && (
                  <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]">
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      ✓ Checked with Google Safe Browsing
                    </p>
                  </div>
                )}
              </div>
              {/* Arrow pointing down */}
              <div className="absolute -bottom-1 right-4 w-2 h-2 bg-[hsl(var(--popover))] border-r border-b border-[hsl(var(--border))] transform rotate-45" />
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
