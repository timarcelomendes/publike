import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { InstagramWhatsapp } from "./instagram-whatsapp";
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

/** O convite do Instagram (migração 20270911120000); sem a migração, nada. */
export async function ConviteInstagramWhatsapp() {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/whatsapp"))) return null;
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_whatsapp_instagram");
  if (error || !data) return null;
  const d = data as unknown as { ligado: boolean; minutos: number };
  return <InstagramWhatsapp ligado={d.ligado} minutos={d.minutos} />;
}
