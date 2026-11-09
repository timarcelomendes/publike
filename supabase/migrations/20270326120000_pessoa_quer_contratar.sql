-- "Quero contratar" para quem procura trabalho também (09/11/2026). Pode rodar de novo.
-- Rode depois de 20270323120000_modelos_do_post.sql.
--
-- Pessoa também contrata (diarista, ajudante): o post "Quero contratar" leva a vaga que ela já publicou, com o
-- Curtir. O "Bastidores" continua só para quem contrata como empresa, comércio ou agência. Lê a versão de
-- escrever_recado que está no banco e troca só a regra e a mensagem.

do $$
declare
  f record;
  def text;
  novo text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'escrever_recado'
  loop
    def := pg_get_functiondef(f.oid);
    novo := replace(def,
      $a$if v_modelo in ('contratando', 'bastidores') and v_tipo is not distinct from 'pessoa' then
    raise exception 'Esse tipo de post é para quem contrata.'$a$,
      $b$if v_modelo = 'bastidores' and v_tipo is not distinct from 'pessoa' then
    raise exception 'O "Bastidores" é para empresa, comércio e agência.'$b$);
    novo := replace(novo,
      $a$'Escolha uma das suas vagas no ar para o "Estamos contratando".'$a$,
      $b$'Escolha a vaga que você já publicou e que está no ar.'$b$);
    if novo is distinct from def then
      execute novo;
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
