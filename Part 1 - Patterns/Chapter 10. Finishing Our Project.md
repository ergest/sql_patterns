In the previous section we combined the two posts tables using the `UNION ALL` operator to make a single `post_types` CTE like this:
```
post_types as (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
 ```

Let's take a moment to see how this pattern works. Just like a `JOIN` adds columns to a result set the `UNION` operator appends rows to it by combining two or more tables length-wise. There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, as in our case this is the preferred way to append two tables. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows for the final result set. This of course is slower because of the extra operations to remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

One of the most annoying things when appending two or more tables with a lot of columns is lining up all the columns in the right order. There's been many a time when I've had to use Excel to line up the columns. There's no shame in admitting that.

As a rule of thumb, whenever you're appending tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.