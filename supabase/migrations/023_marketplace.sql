-- DILO Marketplace — TikTok-style product listings

-- Product listings
CREATE TABLE IF NOT EXISTS public.market_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),

  -- Product info
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  currency TEXT DEFAULT 'EUR',
  category TEXT NOT NULL CHECK (category IN ('tech', 'fashion', 'home', 'motor', 'sports', 'books', 'baby', 'jobs', 'fitness', 'music', 'other')),
  condition TEXT CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'parts')),

  -- Media
  photos TEXT[] DEFAULT '{}',  -- URLs to uploaded photos
  video_url TEXT,              -- URL to product video

  -- Location
  city TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'reserved', 'deleted', 'paused')),
  featured BOOLEAN DEFAULT false,  -- premium users

  -- Stats
  views INT DEFAULT 0,
  likes INT DEFAULT 0,

  -- AI generated
  ai_suggested_price DECIMAL(10,2),
  ai_description TEXT,
  ai_category TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_listings_seller ON public.market_listings(seller_id, created_at DESC);
CREATE INDEX idx_listings_category ON public.market_listings(category, status, created_at DESC);
CREATE INDEX idx_listings_status ON public.market_listings(status, created_at DESC);
CREATE INDEX idx_listings_city ON public.market_listings(city, status);

-- Likes/favorites
CREATE TABLE IF NOT EXISTS public.market_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  listing_id UUID NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

-- Offers
CREATE TABLE IF NOT EXISTS public.market_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  amount DECIMAL(10,2) NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_offers_listing ON public.market_offers(listing_id, created_at DESC);
CREATE INDEX idx_offers_buyer ON public.market_offers(buyer_id, created_at DESC);
CREATE INDEX idx_offers_seller ON public.market_offers(seller_id, created_at DESC);

-- Reviews
CREATE TABLE IF NOT EXISTS public.market_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  listing_id UUID REFERENCES public.market_listings(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seller stats (materialized)
CREATE TABLE IF NOT EXISTS public.market_seller_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  total_listings INT DEFAULT 0,
  total_sold INT DEFAULT 0,
  avg_rating DECIMAL(2,1) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  total_views INT DEFAULT 0,
  response_rate_pct INT DEFAULT 100,
  member_since TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
