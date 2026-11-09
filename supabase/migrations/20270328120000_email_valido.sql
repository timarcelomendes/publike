-- E-mail só no formato simples (09/11/2026, claude/plano-seguranca.md, item 3). O leitor de endereços do envio
-- (nodemailer) transforma "vitima;outro@site.com" em "outro@site.com": a indicação por e-mail iria para outra pessoa,
-- sem passar pelo limite por destinatário nem pelo "parar de receber" (que contam o endereço digitado). Agora:
-- 1. privado.email_valido: letras, números e . _ % + - antes do @; domínio com ponto; até 200 letras.
-- 2. Indicar por e-mail e o e-mail do link de acesso usam essa regra.
-- 3. A fila de e-mails não manda para endereço fora da regra: entra como "cancelado", com o motivo, e aparece em
--    Admin › E-mails › Enviados.
-- Pode rodar de novo.

create or replace function privado.email_valido(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
     and char_length(btrim(p_email)) <= 200
     and btrim(p_email) ~* '^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$'
$$;

revoke execute on function privado.email_valido(text) from public, anon, authenticated;

-- 2. As duas entradas onde alguém digita o e-mail de outra pessoa (ou o próprio, pelo link de acesso)
do $$
declare
  f record;
  def text;
  novo text;
  trocas constant text[][] := array[
    array['public.indicar_por_email(uuid, text, text)',
          $a$v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'$a$,
          'not privado.email_valido(v_email)'],
    array['public.vincular_email_do_link(text, text)',
          $a$v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'$a$,
          'not privado.email_valido(v_email)']
  ];
  i int;
begin
  for i in 1 .. array_length(trocas, 1) loop
    if to_regprocedure(trocas[i][1]) is null then
      raise notice 'Sem a função %, nada a trocar.', trocas[i][1];
      continue;
    end if;
    def := pg_get_functiondef(to_regprocedure(trocas[i][1]));
    if position('privado.email_valido' in def) > 0 then
      continue; -- já trocada (a migração rodou antes)
    end if;
    novo := replace(def, trocas[i][2], trocas[i][3]);
    if novo = def then
      raise exception 'Não achei a regra de e-mail antiga em %.', trocas[i][1];
    end if;
    execute novo;
  end loop;
end
$$;

-- 3. A fila não manda para endereço fora da regra
create or replace function privado.fila_email_confere_para()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('pendente', 'enviando') and not privado.email_valido(new.para) then
    new.status := 'cancelado';
    new.erro := 'Endereço de e-mail inválido.';
  end if;
  return new;
end
$$;

revoke execute on function privado.fila_email_confere_para() from public, anon, authenticated;

drop trigger if exists fila_email_confere_para on privado.fila_emails;
create trigger fila_email_confere_para
  before insert or update of para on privado.fila_emails
  for each row execute function privado.fila_email_confere_para();
