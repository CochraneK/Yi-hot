import { redirect } from "react-router";
import { placeById } from "../features/cities/geo";

/**
 * The city page is retired.
 *
 * Everything it did now happens on 动态: the picker sits in the header where the
 * 按城市看 link used to be, and a city is just `?place=` on the feed — the same
 * server-side filter, without a second page to keep in sync. Old links keep
 * working: a canonical `place` keeps filtering, and the legacy `?city=chengdu`
 * short id becomes the title/summary text search it always was.
 */
export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const place = url.searchParams.get("place")?.trim();
  if (place && /^[a-z0-9][a-z0-9-]{1,79}$/.test(place)) {
    return redirect(`/all?place=${encodeURIComponent(place)}`, 302);
  }
  const city = placeById(url.searchParams.get("city"));
  return redirect(city ? `/all?q=${encodeURIComponent(city.name)}` : "/all", 302);
}

export default function CitiesRetired() {
  return null;
}
