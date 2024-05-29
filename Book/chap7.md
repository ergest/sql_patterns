# Chapter 7: DBT Patterns
In this chapter we're going to use all the patterns we've seen to simplify our final query from the project we just saw using dbt. It uses a combination of actual SQL code with Jinja templates to give you much more flexibility in how you develop SQL. 

Dbt makes it really simple to design modular data transformation workflows, which we'll see in a bit, while also offering you *macros* to make your code a lot more portable. What we'll do in this chapter is take the query we completed in [Chapter 6](chap6) and show you how to rewrite it with dbt. I won't go into too much depth on how dbt works, because I don't want to make this a dbt tutorial. You can learn more about it [here](https://docs.getdbt.com/docs/introduction)

## Applying Robustness Patterns
Dbt uses the concept of "models" for modularizing your code. All the models by default live in the `models` folder. In that folder there are two subfolders `raw` and `clean` The first one loads the Stackoverflow tables from parquet files as is without any modifications. We've used those exact tables throughout the book

But the beauty of dbt is that it makes it really easy to create our own custom models while applying the robustness patterns we learned in [Chapter 5](chap5). We can have our own foundational models rather than rely on raw data.

Have a look at this example in the `models/clean` subfolder:
```sql
--model post_history_clean
{{
  config(materialized = 'table')
}}

SELECT
    id,
    post_id,
    post_history_type_id,
    revision_guid,
    user_id,
    CASE WHEN post_history_type_id IN (1,2,3) THEN 'create'
         WHEN post_history_type_id IN (4,5,6) THEN 'edit' 
    END AS activity_type
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(text, 'unknown') AS text,
    COALESCE(comment, 'unknown') AS comment
FROM
    {{ ref('post_history') }}
```

Do you see how we protect ourselves from `NULLs` by using `COALESCE()` liberally? We also handle the mapping of the 
## Wrapper Patterns
If you look into the `models/