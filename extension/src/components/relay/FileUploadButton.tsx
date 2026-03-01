/**
 * FileUploadButton - Button to trigger file selection
 */

import { h } from "preact";
import { useRef } from "preact/hooks";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FileUploadButtonProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
}

export function FileUploadButton({
  onFileSelect,
  disabled = false,
  accept = "image/*,application/pdf,.doc,.docx,.txt",
  maxSize = 50 * 1024 * 1024, // 50MB default
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    // Validate file size
    if (file.size > maxSize) {
      alert(`File is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }
    
    onFileSelect(file);
    
    // Reset input so same file can be selected again
    input.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled}
        className="flex-shrink-0"
        aria-label="Attach file"
        title="Attach file"
      >
        <Paperclip className="h-4 w-4" />
      </Button>
    </>
  );
}
