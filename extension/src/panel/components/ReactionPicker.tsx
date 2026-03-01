import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

// Quick-access emojis for reactions
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

interface ReactionPickerProps {
  onReactionSelect: (emoji: string) => void;
  onClose: () => void;
  position?: 'top' | 'bottom';
  alignRight?: boolean;
}

export function ReactionPicker({ onReactionSelect, onClose, position = 'bottom', alignRight = false }: ReactionPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Picker */}
      <div
        className={cn(
          "relative z-50 flex items-center gap-1 p-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-full shadow-lg",
          position === 'top' ? "bottom-full mb-2" : "top-full mt-2",
          alignRight ? "right-0" : "left-0"
        )}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onReactionSelect(emoji);
              onClose();
            }}
            className="text-xl p-1.5 rounded-full hover:bg-[hsl(var(--muted))] transition-colors flex items-center justify-center w-9 h-9"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
