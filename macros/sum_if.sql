{% macro sum_if(logical_condition, value_or_column) %}
    SUM(CASE WHEN {{logical_condition}} THEN {{value_or_column}} ELSE 0 END)
{%- endmacro %}