/**
 * FileMessage - Display encrypted file attachments
 * Shows images inline, other files as downloadable attachments
 */

import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { Download, File, Image as ImageIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FileMessageProps {
  fileId: string;
  mimeType: string;
  originalFilename?: string;
  sizeBytes?: number;
  onDownload: (fileId: string) => Promise<{ data: Uint8Array; filename: string | null }>;
  className?: string;
}

export function FileMessage({
  fileId,
  mimeType,
  originalFilename,
  sizeBytes,
  onDownload,
  className,
}: FileMessageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage = mimeType.startsWith('image/');

  // Auto-load images
  useEffect(() => {
    if (isImage && !imageUrl && !loading && !error) {
      loadImage();
    }
  }, [isImage]);

  const loadImage = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, filename } = await onDownload(fileId);
      // Create proper ArrayBuffer for Blob
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err) {
      console.error('Failed to load image:', err);
      setError('Failed to load image');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, filename } = await onDownload(fileId);
      
      // Create download link
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || originalFilename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download file:', err);
      setError('Failed to download file');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Image display
  if (isImage) {
    return (
      <div className={cn("max-w-md rounded-lg overflow-hidden", className)}>
        {loading && (
          <div className="flex items-center justify-center h-48 bg-[hsl(var(--muted))]">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              Loading image...
            </div>
          </div>
        )}
        
        {error && (
          <div className="flex flex-col items-center justify-center gap-2 p-4 bg-[hsl(var(--muted))] rounded-lg">
            <AlertCircle className="h-6 w-6 text-[hsl(var(--destructive))]" />
            <div className="text-sm text-[hsl(var(--muted-foreground))]">{error}</div>
            <Button variant="outline" size="sm" onClick={loadImage}>
              Retry
            </Button>
          </div>
        )}
        
        {imageUrl && (
          <div className="relative group">
            <img
              src={imageUrl}
              alt={originalFilename || 'Image'}
              className="w-full h-auto cursor-pointer"
              onClick={() => window.open(imageUrl, '_blank')}
            />
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownload}
                disabled={loading}
                className="shadow-lg"
              >
                <Download className="h-3 w-3 mr-1.5" />
                Download
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Generic file display
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))] max-w-sm",
        className
      )}
    >
      <div className="flex-shrink-0">
        <div className="h-10 w-10 rounded-lg bg-[hsl(var(--background))] flex items-center justify-center">
          <File className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
          {originalFilename || 'Unnamed file'}
        </div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {formatFileSize(sizeBytes)}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
        className="flex-shrink-0"
      >
        {loading ? (
          <div className="h-4 w-4 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>

      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-[hsl(var(--destructive))] text-white text-xs p-1 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
