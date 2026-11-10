import { BookMarked, Briefcase, Package, Users } from "lucide-react";

/** Search tabs shared by the home page search box and the /search page. */
export const SEARCH_TYPES = [
  ["users", "Developer", Users],
  ["repos", "Proyek", BookMarked],
  ["karya", "Karya", Package],
  ["jobs", "Lowongan", Briefcase],
] as const;
