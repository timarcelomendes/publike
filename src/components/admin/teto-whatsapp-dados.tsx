import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { TetoWhatsapp } from "./teto-whatsapp";

/** O teto do mês com o contador (migração 20270808120000); sem a migração, nada. */
export async function TetoDoMesWhatsapp() {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/whatsapp"))) return null;
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_whatsapp_teto");
  if (error || !data) return null;
  const d = data as unknown as { teto: number; enviadas: number };
  return <TetoWhatsapp teto={d.teto} enviadas={d.enviadas} />;
}
