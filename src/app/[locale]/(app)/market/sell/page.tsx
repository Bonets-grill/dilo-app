"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState, useRef } from "react";
import {
  ArrowLeft,
  Camera,
  Video,
  Sparkles,
  X,
  Check,
  Loader2,
} from "lucide-react";

const CATEGORIES = [
  "tech", "fashion", "home", "motor", "sports",
  "books", "baby", "jobs", "fitness", "music", "other",
] as const;

const CONDITIONS = ["new", "like_new", "good", "fair", "parts"] as const;

interface AiSuggestion {
  title: string;
  category: string;
  price: number;
  description: string;
}

export default function SellPage() {
  const t = useTranslations("market");
  const tc = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // AI suggestion
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [condition, setCondition] = useState<string>("good");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");

  const [publishing, setPublishing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 5 - photos.length);
    const newPhotos = [...photos, ...files].slice(0, 5);
    setPhotos(newPhotos);
    setPhotoPreviewUrls(newPhotos.map((f) => URL.createObjectURL(f)));
  };

  const removePhoto = (idx: number) => {
    const newPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(newPhotos);
    setPhotoPreviewUrls(newPhotos.map((f) => URL.createObjectURL(f)));
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideo(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeVideo = () => {
    setVideo(null);
    setVideoPreviewUrl(null);
  };

  // Step 2: AI analyze
  const analyzeWithAi = async () => {
    if (photos.length === 0 && !video) return;
    setAiLoading(true);
    try {
      const formData = new FormData();
      photos.forEach((p) => formData.append("photos", p));
      if (video) formData.append("video", video);

      const res = await fetch("/api/marketplace/ai-analyze", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestion(data.suggestion ?? data);
      }
    } catch {
      // AI not available
    } finally {
      setAiLoading(false);
    }
  };

  const useSuggestion = (field: keyof AiSuggestion) => {
    if (!suggestion) return;
    switch (field) {
      case "title":
        setTitle(suggestion.title);
        break;
      case "category":
        setCategory(suggestion.category);
        break;
      case "price":
        setPrice(String(suggestion.price));
        break;
      case "description":
        setDescription(suggestion.description);
        break;
    }
  };

  const useAllSuggestions = () => {
    if (!suggestion) return;
    setTitle(suggestion.title);
    setCategory(suggestion.category);
    setPrice(String(suggestion.price));
    setDescription(suggestion.description);
  };

  const handlePublish = async () => {
    if (!title.trim() || !price.trim()) return;
    setPublishing(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("price", price);
      formData.append("category", category);
      formData.append("condition", condition);
      formData.append("city", city.trim());
      formData.append("description", description.trim());
      photos.forEach((p) => formData.append("photos", p));
      if (video) formData.append("video", video);

      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const listingId = data.listing?.id ?? data.id;
        if (listingId) {
          router.push(`/market/${listingId}`);
        } else {
          router.push("/market");
        }
      }
    } catch {
      // fail silently
    } finally {
      setPublishing(false);
    }
  };

  const goNext = () => {
    if (step === 1 && (photos.length > 0 || video)) {
      setStep(2);
      analyzeWithAi();
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      handlePublish();
    }
  };

  const canProceed = () => {
    if (step === 1) return photos.length > 0 || !!video;
    if (step === 2) return true;
    if (step === 3) return title.trim().length > 0 && price.trim().length > 0;
    return false;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <button onClick={() => (step > 1 ? setStep(step - 1) : router.back())} className="p-1">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold flex-1">{t("sell")}</h1>
        <span className="text-xs text-[var(--dim)]">{step}/3</span>
      </div>

      {/* Progress bar */}
      <div className="flex-shrink-0 h-1 bg-white/[0.05]">
        <div
          className="h-full bg-orange-500 transition-all duration-300"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Step 1: Upload media */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">{t("uploadPhotos")}</h2>
            <p className="text-xs text-[var(--dim)]">
              {t("uploadPhotos")} (max 5)
            </p>

            {/* Photo previews */}
            <div className="grid grid-cols-3 gap-2">
              {photoPreviewUrls.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-white/[0.15] flex flex-col items-center justify-center gap-1 text-[var(--dim)] active:scale-95 transition"
                >
                  <Camera size={24} />
                  <span className="text-[10px]">+{t("uploadPhotos")}</span>
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotos}
            />

            {/* Video */}
            <h2 className="text-base font-semibold pt-2">{t("recordVideo")}</h2>
            {videoPreviewUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <video src={videoPreviewUrl} className="w-full h-40 object-cover" controls playsInline />
                <button
                  onClick={removeVideo}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => videoInputRef.current?.click()}
                className="w-full h-32 rounded-xl border-2 border-dashed border-white/[0.15] flex flex-col items-center justify-center gap-1 text-[var(--dim)] active:scale-95 transition"
              >
                <Video size={28} />
                <span className="text-xs">{t("recordVideo")} (15-60s)</span>
              </button>
            )}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleVideo}
            />
          </div>
        )}

        {/* Step 2: AI suggestions */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-orange-400" />
              <h2 className="text-base font-semibold">{t("aiSuggestion")}</h2>
            </div>

            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 size={28} className="text-orange-400 animate-spin" />
                <p className="text-sm text-[var(--dim)]">{tc("loading")}</p>
              </div>
            ) : suggestion ? (
              <div className="space-y-3">
                {/* Title suggestion */}
                <SuggestionField
                  label={t("title")}
                  value={suggestion.title}
                  currentValue={title}
                  onUse={() => useSuggestion("title")}
                  buttonLabel={t("useSuggestion")}
                />
                {/* Category suggestion */}
                <SuggestionField
                  label={t("categories." + suggestion.category)}
                  value={t(`categories.${suggestion.category}`)}
                  currentValue={category === suggestion.category ? suggestion.category : ""}
                  onUse={() => useSuggestion("category")}
                  buttonLabel={t("useSuggestion")}
                />
                {/* Price suggestion */}
                <SuggestionField
                  label={t("price")}
                  value={`€${suggestion.price}`}
                  currentValue={price === String(suggestion.price) ? price : ""}
                  onUse={() => useSuggestion("price")}
                  buttonLabel={t("useSuggestion")}
                />
                {/* Description suggestion */}
                <SuggestionField
                  label={t("description")}
                  value={suggestion.description}
                  currentValue={description}
                  onUse={() => useSuggestion("description")}
                  buttonLabel={t("useSuggestion")}
                />

                {/* Use all */}
                <button
                  onClick={useAllSuggestions}
                  className="w-full py-3 rounded-xl bg-orange-500/20 text-orange-400 text-sm font-semibold active:scale-95 transition border border-orange-500/30"
                >
                  <Sparkles size={14} className="inline mr-1.5" />
                  {t("useSuggestion")} — {t("title")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--dim)] py-8 text-center">
                {t("aiSuggestion")}
              </p>
            )}
          </div>
        )}

        {/* Step 3: Confirm details */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">{t("publish")}</h2>

            {/* Title */}
            <label className="block">
              <span className="text-xs text-[var(--dim)] mb-1 block">{t("title")}</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-orange-500/50"
              />
            </label>

            {/* Price */}
            <label className="block">
              <span className="text-xs text-[var(--dim)] mb-1 block">{t("price")} (€)</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-orange-500/50"
              />
            </label>

            {/* Category */}
            <label className="block">
              <span className="text-xs text-[var(--dim)] mb-1 block">{t("categories.tech").split("")[0] && t("title")}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-orange-500/50 appearance-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-[#1a1a1a]">
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </select>
            </label>

            {/* Condition */}
            <div>
              <span className="text-xs text-[var(--dim)] mb-2 block">{t("condition.new").split("")[0] && ""}</span>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCondition(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      condition === c
                        ? "bg-orange-500 text-white"
                        : "bg-white/[0.05] text-[var(--dim)] border border-white/[0.08]"
                    }`}
                  >
                    {t(`condition.${c}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* City */}
            <label className="block">
              <span className="text-xs text-[var(--dim)] mb-1 block">{t("city")}</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-orange-500/50"
              />
            </label>

            {/* Description */}
            <label className="block">
              <span className="text-xs text-[var(--dim)] mb-1 block">{t("description")}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-orange-500/50 resize-none"
              />
            </label>
          </div>
        )}
      </div>

      {/* Bottom button */}
      <div className="flex-shrink-0 p-4 border-t border-[var(--border)]">
        <button
          onClick={goNext}
          disabled={!canProceed() || publishing}
          className="w-full py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          {publishing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : step === 3 ? (
            <>
              <Check size={16} />
              {t("publish")}
            </>
          ) : (
            t("publish")
          )}
        </button>
      </div>
    </div>
  );
}

function SuggestionField({
  label,
  value,
  currentValue,
  onUse,
  buttonLabel,
}: {
  label: string;
  value: string;
  currentValue: string;
  onUse: () => void;
  buttonLabel: string;
}) {
  const used = currentValue === value;
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
      <p className="text-[10px] text-[var(--dim)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-white mb-2">{value}</p>
      <button
        onClick={onUse}
        disabled={used}
        className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
          used
            ? "bg-green-500/20 text-green-400"
            : "bg-orange-500/20 text-orange-400 active:scale-95"
        }`}
      >
        {used ? "✓" : buttonLabel}
      </button>
    </div>
  );
}
