import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get("image") as Blob | null;
  const mode = (formData.get("mode") as string) || "enhance"; // enhance, upscale, stylize

  if (!image) {
    return NextResponse.json({ error: "No image" }, { status: 400 });
  }

  const stabilityKey = process.env.STABILITY_API_KEY;
  if (!stabilityKey || stabilityKey === "placeholder") {
    return NextResponse.json({ error: "Stability API key not configured" }, { status: 500 });
  }

  try {
    // Ensure image is a proper blob with reasonable size
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    if (imageBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Imagen demasiado grande (máx 10MB)" }, { status: 400 });
    }
    if (imageBuffer.length < 100) {
      return NextResponse.json({ error: "Imagen inválida" }, { status: 400 });
    }

    // Create proper File from buffer for Stability API
    const imageFile = new File([imageBuffer], "image.png", { type: "image/png" });

    // Use Stability AI image-to-image
    const stForm = new FormData();
    stForm.append("init_image", imageFile);
    stForm.append("init_image_mode", "IMAGE_STRENGTH");
    stForm.append("image_strength", mode === "stylize" ? "0.5" : "0.35");
    stForm.append("cfg_scale", "7");
    stForm.append("samples", "1");
    stForm.append("steps", "30");

    const prompts: Record<string, string> = {
      enhance: "Enhance this photo. Improve clarity, lighting, colors, and sharpness. Make it look professional. Keep the same composition and subject.",
      upscale: "High resolution, ultra detailed, sharp, professional photography, enhanced lighting and colors",
      stylize: "Beautiful artistic photo, enhanced colors, cinematic lighting, professional retouching",
    };

    stForm.append("text_prompts[0][text]", prompts[mode] || prompts.enhance);
    stForm.append("text_prompts[0][weight]", "1");
    stForm.append("text_prompts[1][text]", "blurry, distorted, deformed, ugly, low quality");
    stForm.append("text_prompts[1][weight]", "-1");

    const res = await fetch(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stabilityKey}`,
          Accept: "application/json",
        },
        body: stForm,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[Enhance] Stability error:", res.status, err);
      // Give user a friendly error message
      const friendlyError = res.status === 400 ? "La imagen no es compatible. Prueba con otra foto."
        : res.status === 402 ? "Sin créditos de Stability AI."
        : res.status === 413 ? "Imagen demasiado grande."
        : "No se pudo mejorar la imagen. Intenta con otra.";
      return NextResponse.json({ error: friendlyError }, { status: 500 });
    }

    const data = await res.json();
    const base64 = data.artifacts?.[0]?.base64;

    if (!base64) {
      return NextResponse.json({ error: "No image returned" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      image: `data:image/png;base64,${base64}`,
      mode,
    });
  } catch (e) {
    console.error("[Enhance] Error:", e);
    return NextResponse.json({ error: "Enhancement failed" }, { status: 500 });
  }
}
