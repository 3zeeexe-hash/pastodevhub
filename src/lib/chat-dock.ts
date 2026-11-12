// Pemicu kecil supaya halaman mana pun bisa membuka panel chat mengambang (ChatDock) tanpa meneruskan props.

export const CHAT_DOCK_EVENT = "pastodev:open-chat";

export type ChatDockRequest = {
  /** "order" hanya berlaku di halaman /pesanan/:id; di tempat lain panel membuka daftar pesan. */
  view?: "inbox" | "order";
  /** Langsung buka satu percakapan pesan langsung. */
  conversationId?: string;
};

export function openChatDock(req: ChatDockRequest = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ChatDockRequest>(CHAT_DOCK_EVENT, { detail: req }));
}
