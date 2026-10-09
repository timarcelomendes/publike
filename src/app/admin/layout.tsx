import { KeyRound, Laptop } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AbasAdmin, type ModoAdmin } from "@/components/admin/abas";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Aviso, Container, Selo } from "@/components/ui/basicos";
import { ehModerador } from "@/lib/dados";
import { adminSemCookie, ehAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Publike" },
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  return (
    <Container className="py-8">
      <Suspense
        fallback={
          <>
            <Topo modo={null} />
            <div className="mt-6">
              <EsqueletoAdmin />
            </div>
          </>
        }
      >
        <ConteudoComModo>{children}</ConteudoComModo>
      </Suspense>
    </Container>
  );
}

async function ConteudoComModo({ children }: { children: ReactNode }) {
  // Moderador com login entra na moderação; o admin pede o link do terminal.
  const modo: ModoAdmin = (await ehAdminLocal()) ? "admin" : (await ehModerador()) ? "moderador" : null;
  if (!modo && (await adminSemCookie())) return <AbrirPeloTerminal />;
  return (
    <>
      <Topo modo={modo} />
      <div className="mt-6">{children}</div>
    </>
  );
}

function Topo({ modo }: { modo: ModoAdmin }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h2 sm:text-h1">{modo === "moderador" ? "Moderação" : "Admin"}</h1>
        {modo === "admin" && (
          <Selo>
            <Laptop aria-hidden />
            Só neste computador
          </Selo>
        )}
      </div>
      {modo && <AbasAdmin modo={modo} />}
    </>
  );
}

/** O admin está ligado neste computador, mas este navegador ainda não abriu o link do terminal. */
function AbrirPeloTerminal() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-h2 sm:text-h1">Admin</h1>
      <Aviso tipo="info" titulo="Abra o admin pelo link do terminal">
        <p>
          Quando o <code>npm run dev</code> começa, ele mostra no terminal uma linha <strong>Admin do Publike</strong> com
          um link. Abra esse link neste navegador: ele grava uma chave que vale por 30 dias.
        </p>
        <p className="flex items-center gap-2 text-ink-muted">
          <KeyRound aria-hidden className="size-4 shrink-0" />
          Sem esse link, ninguém abre o admin, mesmo que alcance o seu computador pela rede.
        </p>
      </Aviso>
    </div>
  );
}
