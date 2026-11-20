// Os endereços ruins do e-mail às empresas (20/11/2026; Marcelo: "os e-mails estão vindo muitos ruins").
// npx tsx scripts/testar-email-ruim.ts
import { enderecosQueVoltaram, motivoDeEmailRuim } from "../src/lib/email-ruim";

let falhas = 0;
const conferir = (ok: boolean, nome: string, extra?: unknown) => {
  if (!ok) {
    falhas++;
    console.log("✗", nome, extra ?? "");
  }
};

for (const ruim of ["123@gmail.com", "teste@hotmail.com", "aaaa@empresa.com.br", "naotem@gmail.com", "x@gmial.com", "gmail@gmail.com", "fulano@exemplo.com"])
  conferir(motivoDeEmailRuim(ruim) !== null, `ruim: ${ruim}`);
for (const bom of ["contato@mix.com.br", "rh@padaria.com", "joao.silva123@gmail.com", "financeiro@empresa.com.br", "1234567@empresa.com"])
  conferir(motivoDeEmailRuim(bom) === null, `bom: ${bom}`, motivoDeEmailRuim(bom));

// o aviso do Titan/GoDaddy (o da foto de 20/11)
const titan = `This is an automatically generated Delivery Status Notification.

Delivery to the following recipients failed permanently:

   * 123@gmail.com

Reason: There was an error while attempting to deliver your message:

Subject:
"Vagas da Mix Imports no Publike, de graça"

To:
"123@gmail.com".

Sending MTA ospl received this response from the destination host IP "192.179.30.27":

"550-5.1.1 The email account that you tried to reach does not exist."`;
const v = enderecosQueVoltaram(titan);
conferir(v.length === 1 && v[0].email === "123@gmail.com" && v[0].motivo.includes("550 5.1.1"), "o aviso do Titan", v);
// o relatório padrão (DSN)
const dsn = `Content-Type: message/delivery-status

Reporting-MTA: dns; mx.exemplo.net
Final-Recipient: rfc822; rh@empresafechada.com.br
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 user unknown`;
const d = enderecosQueVoltaram(dsn);
conferir(d.length === 1 && d[0].email === "rh@empresafechada.com.br", "o relatório padrão", d);
// atraso (4.x.x) não é permanente
conferir(enderecosQueVoltaram("Delivery delayed\nStatus: 4.4.1\n   * rh@lenta.com").length === 0, "atraso não conta");

console.log(falhas ? `${falhas} falharam` : "✓ endereços ruins conferidos");
process.exit(falhas ? 1 : 0);
