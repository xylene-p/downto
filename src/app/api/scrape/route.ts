import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";

/** Strip HTML tags and trim */
const strip = (s: string) => s.replace(/<[^>]*>/g, "").trim();

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
    title: strip(title).slice(0, 100) || "Event",
    venue: strip(venue).slice(0, 100),
    date: strip(date).slice(0, 50),
    time: strip(time).slice(0, 50),
    vibe: vibes.length > 0 ? vibes.map(v => strip(v).slice(0, 30)) : ['event'],
    igHandle: `@${strip(authorName).slice(0, 30)}`,
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
    title: strip(`${movieTitle} screening`).slice(0, 100),
    movieTitle: strip(movieTitle).slice(0, 100),
    year: strip(year).slice(0, 4),
    director: strip(director).slice(0, 60),
    venue: "TBD",
    date: "TBD",
    time: "TBD",
    vibe: genres.length > 0 ? genres.map(g => strip(g).slice(0, 30)) : ["film", "movie night"],
    thumbnail: ogImage,
    description: strip(ogDescription).slice(0, 500),
    letterboxdUrl: url,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string' || url.length > 500) {
      return NextResponse.json({ error: "A valid URL is required" }, { status: 400 });
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

    // Scrape the Instagram page directly for embedded JSON data
    const canonicalUrl = `https://www.instagram.com/${igMatch[1]}/${igMatch[2]}/`;
    const response = await fetch(canonicalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        error: "This post looks private or restricted. Try a public post, or enter the details manually.",
        isPrivate: true,
      }, { status: 403 });
    }

    const html = await response.text();

    // Extract caption from embedded JSON (Instagram embeds post data in the page)
    const captionMatch = html.match(/"caption":\{[^}]*"text":"((?:[^"\\]|\\.)*)"/);
    let caption = "";
    if (captionMatch) {
      try {
        // Use JSON.parse to properly decode all unicode escapes
        caption = JSON.parse(`"${captionMatch[1]}"`);
      } catch {
        caption = captionMatch[1];
      }
    }

    // Extract author from og:url (format: instagram.com/username/p/...)
    const authorMatch = html.match(/<meta property="og:url" content="https:\/\/www\.instagram\.com\/([^/]+)\//);
    const authorName = authorMatch ? authorMatch[1] : "";

    // Extract thumbnail from og:image
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const thumbnail = ogImageMatch ? ogImageMatch[1].replace(/&amp;/g, '&') : "";

    if (!caption && !thumbnail) {
      return NextResponse.json({
        error: "Couldn't read this post — it might be private or age-restricted. Try a different post, or enter the details manually.",
        isPrivate: true,
      }, { status: 403 });
    }

    // Parse event details from caption
    const eventDetails = parseEventDetails(caption, authorName);

    return NextResponse.json({
      type: "event" as const,
      ...eventDetails,
      thumbnail,
      authorUrl: `https://www.instagram.com/${authorName}/`,
      isPublicPost: true,
      rawCaption: caption,
      igUrl: canonicalUrl,
    });

  } catch (error) {
    logError("scrape", error);
    return NextResponse.json({
      error: "Something went wrong fetching that post. Try again, or enter the details manually."
    }, { status: 500 });
  }
}
