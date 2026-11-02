-- O app Android contava errado (02/11/2026): o proxy tomava qualquer referer android-app:// como o app do Publike,
-- mas o Gmail, o app do Google e o WhatsApp também mandam android-app:// quando a pessoa toca num link. Contas que só
-- abriram um link pelo Gmail apareciam em "Já abriram pelo app" e eram tiradas do comunicado "Android no navegador".
-- O proxy agora só conta android-app://org.publike.app. O que foi marcado antes não dá para separar (o navegador é o
-- mesmo Chrome), então começa do zero: quem usa o app volta para a lista na próxima vez que abrir.
-- Pode rodar de novo. Rode depois de 20270119120000_contas_no_app.sql.

delete from privado.contas_no_app;
update privado.aparelho_da_conta set app = false where app;
