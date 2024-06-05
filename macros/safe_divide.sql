{% macro safe_divide(numerator, denominator) %}
    CASE
        WHEN {{denominator}} > 0 THEN
            ROUND(CAST({{numerator}} AS NUMERIC) / CAST({{denominator}} AS NUMERIC), 1)
        ELSE 0
    END
{%- endmacro %}