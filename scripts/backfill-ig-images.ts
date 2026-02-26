/**
 * One-time backfill: re-scrape Instagram events to replace stock og:image
 * thumbnails with the actual post image.
 *
 * Usage:
 *   npx tsx scripts/backfill-ig-images.ts          # dry run
 *   npx tsx scripts/backfill-ig-images.ts --apply   # apply changes
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY. Run with env loaded:");
  console.error("  source .env.local && npx tsx scripts/backfill-ig-images.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLYING CHANGES ===");

  // Find all events with an ig_url
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, ig_url, image_url")
    .not("ig_url", "is", null);

  if (error) {
    console.error("Failed to fetch events:", error.message);
    process.exit(1);
  }

  console.log(`Found ${events.length} IG events\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of events) {
    console.log(`[${event.id}] ${event.title}`);
    console.log(`  ig_url: ${event.ig_url}`);
    console.log(`  current image: ${event.image_url?.slice(0, 80)}...`);

    try {
      // Re-scrape via the app's API endpoint
      const res = await fetch(`${APP_URL}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: event.ig_url }),
      });

      if (!res.ok) {
        console.log(`  SKIP: scrape returned ${res.status}`);
        skipped++;
        continue;
      }

      const data = await res.json();
      const newImage = data.thumbnail;

      if (!newImage || newImage === event.image_url) {
        console.log(`  SKIP: same image or no image from scrape`);
        skipped++;
        continue;
      }

      console.log(`  new image: ${newImage.slice(0, 80)}...`);

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("events")
          .update({ image_url: newImage })
          .eq("id", event.id);

        if (updateErr) {
          console.log(`  ERROR: ${updateErr.message}`);
          failed++;
          continue;
        }
        console.log(`  UPDATED`);
      } else {
        console.log(`  WOULD UPDATE`);
      }
      updated++;
    } catch (err) {
      console.log(`  ERROR: ${err}`);
      failed++;
    }

    console.log();
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed`);
}

main();
