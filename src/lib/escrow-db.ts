import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Tables and functions added by docs/sql/midtrans-escrow (payments, escrow_ledger, developer_wallet, ...)
// are not in the generated types, so this is the same browser client without table typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const looseDb = supabase as unknown as SupabaseClient<any>;
