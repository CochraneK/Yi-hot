// Offline operator CLI. Requires an authorized DATABASE_URL; never exposed through API.
import { closeDb } from "@aihot/backend/db";
import { pendingGeoCandidates, registerGeoPlace, reviewGeoCandidate, type GeoReviewAction } from "@aihot/backend/admin/geo";

const [command, ...args] = process.argv.slice(2);
function usage(): never {
  throw Error([
    "Usage:",
    "  node scripts/review-geo.ts list [limit]",
    "  node scripts/review-geo.ts place <id> <name> <countryCode> <lat> <lon> <precision> <sourceUrl> [region] [city]",
    "  node scripts/review-geo.ts approve <candidateId> <placeId> <reviewer> <reason>",
    "  node scripts/review-geo.ts reject <candidateId> <reviewer> <reason>",
    "  node scripts/review-geo.ts reopen <candidateId> <reviewer> <reason>",
    "No model calls or automatic publishing. Evidence and location must be reviewed by a human.",
  ].join("\n"));
}

try {
  if (command === "list" && args.length <= 1) {
    console.log(JSON.stringify(await pendingGeoCandidates(args[0] ? Number(args[0]) : 30), null, 2));
  } else if (command === "place" && args.length >= 7 && args.length <= 9) {
    const [id, name, countryCode, lat, lon, precision, sourceUrl, region, city] = args;
    await registerGeoPlace({
      id: id!, name: name!, countryCode: countryCode!, lat: Number(lat), lon: Number(lon),
      precision: precision as "country" | "region" | "city", sourceUrl: sourceUrl!, region, city,
    });
    console.log("Canonical place created:", id);
  } else if (command === "approve" && args.length === 4) {
    await reviewGeoCandidate({ action: "approve", id: Number(args[0]), placeId: args[1], reviewer: args[2]!, reason: args[3]! });
    console.log("Approved:", args[0]);
  } else if ((command === "reject" || command === "reopen") && args.length === 3) {
    await reviewGeoCandidate({ action: command as GeoReviewAction, id: Number(args[0]), reviewer: args[1]!, reason: args[2]! });
    console.log(command, args[0]);
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
