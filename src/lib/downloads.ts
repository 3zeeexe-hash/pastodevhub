import { supabase } from "@/integrations/supabase/client";

/** Opens a short-lived download link for a karya file the viewer is allowed to get. */
export async function downloadProduct(p: { id: string; file_path: string | null; file_name: string | null }) {
  if (!p.file_path) throw new Error("Developer belum mengunggah file.");
  const { data, error } = await supabase.storage.from("product-files").createSignedUrl(p.file_path, 120, { download: p.file_name ?? true });
  if (error || !data) throw new Error("Kamu belum punya akses ke file ini.");
  await supabase.rpc("record_download", { _product_id: p.id });
  window.location.href = data.signedUrl;
}
