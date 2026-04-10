"use client";

import { Copy, X, Check } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface ShareMenuProps {
  text: string;
  onClose: () => void;
  y: number;
}

export default function ShareMenu({ text, onClose, y }: ShareMenuProps) {
  const t = useTranslations("chat");
  const [copied, setCopied] = useState(false);

  function shareWhatsApp() {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    onClose();
  }

  function shareTelegram() {
    const encoded = encodeURIComponent(text);
    window.open(`https://t.me/share/url?url=&text=${encoded}`, "_blank");
    onClose();
  }

  function copyText() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={onClose} onTouchEnd={onClose}>
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[260px] rounded-2xl bg-[#1c1c1e] border border-white/10 overflow-hidden shadow-2xl"
        style={{ top: Math.min(y, window.innerHeight - 260) }}
        onClick={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-[13px] font-semibold text-white">{t("shareVia")}</span>
          <button onClick={onClose} className="p-0.5 rounded-full active:bg-white/10">
            <X size={16} className="text-[#8e8e93]" />
          </button>
        </div>

        {/* Preview */}
        <div className="px-4 py-2 border-b border-white/5">
          <p className="text-[12px] text-[#8e8e93] line-clamp-2">{text.slice(0, 120)}{text.length > 120 ? "..." : ""}</p>
        </div>

        {/* WhatsApp */}
        <button onClick={shareWhatsApp} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/10 border-b border-white/5">
          <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <span className="text-[15px] text-white">WhatsApp</span>
        </button>

        {/* Telegram */}
        <button onClick={shareTelegram} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/10 border-b border-white/5">
          <div className="w-8 h-8 rounded-full bg-[#0088cc] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
              <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
          <span className="text-[15px] text-white">Telegram</span>
        </button>

        {/* Copy */}
        <button onClick={copyText} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/10">
          <div className="w-8 h-8 rounded-full bg-[#3a3a3c] flex items-center justify-center flex-shrink-0">
            {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-white" />}
          </div>
          <span className="text-[15px] text-white">{copied ? t("copied") : t("copy")}</span>
        </button>
      </div>
    </div>
  );
}
