# Chapter 6: DBT Patterns
In this chapter we're going to use all the patterns we've seen to simplify our final query from the project we just saw.

## Reusability Principle
We start off with a very important principle that rarely gets talked about in SQL. When you're designing a query and breaking it up into CTEs, there is one principle to keep in mind. The CTEs should be constructed in such a way that they can be reused if needed later. This principle makes code easier to maintain and compact.

Let's take a look at the example from the previous chapter:
```sql
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        bigquery-public-data.stackoverflow.post_history ph
        INNER JOIN bigquery-public-data.stackoverflow.users u 
			ON u.id = ph.user_id
    WHERE
        TRUE
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
        AND ph.creation_date >= '2021-06-01' 
        AND ph.creation_date <= '2021-09-30'
    GROUP BY
        1,2,3,4,5
)
```

This CTE performs several operations like aggregation, to decrease granularity of the underlying data, and filtering. Its main purpose is to get a mapping between `user_id` and `post_id` at the right level of granularity so it can be used later.

What's great about this CTE is that we can use it both for generating user metrics as shown here: 
```sql
--code snippet will not actually run
SELECT
    user_id,
    CAST(pa.activity_date AS DATE) AS activity_date,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited  
FROM post_activity pa
     JOIN post_types pt ON pt.post_id = pa.post_id
WHERE user_id = 16366214
GROUP BY 1,2
```

and to join with comments and votes to user level data via the `post_id`
```sql
--code snippet will not actually run
, comments_on_user_post AS (
    SELECT
        pa.user_id,
        CAST(c.creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        bigquery-public-data.stackoverflow.comments c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
        AND c.creation_date >= '2021-06-01' 
        AND c.creation_date <= '2021-09-30'
    GROUP BY
        1,2
)
, votes_on_user_post AS (
      SELECT
        pa.user_id,
        CAST(v.creation_date AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        bigquery-public-data.stackoverflow.votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
        AND v.creation_date >= '2021-06-01' 
        AND v.creation_date <= '2021-09-30'
    GROUP BY
        1,2
)
```

This is at the heart of well-designed CTE. Notice here that we're being very careful about granularity multiplication! If we simply joined with `post_activity` on post_id without specifying the `activity_type` we'd get at least two times the number of rows. Since a post can only be created once, we're pretty safe in getting a single row by filtering.

## DRY Principle
In the previous section we saw how we can decompose a large complex query into multiple smaller components. The main benefit for doing this is that it makes the queries more readable. In that same vein, the DRY (Don't Repeat Yourself) principle ensures that your query is clean from unnecessary repetition.

The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, you should put that code in a CTE and reference that CTE where it's needed.

To illustrate let's rewrite the query from the previous chapter so that it still produces the same result but it clearly shows repeating code
```sql
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        bigquery-public-data.stackoverflow.post_history ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
        TRUE 
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
        AND ph.creation_date >= '2021-06-01' 
        AND ph.creation_date <= '2021-09-30'
    GROUP BY
        1,2,3,4,5
)
, questions AS (
     SELECT
        id AS post_id,
        'question' AS post_type,
        pa.user_id,
        pa.user_name,
        pa.activity_date,
        pa.activity_type
    FROM
        bigquery-public-data.stackoverflow.posts_questions q
        INNER JOIN post_activity pa ON q.id = pa.post_id
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30'
)
, answers AS (
     SELECT
        id AS post_id,
        'answer' AS post_type,
        pa.user_id,
        pa.user_name,
        pa.activity_date,
        pa.activity_type
    FROM
        bigquery-public-data.stackoverflow.posts_answers q
        INNER JOIN post_activity pa ON q.id = pa.post_id
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30'
)
SELECT
    user_id,
    CAST(activity_date AS DATE) AS activity_date,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited 
FROM
    (SELECT * FROM questions
     UNION ALL
     SELECT * FROM answers) AS p
WHERE 
    user_id = 16366214
GROUP BY 1,2;
```

This query will get you the same results as table 3.1 in the previous chapter but as you can see the `questions` and `answers` CTEs both have almost identical code. Imagine if you had to do this for all question types. You'd be copying and pasting a lot of code. Also, the subquery that handles the UNION is not ideal. I'm not a fan of subqueries

Since both questions and answers tables have the exact same schema, a great way to deal with the above problem is by appending their rows using the `UNION` operator like this:
```sql
SELECT
	id AS post_id,
	'question' AS post_type,
FROM
	bigquery-public-data.stackoverflow.posts_questions
WHERE
	TRUE
	AND creation_date >= '2021-06-01' 
	AND creation_date <= '2021-09-30'

UNION ALL

SELECT
	id AS post_id,
	'answer' AS post_type,
FROM
	bigquery-public-data.stackoverflow.posts_answers
WHERE
	TRUE
	AND creation_date >= '2021-06-01' 
	AND creation_date <= '2021-09-30'
 ```

There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, this is the preferred way to append them. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows. This is slower because of the extra operations to find and remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

You can achieve the first requirement by using `SELECT` to choose only the columns that match across multiple tables or if you know the tables have the same exact schema. Note that when you union tables with different schemas, you have to line up all the columns in the right order. This is useful when two tables have the same column named differently.

For example:
```sql
SELECT
	col1 as column_name
FROM
	table1

UNION ALL

SELECT
	col2 as column_name
FROM
	table2
```

As a rule of thumb, when you append tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

### Creating Views
One of the benefits of building reusable CTEs is that if you find yourself copying and pasting the same CTE in multiple places, you can turn it into a view and store it in the database.

Views are great for encapsulating business logic that applies to many queries. They're also used in security applications

Creating a view is easy:
```sql
CREATE OR REPLACE VIEW <view_name> AS
	SELECT col1
	FROM table1
	WHERE col1 > x;
```

Once created you can run:
```sql
SELECT col1
FROM <view_name>
```
This view is now stored in the database but it doesn't take up any space (unless it's materialized) It only stores the query which is executed each time you select from the view or join the view in a query. 

What could be made into a view in our specific query?

I think the `post_types` CTE would be a good candidate. That way whenever you have to combine all the post types you don't have to use that CTE everywhere.
```sql
CREATE OR REPLACE VIEW v_post_types AS
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_questions
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30'
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_answers
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30';
 ```

*Note: In BigQuery views are considered like CTEs so they count towards the maximum level of nesting. That is if you call a view from inside a CTE, that's two levels of nesting and if you then join that CTE in another CTE that's three levels of nesting. BigQuery has a hard limitation on how deep nesting can go beyond which you can no longer run your query. At that point, perhaps the view is best materialized into a table.

So far we've talked about how to optimize queries so they're easy to read, write, understand and maintain. In the next chapter we tackle patterns regarding query performance.