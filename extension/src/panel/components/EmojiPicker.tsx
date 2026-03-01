import { useState } from 'preact/hooks';
import { cn } from '@/lib/utils';
import { Smile } from 'lucide-react';

// Common emojis organized by category
const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓'],
  'Gestures': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  'Objects': ['💻', '📱', '📞', '☎️', '📧', '📨', '📩', '✉️', '📮', '📪', '📫', '📬', '📭', '📦', '📄', '📃', '📑', '📊', '📈', '📉', '🗂', '📁', '📂', '🗃', '🗄', '📋', '📇', '📌', '📍', '📎', '🖇', '📏', '📐', '✂️', '🗑', '🔒', '🔓', '🔑', '🗝', '🔨', '🪓', '⚔️', '🔫'],
  'Symbols': ['⭐', '✨', '💫', '✅', '❌', '❎', '❗', '❓', '‼️', '⁉️', '💯', '🔥', '⚡', '💥', '💢', '💨', '💦', '💤', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🎾', '🎱']
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onEmojiSelect, onClose }: EmojiPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');
  
  const categories = Object.keys(EMOJI_CATEGORIES) as Array<keyof typeof EMOJI_CATEGORIES>;
  
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-lg overflow-hidden w-80 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
          <Smile className="h-4 w-4" />
          <span>Emoji</span>
        </div>
        <button
          onClick={onClose}
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      {/* Category tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-[hsl(var(--border))] overflow-x-auto">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
              selectedCategory === category
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {category}
          </button>
        ))}
      </div>
      
      {/* Emoji grid */}
      <div className="p-2 max-h-56 overflow-y-auto">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_CATEGORIES[selectedCategory].map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onEmojiSelect(emoji);
                onClose();
              }}
              className="text-2xl p-2 rounded hover:bg-[hsl(var(--muted))] transition-colors flex items-center justify-center"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
