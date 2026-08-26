-- =========================================================
-- Script: UPDATE de al.fkservico e al.fkclassificacao
-- =========================================================
-- Objetivo: preencher sotech.ate_atendimento_lancamento (al) com os
-- valores vindos de tbn_classificacao (c), usando a mesma cadeia de
-- JOINs do SELECT de origem:
--
--   al.fkprocedimento -> p.pkprocedimento (tbl_procedimento)
--   p.codprocedimento -> proc.codprocedimento (tbn_procedimento)
--   proc.pkprocedimento -> pc.fkprocedimento (tbn_procedimentoclassificacao)
--   pc.fkclassificacao -> c.pkclassificacao (tbn_classificacao)
--
-- Regras de preenchimento:
--   al.fkservico       <- c.fkservico
--   al.fkclassificacao <- c.pkclassificacao
--       (o SELECT original nao tem coluna "c.fkclassificacao"; a coluna
--        que corresponde a FK de al e c.pkclassificacao, que no SELECT
--        aparece como "c.pkclassificacao AS class". Se tbn_classificacao
--        realmente tiver uma coluna propria chamada fkclassificacao,
--        diferente da PK, ajuste a linha marcada abaixo.)
--
-- OBSERVACAO IMPORTANTE:
--   tbn_procedimentoclassificacao sugere relacao N:N entre procedimento
--   e classificacao. Ou seja, um mesmo al.fkprocedimento pode casar com
--   mais de uma linha de tbn_classificacao. Um UPDATE...FROM direto,
--   replicando os JOINs do SELECT, seria NAO DETERMINISTICO nesse caso
--   (o Postgres escolhe uma linha qualquer dentre as que casam).
--   Por isso este script usa um DISTINCT ON para garantir 1 linha por
--   lancamento antes de atualizar. Revise o ORDER BY do DISTINCT ON se
--   houver um criterio de desempate mais correto para o negocio
--   (ex.: classificacao mais recente, ou pkclassificacao especifico).
--
-- Somente linhas de al que efetivamente encontrarem uma classificacao
-- correspondente sao atualizadas (linhas sem match ficam como estao).
-- =========================================================

BEGIN;

-- -------------------------------------------------------------------
-- 1) Preview: quantas linhas serao afetadas (rode antes do UPDATE se
--    quiser conferir o impacto)
-- -------------------------------------------------------------------
-- SELECT COUNT(*) AS linhas_a_atualizar
-- FROM (
--     SELECT DISTINCT ON (al.pkatendimentolancamento)
--         al.pkatendimentolancamento
--     FROM sotech.ate_atendimento_lancamento al
--     INNER JOIN sotech.tbl_procedimento p
--         ON p.pkprocedimento = al.fkprocedimento
--     LEFT JOIN tbn_procedimento proc
--         ON proc.codprocedimento = p.codprocedimento
--     LEFT JOIN tbn_procedimentoclassificacao pc
--         ON pc.fkprocedimento = proc.pkprocedimento
--     LEFT JOIN tbn_classificacao c
--         ON c.pkclassificacao = pc.fkclassificacao
--     WHERE c.pkclassificacao IS NOT NULL
-- ) sub;

-- -------------------------------------------------------------------
-- 2) UPDATE efetivo
-- -------------------------------------------------------------------
WITH classificacao_lancamento AS (
    SELECT DISTINCT ON (al.pkatendimentolancamento)
        al.pkatendimentolancamento,
        c.fkservico,
        c.pkclassificacao AS fkclassificacao   -- ver observacao no topo do script
    FROM
        sotech.ate_atendimento_lancamento al
        INNER JOIN sotech.tbl_procedimento p
            ON p.pkprocedimento = al.fkprocedimento
        LEFT JOIN tbn_procedimento proc
            ON proc.codprocedimento = p.codprocedimento
        LEFT JOIN tbn_procedimentoclassificacao pc
            ON pc.fkprocedimento = proc.pkprocedimento
        LEFT JOIN tbn_classificacao c
            ON c.pkclassificacao = pc.fkclassificacao
    WHERE
        c.pkclassificacao IS NOT NULL
    ORDER BY
        al.pkatendimentolancamento,
        c.pkclassificacao
)
UPDATE sotech.ate_atendimento_lancamento al
SET
    fkservico       = cl.fkservico,
    fkclassificacao = cl.fkclassificacao
FROM
    classificacao_lancamento cl
WHERE
    cl.pkatendimentolancamento = al.pkatendimentolancamento;

-- -------------------------------------------------------------------
-- 3) Conferencia pos-UPDATE (opcional, rode antes do COMMIT)
-- -------------------------------------------------------------------
-- SELECT
--     al.pkatendimentolancamento,
--     al.fkprocedimento,
--     al.fkservico,
--     al.fkclassificacao
-- FROM sotech.ate_atendimento_lancamento al
-- WHERE al.fkservico IS NOT NULL OR al.fkclassificacao IS NOT NULL
-- LIMIT 100;

COMMIT;
-- FIM do script
