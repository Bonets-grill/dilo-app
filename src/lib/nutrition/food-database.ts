/**
 * Open Food Facts API client — Free, no API key needed
 * Searches for food products and nutritional info
 */

export interface FoodProduct {
  name: string;
  brand: string;
  calories: number | null;
  fat: number | null;
  carbs: number | null;
  protein: number | null;
  fiber: number | null;
  sugar: number | null;
  salt: number | null;
  servingSize: string;
  imageUrl: string | null;
  nutriScore: string | null;
}

/**
 * Search for food products by name
 */
export async function searchFood(query: string, limit: number = 5): Promise<FoodProduct[]> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,brands,nutriments,serving_size,image_front_url,nutriscore_grade`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.products || [])
      .filter((p: { product_name?: string }) => p.product_name)
      .map((p: {
        product_name: string;
        brands?: string;
        nutriments?: Record<string, number>;
        serving_size?: string;
        image_front_url?: string;
        nutriscore_grade?: string;
      }) => ({
        name: p.product_name,
        brand: p.brands || "",
        calories: p.nutriments?.["energy-kcal_100g"] ?? null,
        fat: p.nutriments?.fat_100g ?? null,
        carbs: p.nutriments?.carbohydrates_100g ?? null,
        protein: p.nutriments?.proteins_100g ?? null,
        fiber: p.nutriments?.fiber_100g ?? null,
        sugar: p.nutriments?.sugars_100g ?? null,
        salt: p.nutriments?.salt_100g ?? null,
        servingSize: p.serving_size || "100g",
        imageUrl: p.image_front_url || null,
        nutriScore: p.nutriscore_grade || null,
      }));
  } catch {
    return [];
  }
}

/**
 * Get product by barcode
 */
export async function getProductByBarcode(barcode: string): Promise<FoodProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments,serving_size,image_front_url,nutriscore_grade`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const p = data.product;
    if (!p?.product_name) return null;

    return {
      name: p.product_name,
      brand: p.brands || "",
      calories: p.nutriments?.["energy-kcal_100g"] ?? null,
      fat: p.nutriments?.fat_100g ?? null,
      carbs: p.nutriments?.carbohydrates_100g ?? null,
      protein: p.nutriments?.proteins_100g ?? null,
      fiber: p.nutriments?.fiber_100g ?? null,
      sugar: p.nutriments?.sugars_100g ?? null,
      salt: p.nutriments?.salt_100g ?? null,
      servingSize: p.serving_size || "100g",
      imageUrl: p.image_front_url || null,
      nutriScore: p.nutriscore_grade || null,
    };
  } catch {
    return null;
  }
}
