import { NextRequest, NextResponse } from "next/server";

interface InstagramOEmbed {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  html: string;
}

// Extract event details from Instagram caption using heuristics
function parseEventDetails(caption: string, authorName: string) {
  const lines = caption.split('\n').filter(l => l.trim());

  // Try to find title (usually first line or line with emoji/caps)
  let title = lines[0] || "Event";

  // Look for date patterns
  const datePatterns = [
    // "Feb 14", "February 14", "2/14"
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}/i,
    /\b\d{1,2}\/\d{1,2}/,
    // "Friday", "Saturday", etc.
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
    // "this weekend", "tonight", "tomorrow"
    /\b(tonight|tomorrow|this weekend|this saturday|this sunday|this friday)\b/i,
  ];

  let date = "TBD";
  for (const pattern of datePatterns) {
    const match = caption.match(pattern);
    if (match) {
      date = match[0];
      break;
    }
  }

  // Look for time patterns
  const timePatterns = [
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
    /\b\d{1,2}\s*[-–—]\s*\d{1,2}\s*(?:am|pm)\b/i,
  ];

  let time = "TBD";
  for (const pattern of timePatterns) {
    const match = caption.match(pattern);
    if (match) {
      time = match[0].toUpperCase();
      break;
    }
  }

  // Look for venue (often after "at" or "@" or contains common venue words)
  const venuePatterns = [
    /(?:at|@)\s+([A-Z][A-Za-z\s&']+?)(?:\n|$|\.|\!)/,
    /📍\s*([^\n]+)/,
    /(?:venue|location):\s*([^\n]+)/i,
  ];

  let venue = "TBD";
  for (const pattern of venuePatterns) {
    const match = caption.match(pattern);
    if (match) {
      venue = match[1].trim();
      break;
    }
  }

  // Extract vibes/tags from hashtags
  const hashtags = caption.match(/#(\w+)/g) || [];
  const vibes = hashtags
    .slice(0, 3)
    .map(h => h.replace('#', '').toLowerCase())
    .filter(h => h.length < 15);

  // If no vibes from hashtags, try to infer from content
  if (vibes.length === 0) {
    const vibeKeywords: Record<string, string> = {
      'dj': 'music',
      'dance': 'dancing',
      'techno': 'techno',
      'house': 'house',
      'art': 'art',
      'gallery': 'art',
      'comedy': 'comedy',
      'standup': 'comedy',
      'food': 'food',
      'brunch': 'brunch',
      'party': 'party',
      'rave': 'rave',
      'rooftop': 'rooftop',
      'outdoor': 'outdoor',
      'free': 'free',
    };

    const lowerCaption = caption.toLowerCase();
    for (const [keyword, vibe] of Object.entries(vibeKeywords)) {
      if (lowerCaption.includes(keyword) && !vibes.includes(vibe)) {
        vibes.push(vibe);
        if (vibes.length >= 3) break;
      }
    }
  }

  return {
    title: title.slice(0, 100),
    venue,
    date,
    time,
    vibe: vibes.length > 0 ? vibes : ['event'],
    igHandle: `@${authorName}`,
  };
}

// Scrape Letterboxd movie page
async function scrapeLetterboxd(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error("Could not fetch Letterboxd page");
  }

  const html = await response.text();

  // Extract Open Graph meta tags
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || "";
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";
  const ogDescription = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] || "";

  // Extract year from title (usually "Movie Name (2024)")
  const yearMatch = ogTitle.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : "";
  const movieTitle = ogTitle.replace(/\s*\(\d{4}\).*$/, "").trim();

  // Extract director if available
  const directorMatch = html.match(/Directed by <a[^>]*>([^<]+)<\/a>/i) ||
                        html.match(/<meta name="twitter:data1" content="([^"]+)"/);
  const director = directorMatch ? directorMatch[1] : "";

  // Extract genres from the page
  const genreMatches = html.match(/\/films\/genre\/([^/"]+)/g) || [];
  const genres = genreMatches
    .slice(0, 3)
    .map(g => g.replace('/films/genre/', ''));

  return {
    type: "movie" as const,
    title: `${movieTitle} screening`,
    movieTitle,
    year,
    director,
    venue: "TBD",
    date: "TBD",
    time: "TBD",
    vibe: genres.length > 0 ? genres : ["film", "movie night"],
    thumbnail: ogImage,
    description: ogDescription,
    letterboxdUrl: url,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Check if it's a Letterboxd URL
    const letterboxdPattern = /letterboxd\.com\/film\/([a-z0-9-]+)/i;
    const letterboxdMatch = url.match(letterboxdPattern);

    if (letterboxdMatch) {
      const movieData = await scrapeLetterboxd(url);
      return NextResponse.json(movieData);
    }

    // Check if it's an Instagram URL
    const igUrlPattern = /instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/;
    const igMatch = url.match(igUrlPattern);

    if (!igMatch) {
      return NextResponse.json({
        error: "Unsupported URL. Try an Instagram or Letterboxd link."
      }, { status: 400 });
    }

    // Try Instagram oEmbed API
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;

    const oembedResponse = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; downto/1.0)',
      },
    });

    if (!oembedResponse.ok) {
      return NextResponse.json({
        error: "Could not access this post. It may be private or restricted.",
        isPublicPost: false,
      }, { status: 403 });
    }

    const oembed: InstagramOEmbed = await oembedResponse.json();

    // Extract caption from the HTML embed
    const captionMatch = oembed.html.match(/title="([^"]+)"/);
    const caption = captionMatch ? captionMatch[1] : oembed.title || "";

    // Parse event details from caption
    const eventDetails = parseEventDetails(caption, oembed.author_name);

    return NextResponse.json({
      type: "event" as const,
      ...eventDetails,
      thumbnail: oembed.thumbnail_url,
      authorUrl: oembed.author_url,
      isPublicPost: true,
      rawCaption: caption,
    });

  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json({
      error: "Failed to scrape post"
    }, { status: 500 });
  }
}
